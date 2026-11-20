/**
 * The libe desktop app (Tauri, `src-tauri/`) as seen from the server's pages.
 *
 * Inside the desktop app the paired server's pages may call exactly six Tauri commands: the
 * updater's `update_state`, `update_check`, `update_set_track`, `update_install` (see
 * `src-tauri/src/updates.rs`), `app_unpair` and `app_quit` (`SERVER_COMMANDS` in
 * `src-tauri/src/lib.rs`; `app_quit` is only used by the app's own Ctrl+Q handler).
 * Everywhere else (browser, PWA, SSR) `desktopApp()` is `null`.
 */

import type { I18n } from '#lib/i18n/index.ts';

export type UpdateTrack = 'stable' | 'nightly';

export const UPDATE_TRACKS: UpdateTrack[] = ['stable', 'nightly'];

/** Mirrors `updates::Phase` (serde `tag = "kind"`). */
export type UpdatePhase =
	| { kind: 'idle' }
	| { kind: 'checking' }
	| { kind: 'upToDate' }
	| { kind: 'downloading'; version: string; downloaded: number; total: number | null }
	| { kind: 'ready'; version: string; needsPassword: boolean }
	| { kind: 'installing'; version: string }
	| ({ kind: 'failed'; message: string } & UpdateErrorInfo)
	| ({ kind: 'unavailable'; reason: string } & UpdateErrorInfo);

/**
 * Stable code (+ parameters) next to the English `message` / `reason` — added in the app
 * version that translated its texts. Older apps send only the English text, so every
 * translation falls back to it for a missing or unknown code.
 */
export type UpdateErrorInfo = {
	code?: string;
	/** Technical detail (updater / OS error), not translated. */
	detail?: string;
	version?: string;
	track?: string;
};

export type UpdateState = {
	/** Version of the running desktop app. */
	version: string;
	track: UpdateTrack;
	phase: UpdatePhase;
	/** Last finished check, ms since the epoch. */
	checkedAt: number | null;
	/**
	 * Set when the app doesn't update itself: `'nix'` for builds of the Nix flake (phase
	 * `unavailable`, code `nixManaged`). No checks, downloads or track switching then.
	 */
	managedBy?: 'nix';
};

export type DesktopApp = {
	state(): Promise<UpdateState>;
	/** Starts a check (and the download of what it finds); poll `state()` for the outcome. */
	check(): Promise<UpdateState>;
	/** Saves the track and looks for its newest build right away. */
	setTrack(track: UpdateTrack): Promise<UpdateState>;
	/** Installs the downloaded update and restarts the app (does not return on success). */
	install(): Promise<void>;
	/**
	 * Revokes this device, forgets the server and shows the app's pairing page (server
	 * pre-filled). The webview leaves the page, so on success this usually never settles.
	 */
	unpair(): Promise<void>;
};

type TauriInternals = { invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> };

export function desktopApp(): DesktopApp | null {
	if (typeof window === 'undefined') return null;
	const tauri = (window as { __TAURI_INTERNALS__?: TauriInternals }).__TAURI_INTERNALS__;
	if (!tauri || typeof tauri.invoke !== 'function') return null;
	const call = <T>(cmd: string, args?: Record<string, unknown>) =>
		tauri.invoke(cmd, args) as Promise<T>;
	return {
		state: () => call('update_state'),
		check: () => call('update_check'),
		setTrack: (track) => call('update_set_track', { track }),
		install: () => call('update_install'),
		unpair: () => call('app_unpair')
	};
}

/** The track a release version belongs to; `null` for previews and development builds. */
export function trackOfVersion(version: string): UpdateTrack | null {
	if (version === '0.0.0' || /-preview\./.test(version)) return null;
	return /-nightly\./.test(version) ? 'nightly' : 'stable';
}

/** While the app is busy, Settings polls quickly; otherwise now and then. */
export const isBusy = (phase: UpdatePhase) =>
	phase.kind === 'checking' || phase.kind === 'downloading' || phase.kind === 'installing';

export function downloadPercent(phase: UpdatePhase): number | null {
	if (phase.kind !== 'downloading' || !phase.total) return null;
	return Math.min(100, Math.floor((phase.downloaded / phase.total) * 100));
}

/** A coded app error in `t`'s language; `fallback` (the app's English text) for unknown codes. */
export function updateErrorText(info: UpdateErrorInfo, fallback: string, t: I18n): string {
	const c = t.desktop.codes;
	const detail = info.detail ?? '';
	switch (info.code) {
		case 'devBuild':
			return c.devBuild;
		case 'unsupportedInstall':
			return c.unsupportedInstall;
		case 'nixManaged':
			return c.nixManaged;
		case 'noRelease':
			return info.track ? c.noRelease(trackName(info.track, t)) : fallback;
		case 'checkFailed':
			return c.checkFailed(detail);
		case 'downloadFailed':
			return info.version ? c.downloadFailed(info.version, detail) : fallback;
		default:
			return fallback;
	}
}

function trackName(track: string, t: I18n): string {
	return track === 'stable' || track === 'nightly' ? t.desktop.tracks[track] : track;
}

/**
 * Error of a rejected `update_*` command. These stay plain English strings in every app
 * version (a structured error would read "[object Object]" on older servers' Settings
 * pages), so the known ones are recognised by their text; anything else is shown as is.
 */
export function commandErrorText(err: unknown, t: I18n): string {
	const raw = String(err);
	const c = t.desktop.codes;
	if (raw === 'An update is being installed.') return c.installing;
	if (raw === 'No update has been downloaded yet.') return c.nothingDownloaded;
	if (raw === 'Updates of this app are managed by Nix.') return c.managedByNix;
	const prefixed: [string, (detail: string) => string][] = [
		['Installing the update failed: ', c.installFailed],
		['Could not save the update track: ', c.saveTrackFailed]
	];
	for (const [prefix, text] of prefixed)
		if (raw.startsWith(prefix)) return text(raw.slice(prefix.length));
	return raw;
}

/**
 * Error of a rejected `app_unpair`. Apps from before the command (they unpair through their
 * menu bar) reject it as "… not allowed …" (Tauri's ACL); anything else is shown with its text.
 */
export function unpairErrorText(err: unknown, t: I18n): string {
	const raw = String(err);
	return /\bnot allowed\b/.test(raw) ? t.desktop.unpairUnsupported : t.desktop.unpairFailed(raw);
}

/** One status line for Settings. */
export function phaseText(phase: UpdatePhase, t: I18n): string {
	const p = t.desktop.phases;
	switch (phase.kind) {
		case 'idle':
			return p.idle;
		case 'checking':
			return p.checking;
		case 'upToDate':
			return p.upToDate;
		case 'downloading':
			return p.downloading(phase.version, downloadPercent(phase));
		case 'ready':
			return phase.needsPassword ? p.readyPassword(phase.version) : p.ready(phase.version);
		case 'installing':
			return p.installing(phase.version);
		case 'failed':
			return updateErrorText(phase, phase.message, t);
		case 'unavailable':
			return updateErrorText(phase, phase.reason, t);
	}
}
