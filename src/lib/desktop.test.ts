import { describe, expect, test } from 'bun:test';
import { desktopApp, downloadPercent, isBusy, phaseText, trackOfVersion } from './desktop.ts';

describe('trackOfVersion', () => {
	test('releases, nightlies, previews and dev builds', () => {
		expect(trackOfVersion('0.2.1')).toBe('stable');
		expect(trackOfVersion('0.3.0-rc.1')).toBe('stable');
		expect(trackOfVersion('0.2.1-nightly.20261119.42')).toBe('nightly');
		expect(trackOfVersion('0.2.1-preview.20261119.43')).toBeNull();
		expect(trackOfVersion('0.0.0')).toBeNull();
	});
});

describe('update phases', () => {
	test('download progress', () => {
		const phase = { kind: 'downloading', version: '0.2.2', downloaded: 512, total: 2048 } as const;
		expect(downloadPercent(phase)).toBe(25);
		expect(downloadPercent({ ...phase, total: null })).toBeNull();
		expect(downloadPercent({ ...phase, downloaded: 4096 })).toBe(100);
		expect(phaseText(phase)).toBe('Downloading libe 0.2.2… 25 %');
		expect(phaseText({ ...phase, total: null })).toBe('Downloading libe 0.2.2…');
	});

	test('busy phases poll quickly', () => {
		expect(isBusy({ kind: 'checking' })).toBe(true);
		expect(isBusy({ kind: 'installing', version: '1.0.0' })).toBe(true);
		expect(isBusy({ kind: 'ready', version: '1.0.0', needsPassword: false })).toBe(false);
		expect(isBusy({ kind: 'upToDate' })).toBe(false);
	});

	test('a .deb install says it needs the password', () => {
		expect(phaseText({ kind: 'ready', version: '0.3.0', needsPassword: true })).toContain(
			'password'
		);
		expect(phaseText({ kind: 'ready', version: '0.3.0', needsPassword: false })).toContain(
			'restart or quit'
		);
	});
});

test('no desktop bridge outside the Tauri app', () => {
	expect(desktopApp()).toBeNull();
});
