/**
 * Release helper for `.github/workflows/release.yml` (see docs/RELEASING.md).
 *
 *   bun scripts/release.ts plan                 decide channel, commit, version, tags → $GITHUB_OUTPUT
 *   bun scripts/release.ts set-version <ver>    write <ver> into package.json, tauri.conf.json, Cargo.toml/.lock
 *   bun scripts/release.ts updater-manifest <dir>  Tauri update manifest for the installers in <dir>
 *                                               (env VERSION, TAG, GH_REPO) → <dir>/latest.json
 *   bun scripts/release.ts nix-commit           in a checkout of the released commit: the commit
 *                                               NixOS users fetch (env VERSION, NIX_TRACK, TAG, REF)
 *   bun scripts/release.ts nix-publish          push that commit to `channel/<track>` + `nix-v<version>`
 *                                               unless the channel already has a newer release
 *
 * Channels:
 *   nightly  automatic (`isAutomaticNightly`): checked after every green CI run on main, on the
 *            schedule (the catch-up; GitHub drops many scheduled runs); publishes only when main moved since the last nightly AND that one is at
 *            least six hours old.
 *            Version `<next patch>-nightly.<YYYYMMDD>.<run>`.
 *   preview  manual test train from any branch. Same versioning under `preview`; the GitHub
 *            release stays a draft and the image only gets its exact version tag.
 *   stable   manual dispatch (promotes the commit of the latest nightly; version defaults to the
 *            one that nightly previewed) or a pushed `vX.Y.Z` tag (builds exactly that commit).
 *
 * Checks: `plan` outputs `verified=true` when the commit already passed `ci.yml` (or, for
 * stable, shipped as a nightly), and release.yml then skips its own run of checks.yml. An
 * automatic nightly waits for CI and never ships a commit whose CI failed (see `checksDecision`).
 *
 * The pure functions are exported for `scripts/release.test.ts`; everything that talks to
 * GitHub goes through the `gh` CLI (GH_TOKEN) and lives below them.
 */
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

export type Channel = 'stable' | 'nightly' | 'preview';

/**
 * Events that start an automatic nightly check: the completion of a `ci.yml` run on main
 * (`workflow_run`) and the schedule. Both go through `nightlyGate`; a dispatched nightly
 * (`workflow_dispatch`, channel=nightly) does not.
 */
export function isAutomaticNightly(event: string): boolean {
	return event === 'workflow_run' || event === 'schedule';
}

/** Minimum time between two nightlies. */
export const NIGHTLY_GAP_MS = 6 * 60 * 60 * 1000;

// ── Versions ──────────────────────────────────────────────────────────────

type Version = { major: number; minor: number; patch: number; pre: (string | number)[] };

const VERSION_RE =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parseVersion(raw: string): Version | null {
	const m = VERSION_RE.exec(raw.replace(/^v/, ''));
	if (!m) return null;
	const pre = m[4] ? m[4].split('.').map((id) => (/^\d+$/.test(id) ? Number(id) : id)) : [];
	return { major: +m[1], minor: +m[2], patch: +m[3], pre };
}

/** SemVer precedence: <0, 0, >0. Throws on invalid input. */
export function compareVersions(a: string, b: string): number {
	const x = parseVersion(a);
	const y = parseVersion(b);
	if (!x || !y) throw new Error(`Cannot compare versions ${a} and ${b}`);
	for (const k of ['major', 'minor', 'patch'] as const) if (x[k] !== y[k]) return x[k] - y[k];
	if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length; // release > prerelease
	for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
		const p = x.pre[i];
		const q = y.pre[i];
		if (p === undefined) return -1;
		if (q === undefined) return 1;
		if (p === q) continue;
		if (typeof p === 'number' && typeof q === 'number') return p - q;
		if (typeof p === 'number') return -1;
		if (typeof q === 'number') return 1;
		return p < q ? -1 : 1;
	}
	return 0;
}

/** The stable version the next prerelease previews: patch + 1 of the last stable one. */
export function nextPatch(current: string): string {
	const v = parseVersion(current);
	if (!v) throw new Error(`Invalid version in package.json: ${current}`);
	return `${v.major}.${v.minor}.${v.patch + 1}`;
}

export function prereleaseVersion(
	base: string,
	channel: 'nightly' | 'preview',
	date: Date,
	run: number
): string {
	const ymd = date.toISOString().slice(0, 10).replaceAll('-', '');
	return `${base}-${channel}.${ymd}.${run}`;
}

/** `v1.2.3` / `1.2.3` / `1.2.3-rc.1` → normalized stable version. Nightly/preview ids are refused. */
export function stableVersion(raw: string): string {
	const version = raw.trim().replace(/^v/, '');
	if (!parseVersion(version)) throw new Error(`Invalid release version: ${raw}`);
	if (channelOfTag(`v${version}`) !== 'stable')
		throw new Error(`${raw} is a nightly/preview version — stable releases need X.Y.Z[-suffix]`);
	return version;
}

/** Plain `X.Y.Z` (no suffix): the only releases marked latest and tagged `stable`/`latest`. */
export const isPlainRelease = (version: string) => parseVersion(version)?.pre.length === 0;

export function channelOfTag(tag: string): Channel | null {
	const v = parseVersion(tag);
	if (!tag.startsWith('v') || !v) return null;
	if (v.pre[0] === 'nightly') return 'nightly';
	if (v.pre[0] === 'preview') return 'preview';
	return 'stable';
}

/** Version of the stable release a nightly tag previews: `v0.2.1-nightly.20261119.4` → `0.2.1`. */
export function nightlyTargetVersion(tag: string): string {
	const v = parseVersion(tag);
	if (!v || channelOfTag(tag) !== 'nightly') throw new Error(`Not a nightly tag: ${tag}`);
	return `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * Tag the generated release notes start from: the newest tag of the same channel that sorts
 * below the current one. Plain stable releases compare with the previous plain stable release
 * (so `v1.3.0` lists everything since `v1.2.0`, not since `v1.3.0-rc.2`).
 */
export function previousTag(tags: string[], channel: Channel, current: string): string | null {
	const candidates = tags.filter((tag) => {
		if (tag === current || channelOfTag(tag) !== channel) return false;
		if (channel === 'stable' && isPlainRelease(current) && !isPlainRelease(tag)) return false;
		return compareVersions(tag, current) < 0;
	});
	candidates.sort(compareVersions);
	return candidates.at(-1) ?? null;
}

export function releaseName(channel: Channel, version: string, shortSha: string): string {
	if (channel === 'stable') return `libe v${version}`;
	if (channel === 'nightly') return `libe Nightly ${version} (${shortSha})`;
	return `libe Preview ${version} (${shortSha}) — test build, do not install`;
}

/**
 * Container image tags per channel:
 *   stable X.Y.Z     X.Y.Z, X.Y, X (from 1.0.0 on), stable, latest
 *   stable X.Y.Z-rc  X.Y.Z-rc (nothing that moves)
 *   nightly          <version>, nightly
 *   preview          <version> only, so nobody ends up on it by accident
 */
export function dockerTags(image: string, channel: Channel, version: string): string[] {
	const v = parseVersion(version);
	if (!v) throw new Error(`Invalid version: ${version}`);
	const tags = [version];
	if (channel === 'nightly') tags.push('nightly');
	if (channel === 'stable' && !v.pre.length) {
		tags.push(`${v.major}.${v.minor}`);
		if (v.major > 0) tags.push(`${v.major}`);
		tags.push('stable', 'latest');
	}
	return tags.map((tag) => `${image}:${tag}`);
}

export type NightlyGate = { release: boolean; reason: string };

/**
 * Whether an automatic run (`isAutomaticNightly`) publishes a nightly. `ahead` is the comparison status of the
 * candidate commit against the last nightly's tag (GitHub compare API: ahead/identical/behind/diverged).
 */
export function nightlyGate(
	last: { tag: string; publishedAt: string } | null,
	now: number,
	status: () => string
): NightlyGate {
	if (!last) return { release: true, reason: 'No published nightly yet.' };
	const age = now - Date.parse(last.publishedAt);
	if (age < NIGHTLY_GAP_MS) {
		const hours = (age / 3_600_000).toFixed(1);
		return { release: false, reason: `${last.tag} is only ${hours} h old (gap: 6 h).` };
	}
	const s = status();
	if (s !== 'ahead') return { release: false, reason: `No new commits since ${last.tag} (${s}).` };
	return { release: true, reason: `New commits since ${last.tag}, and it is older than 6 h.` };
}

// ── Checks already run by CI ─────────────────────────────────────────────

/** A `ci.yml` workflow run (GitHub API `status` / `conclusion`). */
export type CiRun = { status: string; conclusion: string | null };
export type CiState = 'passed' | 'running' | 'failed' | 'none';

/**
 * State of the push-to-main CI runs for one commit. Any successful run (e.g. a re-run after a
 * flake) counts; cancelled/skipped runs count as no run.
 */
export function ciState(runs: CiRun[]): CiState {
	if (runs.some((r) => r.status === 'completed' && r.conclusion === 'success')) return 'passed';
	if (runs.some((r) => r.status !== 'completed')) return 'running';
	const failed = ['failure', 'timed_out', 'startup_failure', 'action_required'];
	if (runs.some((r) => failed.includes(r.conclusion ?? ''))) return 'failed';
	return 'none';
}

export type ChecksDecision = { release: boolean; verified: boolean; reason: string };

/**
 * Whether this release runs checks.yml itself (`verified: false`) or relies on a run that
 * already passed for the same commit (`verified: true`), and whether it releases at all:
 *
 *   preview            always runs the checks (any branch, nothing to rely on)
 *   stable (dispatch)  verified: it promotes a nightly, which only shipped after every check
 *   nightly, tag       verified when `ci.yml` passed on the commit; otherwise runs the checks —
 *                      except an automatic nightly, which waits while CI runs (CI's completion
 *                      triggers the next check) and skips a commit whose CI failed. A dispatched nightly
 *                      refuses a red commit (re-run CI first if it was a flake).
 */
export function checksDecision(channel: Channel, event: string, ci: () => CiState): ChecksDecision {
	if (channel === 'preview')
		return { release: true, verified: false, reason: 'Previews always run the checks.' };
	if (channel === 'stable' && event === 'workflow_dispatch')
		return {
			release: true,
			verified: true,
			reason: 'Promotes a nightly, which passed every check.'
		};
	const state = ci();
	if (state === 'passed')
		return { release: true, verified: true, reason: 'CI passed on this commit; checks skipped.' };
	if (channel === 'nightly' && state === 'failed') {
		if (isAutomaticNightly(event))
			return { release: false, verified: false, reason: 'CI failed on this commit; no nightly.' };
		throw new Error('CI failed on this commit. Fix main (or re-run CI if it was a flake) first.');
	}
	if (channel === 'nightly' && state === 'running' && isAutomaticNightly(event))
		return {
			release: false,
			verified: false,
			reason: 'CI is still running on this commit; its completion triggers the next check.'
		};
	return {
		release: true,
		verified: false,
		reason: `No passed CI run for this commit (${state}); running the checks.`
	};
}

// ── Version files ─────────────────────────────────────────────────────────

export const VERSION_FILES = [
	'package.json',
	'src-tauri/tauri.conf.json',
	'src-tauri/Cargo.toml',
	'src-tauri/Cargo.lock'
] as const;

/** Rewrites the app version inside one of `VERSION_FILES`; throws if the field is missing. */
export function withVersion(file: (typeof VERSION_FILES)[number], text: string, version: string) {
	const patterns: Record<(typeof VERSION_FILES)[number], RegExp> = {
		// first top-level "version" key (indented by one tab/space level)
		'package.json': /^(\s{1,4}"version":\s*")[^"]*(")/m,
		'src-tauri/tauri.conf.json': /^(\s{1,4}"version":\s*")[^"]*(")/m,
		// \r?\n: Windows runners check the repository out with CRLF line endings
		'src-tauri/Cargo.toml': /(\[package\][^[]*?\r?\nversion\s*=\s*")[^"]*(")/,
		'src-tauri/Cargo.lock': /(\[\[package\]\]\r?\nname = "libe"\r?\nversion = ")[^"]*(")/
	};
	if (!parseVersion(version)) throw new Error(`Invalid version: ${version}`);
	const re = patterns[file];
	if (!re.test(text)) throw new Error(`No version field found in ${file}`);
	return text.replace(re, `$1${version}$2`);
}

// ── Desktop update manifest ───────────────────────────────────────────────

/**
 * Release assets of `.github/workflows/desktop.yml` (`libe-desktop-<version>-<os>-<arch><ext>`)
 * → the platform keys of tauri-plugin-updater (`{os}-{arch}-{bundle}`, see
 * `src-tauri/src/updates.rs`). macOS and Windows ship one updatable bundle each, so they also
 * get the plain `{os}-{arch}` key; Linux needs the bundle (an AppImage must not replace a
 * `.deb` install or vice versa).
 */
const UPDATER_TARGETS: Record<string, { os: string; arch: string }> = {
	'linux-x64': { os: 'linux', arch: 'x86_64' },
	'linux-arm64': { os: 'linux', arch: 'aarch64' },
	'macos-arm64': { os: 'darwin', arch: 'aarch64' },
	'macos-x64': { os: 'darwin', arch: 'x86_64' },
	'windows-x64': { os: 'windows', arch: 'x86_64' }
};
const UPDATER_BUNDLES: { ext: string; bundle: string; plainKey: boolean }[] = [
	{ ext: '.AppImage', bundle: 'appimage', plainKey: false },
	{ ext: '.deb', bundle: 'deb', plainKey: false },
	{ ext: '.app.tar.gz', bundle: 'app', plainKey: true },
	{ ext: '-setup.exe', bundle: 'nsis', plainKey: true }
];

export type UpdaterManifest = {
	version: string;
	notes: string;
	pub_date: string;
	platforms: Record<string, { signature: string; url: string }>;
};

/**
 * Builds the update manifest (`latest.json`) from the asset names and their `.sig` files.
 * Throws when an updatable installer has no signature, so a release never announces an
 * update the app would reject.
 */
export function updaterManifest(opts: {
	version: string;
	/** Base URL of the release's assets: `https://github.com/<repo>/releases/download/<tag>`. */
	baseUrl: string;
	files: string[];
	readSignature: (file: string) => string;
	notes: string;
	pubDate: Date;
}): UpdaterManifest {
	const prefix = `libe-desktop-${opts.version}-`;
	const platforms: UpdaterManifest['platforms'] = {};
	for (const file of opts.files) {
		if (!file.startsWith(prefix) || file.endsWith('.sig')) continue;
		const rest = file.slice(prefix.length);
		const kind = UPDATER_BUNDLES.find((b) => rest.endsWith(b.ext));
		if (!kind) continue;
		const target = UPDATER_TARGETS[rest.slice(0, -kind.ext.length)];
		if (!target) throw new Error(`Unknown desktop target in ${file}`);
		if (!opts.files.includes(`${file}.sig`)) throw new Error(`Missing signature ${file}.sig`);
		const entry = {
			signature: opts.readSignature(`${file}.sig`).trim(),
			url: `${opts.baseUrl}/${encodeURIComponent(file)}`
		};
		const key = `${target.os}-${target.arch}`;
		platforms[`${key}-${kind.bundle}`] = entry;
		if (kind.plainKey) platforms[key] = entry;
	}
	if (!Object.keys(platforms).length) throw new Error('No updatable desktop installers found.');
	return {
		version: opts.version,
		notes: opts.notes,
		pub_date: opts.pubDate.toISOString(),
		platforms
	};
}

// ── NixOS channels ────────────────────────────────────────────────────────

/**
 * The Nix channel a release moves (`channel/<track>`, see flake.nix and docs/NIXOS.md):
 * nightlies and plain stable releases — the same releases that reach the desktop update feed.
 * Previews and stable prereleases (`-rc.N`) move nothing.
 */
export function nixTrack(channel: Channel, version: string): 'stable' | 'nightly' | null {
	if (channel === 'nightly') return 'nightly';
	if (channel === 'stable' && isPlainRelease(version)) return 'stable';
	return null;
}

export const nixBranch = (track: 'stable' | 'nightly') => `channel/${track}`;

/** Immutable tag of a release's Nix commit (`nix-v0.2.1`), for flake inputs pinned to it. */
export const nixTag = (version: string) => `nix-v${version}`;

/** `nix/release.json` on a channel commit: marks it as a release build for flake.nix. */
export type NixRelease = {
	version: string;
	channel: 'stable' | 'nightly';
	tag: string;
	commit: string;
};

export function nixReleaseJson(release: NixRelease): string {
	return JSON.stringify(release, null, '\t') + '\n';
}

/**
 * Whether `channel/<track>` may move from the release it points at (`current`, from its
 * `nix/release.json`; null when the branch doesn't exist yet) to `next`. Never backwards: a
 * re-run of an older release's failed Nix job must not undo a newer one.
 */
export function nixChannelMove(current: string | null, next: string): 'move' | 'same' | 'older' {
	if (current === null) return 'move';
	const order = compareVersions(next, current);
	return order > 0 ? 'move' : order === 0 ? 'same' : 'older';
}

// ── GitHub (gh CLI) ───────────────────────────────────────────────────────

function gh(args: string[], { allowFail = false } = {}): string {
	const res = spawnSync('gh', args, { encoding: 'utf8' });
	if (res.status !== 0) {
		if (allowFail) return '';
		throw new Error(`gh ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
	}
	return res.stdout.trim();
}

type ReleaseRow = { tagName: string; publishedAt: string };

/** Published (non-draft) releases, newest first. Drafts have no git tag yet. */
function publishedReleases(): ReleaseRow[] {
	const out = gh([
		'release',
		'list',
		'--exclude-drafts',
		'--limit',
		'500',
		'--json',
		'tagName,publishedAt'
	]);
	return JSON.parse(out || '[]');
}

function latestNightly(releases: ReleaseRow[]): ReleaseRow | null {
	const nightlies = releases.filter((r) => channelOfTag(r.tagName) === 'nightly' && r.publishedAt);
	nightlies.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
	return nightlies[0] ?? null;
}

function compareStatus(repo: string, base: string, head: string): string {
	return gh(['api', `repos/${repo}/compare/${base}...${head}`, '--jq', '.status']);
}

/** `ci.yml` runs triggered by pushes (i.e. to the default branch) of one commit. */
function ciRuns(repo: string, sha: string): CiRun[] {
	const out = gh([
		'api',
		`repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&per_page=20`,
		'--jq',
		'[.workflow_runs[] | {status, conclusion}]'
	]);
	return JSON.parse(out || '[]');
}

function assertOnDefaultBranch(repo: string, sha: string, branch: string) {
	const status = compareStatus(repo, sha, branch);
	if (status !== 'ahead' && status !== 'identical')
		throw new Error(`Commit ${sha} is not contained in ${branch} (${status}).`);
}

// ── Commands ──────────────────────────────────────────────────────────────

function env(name: string, fallback?: string): string {
	const value = process.env[name] || fallback;
	if (value === undefined) throw new Error(`Missing environment variable ${name}`);
	return value;
}

function output(values: Record<string, string>) {
	const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
	for (const line of lines) console.log(line);
	const file = process.env.GITHUB_OUTPUT;
	if (file) appendFileSync(file, lines.join('\n') + '\n');
}

function notice(message: string) {
	console.log(process.env.GITHUB_ACTIONS ? `::notice::${message}` : message);
}

/** Decides what this run releases. Env: see release.yml (`plan` job). */
function plan() {
	const event = env('GITHUB_EVENT_NAME');
	const repo = env('GITHUB_REPOSITORY');
	const sha = env('GITHUB_SHA');
	const defaultBranch = env('DEFAULT_BRANCH');
	const image = env('IMAGE');
	const run = Number(env('GITHUB_RUN_NUMBER'));

	const channel: Channel = isAutomaticNightly(event)
		? 'nightly'
		: event === 'workflow_dispatch'
			? (env('INPUT_CHANNEL', 'preview') as Channel)
			: 'stable';
	if (!['stable', 'nightly', 'preview'].includes(channel))
		throw new Error(`Unknown channel ${channel}`);

	if (event === 'workflow_dispatch' && channel !== 'preview') {
		const ref = env('GITHUB_REF');
		if (ref !== `refs/heads/${defaultBranch}`)
			throw new Error(
				`${channel} releases must be dispatched from ${defaultBranch} (selected ${ref}). Use the preview channel for branch builds.`
			);
	}
	if (channel === 'nightly') assertOnDefaultBranch(repo, sha, defaultBranch);

	const releases = publishedReleases();
	let ref = sha;
	let version: string;

	if (isAutomaticNightly(event)) {
		const last = latestNightly(releases);
		const gate = nightlyGate(
			last && { tag: last.tagName, publishedAt: last.publishedAt },
			Date.now(),
			() => compareStatus(repo, last!.tagName, sha)
		);
		notice(gate.reason);
		if (!gate.release) return output({ release: 'false' });
	}

	if (channel === 'stable') {
		const input = process.env.INPUT_VERSION?.trim();
		if (event === 'workflow_dispatch') {
			// Stable ships what nightly users already ran: the commit of the latest nightly.
			const nightly = latestNightly(releases);
			if (!nightly) throw new Error('No published nightly — a stable release promotes one.');
			ref = gh(['api', `repos/${repo}/commits/${nightly.tagName}`, '--jq', '.sha']);
			assertOnDefaultBranch(repo, ref, defaultBranch);
			version = stableVersion(input || nightlyTargetVersion(nightly.tagName));
			notice(`Stable v${version} builds ${ref}, the commit shipped by ${nightly.tagName}.`);
		} else {
			version = stableVersion(env('GITHUB_REF_NAME'));
		}
		if (releases.some((r) => r.tagName === `v${version}`))
			throw new Error(`Release v${version} already exists.`);
		const newest = releases
			.map((r) => r.tagName)
			.filter((t) => channelOfTag(t) === 'stable' && isPlainRelease(t))
			.sort(compareVersions)
			.at(-1);
		if (newest && compareVersions(version, newest) <= 0)
			throw new Error(`v${version} is not newer than the latest stable release ${newest}.`);
	} else {
		const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
		version = prereleaseVersion(nextPatch(pkg.version), channel, new Date(), run);
	}

	const checks = checksDecision(channel, event, () => ciState(ciRuns(repo, ref)));
	notice(checks.reason);
	if (!checks.release) return output({ release: 'false' });

	const tag = `v${version}`;
	const shortSha = ref.slice(0, 12);
	const plain = channel === 'stable' && isPlainRelease(version);
	output({
		release: 'true',
		verified: String(checks.verified),
		channel,
		ref,
		version,
		tag,
		short_sha: shortSha,
		name: releaseName(channel, version, shortSha),
		previous_tag:
			previousTag(
				releases.map((r) => r.tagName),
				channel,
				tag
			) ?? '',
		prerelease: String(!plain),
		latest: String(plain),
		docker_tags: dockerTags(image, channel, version).join(','),
		nix_track: nixTrack(channel, version) ?? ''
	});
}

function setVersion(version: string) {
	if (!parseVersion(version)) throw new Error(`Invalid version: ${version}`);
	let changed = false;
	for (const file of VERSION_FILES) {
		const before = readFileSync(file, 'utf8');
		const after = withVersion(file, before, version);
		if (after !== before) {
			writeFileSync(file, after);
			changed = true;
		}
	}
	output({ changed: String(changed) });
}

/** Writes `<dir>/latest.json` for the installers in `<dir>`. Env: VERSION, TAG, GH_REPO. */
function writeUpdaterManifest(dir: string) {
	const version = env('VERSION');
	const manifest = updaterManifest({
		version,
		baseUrl: `https://github.com/${env('GH_REPO')}/releases/download/${env('TAG')}`,
		files: readdirSync(dir),
		readSignature: (file) => readFileSync(join(dir, file), 'utf8'),
		notes: `libe ${version}`,
		pubDate: new Date()
	});
	writeFileSync(join(dir, 'latest.json'), JSON.stringify(manifest, null, '\t') + '\n');
	console.log(Object.keys(manifest.platforms).join('\n'));
}

/** Output of a git command; `null` when it failed. */
function tryGit(args: string[], env: Record<string, string> = {}): string | null {
	const res = spawnSync('git', args, { encoding: 'utf8', env: { ...process.env, ...env } });
	return res.status === 0 ? res.stdout.trim() : null;
}

function git(args: string[], env: Record<string, string> = {}): string {
	const out = tryGit(args, env);
	if (out === null) throw new Error(`git ${args.join(' ')} failed.`);
	return out;
}

/**
 * Run in a checkout of the released commit (REF). Commits the release version
 * (`set-version`) and `nix/release.json` on top of it and outputs `commit`: the commit
 * `channel/<track>` will point at. Deterministic (author, committer and dates derive from
 * REF), so the build jobs and the job that pushes the branch each recreate the same commit.
 * A released commit without `flake.nix` (from before the flake) outputs an empty `commit`.
 */
function nixCommit() {
	const version = env('VERSION');
	const track = env('NIX_TRACK') as NixRelease['channel'];
	const ref = env('REF');
	if (track !== 'stable' && track !== 'nightly') throw new Error(`Invalid NIX_TRACK ${track}`);
	if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', `${ref}^{commit}`]))
		throw new Error(`Run nix-commit in a checkout of ${ref}.`);
	if (!existsSync('flake.nix')) {
		notice(`${ref} has no flake.nix (older than the Nix flake): no Nix build for this release.`);
		return output({ commit: '' });
	}
	setVersion(version);
	mkdirSync('nix', { recursive: true });
	writeFileSync(
		'nix/release.json',
		nixReleaseJson({ version, channel: track, tag: env('TAG'), commit: ref })
	);
	const date = `${git(['show', '-s', '--format=%ct', ref])} +0000`;
	const bot = {
		GIT_AUTHOR_NAME: 'github-actions[bot]',
		GIT_AUTHOR_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
		GIT_AUTHOR_DATE: date,
		GIT_COMMITTER_NAME: 'github-actions[bot]',
		GIT_COMMITTER_EMAIL: '41898282+github-actions[bot]@users.noreply.github.com',
		GIT_COMMITTER_DATE: date
	};
	git(['add', '--', ...VERSION_FILES, 'nix/release.json']);
	git(
		[
			'-c',
			'commit.gpgsign=false',
			'commit',
			'--quiet',
			'-m',
			`release: v${version} for NixOS (${nixBranch(track)})`
		],
		bot
	);
	output({ commit: git(['rev-parse', 'HEAD']) });
}

/**
 * Pushes HEAD (the commit from `nix-commit`, already built and in the binary cache) to
 * `channel/<track>` and the tag `nix-v<version>` in one atomic push — unless the channel
 * already points at a newer release (a re-run of an older release). Env: VERSION, NIX_TRACK.
 */
function nixPublish() {
	const version = env('VERSION');
	const track = env('NIX_TRACK') as NixRelease['channel'];
	const branch = nixBranch(track);
	let current: string | null = null;
	if (tryGit(['ls-remote', '--exit-code', '--heads', 'origin', branch]) !== null) {
		git(['fetch', '--quiet', 'origin', `refs/heads/${branch}`]);
		const raw = tryGit(['show', 'FETCH_HEAD:nix/release.json']);
		current = raw ? (JSON.parse(raw) as NixRelease).version : null;
	}
	const move = nixChannelMove(current, version);
	if (move === 'older') {
		notice(`${branch} already has v${current}, newer than v${version}: left as is.`);
		return output({ moved: 'false' });
	}
	git([
		'push',
		'--atomic',
		'origin',
		`+HEAD:refs/heads/${branch}`,
		`HEAD:refs/tags/${nixTag(version)}`
	]);
	notice(`${branch} → v${version} (${git(['rev-parse', 'HEAD'])}).`);
	output({ moved: 'true' });
}

if (import.meta.main) {
	const [command, arg] = process.argv.slice(2);
	try {
		if (command === 'plan') plan();
		else if (command === 'set-version' && arg) setVersion(arg);
		else if (command === 'updater-manifest' && arg) writeUpdaterManifest(arg);
		else if (command === 'nix-commit') nixCommit();
		else if (command === 'nix-publish') nixPublish();
		else {
			console.error(
				'usage: bun scripts/release.ts plan | set-version <version> | updater-manifest <dir> | nix-commit | nix-publish'
			);
			process.exit(2);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(process.env.GITHUB_ACTIONS ? `::error::${message}` : message);
		process.exit(1);
	}
}
