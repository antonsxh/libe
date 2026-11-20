import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	NIGHTLY_GAP_MS,
	channelOfTag,
	checksDecision,
	isAutomaticNightly,
	ciState,
	compareVersions,
	dockerTags,
	nextPatch,
	nightlyGate,
	nightlyTargetVersion,
	nixBranch,
	nixChannelMove,
	nixReleaseJson,
	nixTag,
	nixTrack,
	prereleaseVersion,
	previousTag,
	stableVersion,
	updaterManifest,
	withVersion
} from './release.ts';

describe('versions', () => {
	test('semver precedence incl. numeric prerelease ids', () => {
		const sorted = [
			'1.0.0',
			'0.2.1-nightly.20261119.10',
			'0.2.1',
			'0.2.1-nightly.20261119.9',
			'0.2.1-nightly.20261120.1',
			'0.2.0',
			'0.2.1-rc.1'
		].sort(compareVersions);
		expect(sorted).toEqual([
			'0.2.0',
			'0.2.1-nightly.20261119.9',
			'0.2.1-nightly.20261119.10',
			'0.2.1-nightly.20261120.1',
			'0.2.1-rc.1',
			'0.2.1',
			'1.0.0'
		]);
	});

	test('prereleases preview the next patch, dated in UTC', () => {
		expect(nextPatch('0.2.0')).toBe('0.2.1');
		expect(prereleaseVersion('0.2.1', 'nightly', new Date('2026-11-19T23:30:00-02:00'), 42)).toBe(
			'0.2.1-nightly.20261120.42'
		);
	});

	test('stable versions refuse nightly/preview ids and garbage', () => {
		expect(stableVersion('v1.2.3')).toBe('1.2.3');
		expect(stableVersion(' 1.2.3-rc.1 ')).toBe('1.2.3-rc.1');
		expect(() => stableVersion('1.2.3-nightly.20261119.1')).toThrow();
		expect(() => stableVersion('1.2')).toThrow();
	});

	test('a nightly tag previews its stable version', () => {
		expect(nightlyTargetVersion('v0.2.1-nightly.20261119.4')).toBe('0.2.1');
		expect(() => nightlyTargetVersion('v0.2.1')).toThrow();
		expect(channelOfTag('v0.2.1-preview.20261119.4')).toBe('preview');
		expect(channelOfTag('update-feed')).toBeNull();
	});
});

describe('previousTag', () => {
	const tags = [
		'v0.1.0',
		'v0.2.0-rc.1',
		'v0.2.0',
		'v0.2.1-nightly.20261118.3',
		'v0.2.1-nightly.20261119.7',
		'v0.2.1-preview.20261119.8',
		'v0.3.0'
	];

	test('stays within its channel', () => {
		expect(previousTag(tags, 'nightly', 'v0.2.1-nightly.20261120.9')).toBe(
			'v0.2.1-nightly.20261119.7'
		);
		expect(previousTag(tags, 'stable', 'v0.2.1')).toBe('v0.2.0');
	});

	test('plain stable skips release candidates, a candidate does not', () => {
		expect(previousTag(tags, 'stable', 'v0.2.0')).toBe('v0.1.0');
		expect(previousTag(tags, 'stable', 'v0.2.0-rc.2')).toBe('v0.2.0-rc.1');
	});

	test('never a newer tag (re-run of an older version)', () => {
		expect(previousTag(tags, 'stable', 'v0.0.9')).toBeNull();
	});
});

describe('dockerTags', () => {
	const img = 'ghcr.io/me/libe';
	test('plain stable moves stable/latest and the version aliases', () => {
		expect(dockerTags(img, 'stable', '1.4.2')).toEqual([
			`${img}:1.4.2`,
			`${img}:1.4`,
			`${img}:1`,
			`${img}:stable`,
			`${img}:latest`
		]);
		expect(dockerTags(img, 'stable', '0.3.0')).toEqual([
			`${img}:0.3.0`,
			`${img}:0.3`,
			`${img}:stable`,
			`${img}:latest`
		]);
	});

	test('candidates and previews move nothing, nightlies move nightly', () => {
		expect(dockerTags(img, 'stable', '1.5.0-rc.1')).toEqual([`${img}:1.5.0-rc.1`]);
		expect(dockerTags(img, 'preview', '1.4.3-preview.20261119.2')).toEqual([
			`${img}:1.4.3-preview.20261119.2`
		]);
		expect(dockerTags(img, 'nightly', '1.4.3-nightly.20261119.2')).toEqual([
			`${img}:1.4.3-nightly.20261119.2`,
			`${img}:nightly`
		]);
	});
});

describe('nightlyGate', () => {
	const now = Date.parse('2026-11-19T12:00:00Z');
	const at = (ms: number) => ({
		tag: 'v0.0.1-nightly.20261119.1',
		publishedAt: new Date(ms).toISOString()
	});
	const fail = () => {
		throw new Error('must not compare');
	};

	test('first nightly always goes out', () => {
		expect(nightlyGate(null, now, fail).release).toBe(true);
	});

	test('waits six hours, without even comparing commits', () => {
		expect(nightlyGate(at(now - NIGHTLY_GAP_MS + 60_000), now, fail).release).toBe(false);
	});

	test('after the gap only when main moved', () => {
		const old = at(now - NIGHTLY_GAP_MS);
		expect(nightlyGate(old, now, () => 'ahead').release).toBe(true);
		expect(nightlyGate(old, now, () => 'identical').release).toBe(false);
		expect(nightlyGate(old, now, () => 'diverged').release).toBe(false);
	});
});

describe('withVersion', () => {
	test('rewrites only the app version', () => {
		const pkg =
			'{\n\t"name": "libe",\n\t"version": "0.0.0",\n\t"devDependencies": {\n\t\t"x": { "version": "9" }\n\t}\n}';
		expect(withVersion('package.json', pkg, '0.1.0')).toContain('"version": "0.1.0"');
		expect(withVersion('package.json', pkg, '0.1.0')).toContain('"version": "9"');

		const toml =
			'[package]\nname = "libe"\nversion = "0.0.0"\n\n[dependencies]\nfoo = { version = "1" }\n';
		expect(withVersion('src-tauri/Cargo.toml', toml, '1.2.3-nightly.20261119.4')).toBe(
			toml.replace('0.0.0', '1.2.3-nightly.20261119.4')
		);

		const lock =
			'[[package]]\nname = "libc"\nversion = "0.2.0"\n\n[[package]]\nname = "libe"\nversion = "0.0.0"\n';
		expect(withVersion('src-tauri/Cargo.lock', lock, '0.1.0')).toBe(
			lock.replace('"0.0.0"', '"0.1.0"')
		);
	});

	test('works on CRLF checkouts (Windows runners)', () => {
		const crlf = (t: string) => t.replaceAll('\n', '\r\n');
		const lock = crlf('[[package]]\nname = "libe"\nversion = "0.0.0"\n');
		expect(withVersion('src-tauri/Cargo.lock', lock, '0.1.0')).toBe(lock.replace('0.0.0', '0.1.0'));
		const toml = crlf('[package]\nname = "libe"\nversion = "0.0.0"\n');
		expect(withVersion('src-tauri/Cargo.toml', toml, '0.1.0')).toBe(toml.replace('0.0.0', '0.1.0'));
		const pkg = crlf('{\n\t"name": "libe",\n\t"version": "0.0.0"\n}');
		expect(withVersion('package.json', pkg, '0.1.0')).toBe(pkg.replace('0.0.0', '0.1.0'));
	});

	test('refuses files without a version field', () => {
		expect(() => withVersion('src-tauri/Cargo.lock', 'name = "x"', '0.1.0')).toThrow();
	});
});

describe('updaterManifest', () => {
	const version = '0.2.1-nightly.20261119.42';
	const p = `libe-desktop-${version}-`;
	const installers = [
		`${p}linux-x64.AppImage`,
		`${p}linux-x64.deb`,
		`${p}linux-arm64.AppImage`,
		`${p}linux-arm64.deb`,
		`${p}macos-arm64.app.tar.gz`,
		`${p}macos-arm64.dmg`,
		`${p}macos-x64.app.tar.gz`,
		`${p}windows-x64-setup.exe`
	];
	const signed = installers.filter((f) => !f.endsWith('.dmg'));
	const files = [...installers, ...signed.map((f) => `${f}.sig`), 'SHA256SUMS'];
	const base = 'https://github.com/o/libe/releases/download/v' + version;
	const build = (list = files) =>
		updaterManifest({
			version,
			baseUrl: base,
			files: list,
			readSignature: (f) => `sig:${f}\n`,
			notes: 'n',
			pubDate: new Date('2026-11-19T12:00:00Z')
		});

	test('maps every updatable installer to its platform keys', () => {
		const m = build();
		expect(m.version).toBe(version);
		expect(m.pub_date).toBe('2026-11-19T12:00:00.000Z');
		expect(Object.keys(m.platforms).sort()).toEqual([
			'darwin-aarch64',
			'darwin-aarch64-app',
			'darwin-x86_64',
			'darwin-x86_64-app',
			'linux-aarch64-appimage',
			'linux-aarch64-deb',
			'linux-x86_64-appimage',
			'linux-x86_64-deb',
			'windows-x86_64',
			'windows-x86_64-nsis'
		]);
		expect(m.platforms['linux-x86_64-deb']).toEqual({
			signature: `sig:${p}linux-x64.deb.sig`,
			url: `${base}/${p}linux-x64.deb`
		});
		expect(m.platforms['darwin-aarch64'].url).toBe(`${base}/${p}macos-arm64.app.tar.gz`);
		expect(m.platforms['windows-x86_64-nsis'].url).toBe(`${base}/${p}windows-x64-setup.exe`);
	});

	test('refuses unsigned installers and empty releases', () => {
		expect(() => build(files.filter((f) => f !== `${p}linux-x64.deb.sig`))).toThrow(/signature/);
		expect(() => build(['SHA256SUMS'])).toThrow(/No updatable/);
	});

	test('ignores files of other versions', () => {
		const m = build([...files, 'libe-desktop-0.1.0-linux-x64.AppImage']);
		expect(m.platforms['linux-x86_64-appimage'].url).toContain(version);
	});
});

describe('ciState', () => {
	const run = (status: string, conclusion: string | null = null) => ({ status, conclusion });

	test('any successful run counts, even next to a failed attempt', () => {
		expect(ciState([run('completed', 'failure'), run('completed', 'success')])).toBe('passed');
	});

	test('running beats failed; cancelled/skipped/no runs are none', () => {
		expect(ciState([run('completed', 'failure'), run('in_progress')])).toBe('running');
		expect(ciState([run('queued')])).toBe('running');
		expect(ciState([run('completed', 'timed_out')])).toBe('failed');
		expect(ciState([run('completed', 'cancelled'), run('completed', 'skipped')])).toBe('none');
		expect(ciState([])).toBe('none');
	});
});

describe('checksDecision', () => {
	const never = () => {
		throw new Error('CI must not be queried');
	};

	test('previews always run the checks; stable dispatch relies on its nightly', () => {
		expect(checksDecision('preview', 'workflow_dispatch', never)).toMatchObject({
			release: true,
			verified: false
		});
		expect(checksDecision('stable', 'workflow_dispatch', never)).toMatchObject({
			release: true,
			verified: true
		});
	});

	test('a passed CI run skips the checks for nightlies and tags', () => {
		for (const [channel, event] of [
			['nightly', 'schedule'],
			['nightly', 'workflow_dispatch'],
			['stable', 'push']
		] as const)
			expect(checksDecision(channel, event, () => 'passed')).toMatchObject({
				release: true,
				verified: true
			});
	});

	test('an automatic nightly waits for running CI and skips a red commit', () => {
		for (const event of ['schedule', 'workflow_run']) {
			expect(checksDecision('nightly', event, () => 'running').release).toBe(false);
			expect(checksDecision('nightly', event, () => 'failed').release).toBe(false);
			expect(checksDecision('nightly', event, () => 'none')).toMatchObject({
				release: true,
				verified: false
			});
		}
	});

	test('a dispatched nightly refuses a red commit, runs the checks otherwise', () => {
		expect(() => checksDecision('nightly', 'workflow_dispatch', () => 'failed')).toThrow(
			/CI failed/
		);
		for (const state of ['running', 'none'] as const)
			expect(checksDecision('nightly', 'workflow_dispatch', () => state)).toMatchObject({
				release: true,
				verified: false
			});
	});

	test('a tag without passed CI runs the checks itself', () => {
		for (const state of ['running', 'failed', 'none'] as const)
			expect(checksDecision('stable', 'push', () => state)).toMatchObject({
				release: true,
				verified: false
			});
	});
});

describe('isAutomaticNightly', () => {
	test('CI completion and the schedule are automatic; dispatches and tags are not', () => {
		for (const event of ['workflow_run', 'schedule']) expect(isAutomaticNightly(event)).toBe(true);
		expect(isAutomaticNightly('workflow_dispatch')).toBe(false);
		expect(isAutomaticNightly('push')).toBe(false);
	});
});

describe('NixOS channels', () => {
	test('nightlies and plain stable releases move a channel; previews and -rc never', () => {
		expect(nixTrack('nightly', '0.2.1-nightly.20261119.42')).toBe('nightly');
		expect(nixTrack('stable', '0.2.1')).toBe('stable');
		expect(nixTrack('stable', '0.3.0-rc.1')).toBeNull();
		expect(nixTrack('preview', '0.2.1-preview.20261119.43')).toBeNull();
		expect(nixBranch('stable')).toBe('channel/stable');
		expect(nixBranch('nightly')).toBe('channel/nightly');
		expect(nixTag('0.2.1-nightly.20261119.42')).toBe('nix-v0.2.1-nightly.20261119.42');
	});

	test('a channel only moves forward', () => {
		expect(nixChannelMove(null, '0.2.1')).toBe('move');
		expect(nixChannelMove('0.2.0', '0.2.1')).toBe('move');
		expect(nixChannelMove('0.2.1', '0.2.1')).toBe('same');
		expect(nixChannelMove('0.2.2', '0.2.1')).toBe('older');
		// run numbers compare numerically
		expect(nixChannelMove('0.2.1-nightly.20261119.99', '0.2.1-nightly.20261119.100')).toBe('move');
		expect(nixChannelMove('0.2.1-nightly.20261120.5', '0.2.1-nightly.20261119.100')).toBe('older');
	});

	test('nix-commit recreates the same channel commit in every job; nix-publish moves forward only', () => {
		const root = mkdtempSync(join(tmpdir(), 'libe-nix-commit-'));
		const script = join(import.meta.dir, 'release.ts');
		const run = (cwd: string, cmd: string, args: string[], env: Record<string, string> = {}) => {
			const res = spawnSync(cmd, args, {
				cwd,
				encoding: 'utf8',
				env: { ...process.env, GITHUB_OUTPUT: '', GITHUB_ACTIONS: '', ...env }
			});
			if (res.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${res.stderr}`);
			return res.stdout.trim();
		};
		try {
			const origin = join(root, 'origin');
			mkdirSync(join(origin, 'src-tauri'), { recursive: true });
			const files: Record<string, string> = {
				'package.json': '{\n\t"name": "libe",\n\t"version": "0.2.0"\n}\n',
				'src-tauri/tauri.conf.json': '{\n\t"productName": "libe",\n\t"version": "0.2.0"\n}\n',
				'src-tauri/Cargo.toml': '[package]\nname = "libe"\nversion = "0.2.0"\n',
				'src-tauri/Cargo.lock': '[[package]]\nname = "libe"\nversion = "0.2.0"\n',
				'flake.nix': '{ outputs = _: { }; }\n'
			};
			for (const [file, text] of Object.entries(files)) writeFileSync(join(origin, file), text);
			run(origin, 'git', ['init', '--quiet', '--initial-branch=main']);
			run(origin, 'git', ['add', '-A']);
			run(origin, 'git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init']);
			const ref = run(origin, 'git', ['rev-parse', 'HEAD']);
			const env = {
				VERSION: '0.2.1-nightly.20261119.42',
				NIX_TRACK: 'nightly',
				TAG: 'v0.2.1-nightly.20261119.42',
				REF: ref
			};
			const commits = ['a', 'b'].map((name) => {
				const dir = join(root, name);
				run(root, 'git', ['clone', '--quiet', origin, dir]);
				const out = run(dir, 'bun', [script, 'nix-commit'], env);
				return { dir, commit: /^commit=(\w+)$/m.exec(out)?.[1] };
			});
			expect(commits[0].commit).toMatch(/^[0-9a-f]{40}$/);
			expect(commits[1].commit).toBe(commits[0].commit!);
			const dir = commits[0].dir;
			expect(run(dir, 'git', ['rev-parse', 'HEAD^'])).toBe(ref);
			expect(run(dir, 'git', ['status', '--porcelain'])).toBe('');
			expect(readFileSync(join(dir, 'nix/release.json'), 'utf8')).toBe(
				nixReleaseJson({
					version: env.VERSION,
					channel: 'nightly',
					tag: env.TAG,
					commit: ref
				})
			);
			for (const file of ['package.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.lock'])
				expect(readFileSync(join(dir, file), 'utf8')).toContain(env.VERSION);

			// nix-publish: branch + tag in one push …
			expect(run(dir, 'bun', [script, 'nix-publish'], env)).toContain('moved=true');
			expect(run(origin, 'git', ['rev-parse', 'channel/nightly'])).toBe(commits[0].commit!);
			expect(run(origin, 'git', ['rev-parse', `nix-v${env.VERSION}^{commit}`])).toBe(
				commits[0].commit!
			);
			// … and never back to an older release (a re-run of an older release's job).
			const older = {
				...env,
				VERSION: '0.2.1-nightly.20261119.41',
				TAG: 'v0.2.1-nightly.20261119.41'
			};
			const c = join(root, 'c');
			run(root, 'git', ['clone', '--quiet', origin, c]);
			run(c, 'bun', [script, 'nix-commit'], older);
			expect(run(c, 'bun', [script, 'nix-publish'], older)).toContain('moved=false');
			expect(run(origin, 'git', ['rev-parse', 'channel/nightly'])).toBe(commits[0].commit!);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
