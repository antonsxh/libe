import { describe, expect, test } from 'bun:test';
import {
	NIGHTLY_GAP_MS,
	channelOfTag,
	compareVersions,
	dockerTags,
	nextPatch,
	nightlyGate,
	nightlyTargetVersion,
	prereleaseVersion,
	previousTag,
	stableVersion,
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

	test('refuses files without a version field', () => {
		expect(() => withVersion('src-tauri/Cargo.lock', 'name = "x"', '0.1.0')).toThrow();
	});
});
