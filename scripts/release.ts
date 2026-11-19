/**
 * Release helper for `.github/workflows/release.yml` (see docs/RELEASING.md).
 *
 *   bun scripts/release.ts plan                 decide channel, commit, version, tags → $GITHUB_OUTPUT
 *   bun scripts/release.ts set-version <ver>    write <ver> into package.json, tauri.conf.json, Cargo.toml/.lock
 *
 * Channels:
 *   nightly  scheduled (hourly check): only when main moved since the last nightly AND that one
 *            is at least six hours old. Version `<next patch>-nightly.<YYYYMMDD>.<run>`.
 *   preview  manual test train from any branch. Same versioning under `preview`; the GitHub
 *            release stays a draft and the image only gets its exact version tag.
 *   stable   manual dispatch (promotes the commit of the latest nightly; version defaults to the
 *            one that nightly previewed) or a pushed `vX.Y.Z` tag (builds exactly that commit).
 *
 * The pure functions are exported for `scripts/release.test.ts`; everything that talks to
 * GitHub goes through the `gh` CLI (GH_TOKEN) and lives below them.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

export type Channel = 'stable' | 'nightly' | 'preview';

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
 * Whether a scheduled run publishes a nightly. `ahead` is the comparison status of the
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

	const channel: Channel =
		event === 'schedule'
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

	if (event === 'schedule') {
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

	const tag = `v${version}`;
	const shortSha = ref.slice(0, 12);
	const plain = channel === 'stable' && isPlainRelease(version);
	output({
		release: 'true',
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
		docker_tags: dockerTags(image, channel, version).join(',')
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

if (import.meta.main) {
	const [command, arg] = process.argv.slice(2);
	try {
		if (command === 'plan') plan();
		else if (command === 'set-version' && arg) setVersion(arg);
		else {
			console.error('usage: bun scripts/release.ts plan | set-version <version>');
			process.exit(2);
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(process.env.GITHUB_ACTIONS ? `::error::${message}` : message);
		process.exit(1);
	}
}
