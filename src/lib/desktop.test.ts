import { describe, expect, test } from 'bun:test';
import { i18n } from '#lib/i18n/index.ts';
import {
	commandErrorText,
	desktopApp,
	downloadPercent,
	isBusy,
	phaseText as phaseTextIn,
	trackOfVersion,
	type UpdatePhase
} from './desktop.ts';

const en = i18n('en');
const de = i18n('de');
const phaseText = (phase: UpdatePhase) => phaseTextIn(phase, en);

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

describe('app errors in the UI language', () => {
	test('coded phases are translated, the English text is the fallback', () => {
		const failed = {
			kind: 'failed',
			message: 'No nightly release is published yet.',
			code: 'noRelease',
			track: 'nightly'
		} as const;
		expect(phaseTextIn(failed, de)).toBe('Es ist noch kein Nightly-Release veröffentlicht.');
		expect(phaseTextIn(failed, en)).toBe('No Nightly release is published yet.');
		expect(
			phaseTextIn(
				{
					kind: 'failed',
					message: 'Downloading libe 1.2.0 failed: timeout',
					code: 'downloadFailed',
					version: '1.2.0',
					detail: 'timeout'
				},
				de
			)
		).toBe('Der Download von libe 1.2.0 ist fehlgeschlagen: timeout');
		expect(phaseTextIn({ kind: 'unavailable', reason: 'x', code: 'devBuild' }, de)).toBe(
			'Entwicklungs-Builds aktualisieren sich nicht selbst.'
		);
	});

	test('older apps (no code) and unknown codes show the app’s own text', () => {
		expect(phaseTextIn({ kind: 'failed', message: 'Something broke.' }, de)).toBe(
			'Something broke.'
		);
		expect(
			phaseTextIn({ kind: 'unavailable', reason: 'Not here.', code: 'fromTheFuture' }, de)
		).toBe('Not here.');
		expect(phaseTextIn({ kind: 'failed', message: 'Oops', code: 'noRelease' }, de)).toBe('Oops');
	});

	test('command errors are recognised by their (stable) English text', () => {
		expect(commandErrorText('No update has been downloaded yet.', de)).toBe(
			'Es wurde noch kein Update heruntergeladen.'
		);
		expect(commandErrorText('Installing the update failed: denied', de)).toBe(
			'Die Installation des Updates ist fehlgeschlagen: denied'
		);
		expect(commandErrorText('Something new', de)).toBe('Something new');
		expect(commandErrorText(new Error('x'), en)).toBe('Error: x');
	});
});

test('no desktop bridge outside the Tauri app', () => {
	expect(desktopApp()).toBeNull();
});
