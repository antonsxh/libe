/**
 * The libe desktop app (Tauri, `src-tauri/`) as seen from the server's pages.
 *
 * Inside the desktop app the paired server's pages may call exactly four Tauri commands, all
 * about updating the app (`update_state`, `update_check`, `update_set_track`, `update_install`;
 * see `src-tauri/src/updates.rs`). Everywhere else (browser, PWA, SSR) `desktopApp()` is `null`.
 */

export type UpdateTrack = 'stable' | 'nightly';

export const UPDATE_TRACKS: { value: UpdateTrack; label: string }[] = [
	{ value: 'stable', label: 'Stable' },
	{ value: 'nightly', label: 'Nightly' }
];

/** Mirrors `updates::Phase` (serde `tag = "kind"`). */
export type UpdatePhase =
	| { kind: 'idle' }
	| { kind: 'checking' }
	| { kind: 'upToDate' }
	| { kind: 'downloading'; version: string; downloaded: number; total: number | null }
	| { kind: 'ready'; version: string; needsPassword: boolean }
	| { kind: 'installing'; version: string }
	| { kind: 'failed'; message: string }
	| { kind: 'unavailable'; reason: string };

export type UpdateState = {
	/** Version of the running desktop app. */
	version: string;
	track: UpdateTrack;
	phase: UpdatePhase;
	/** Last finished check, ms since the epoch. */
	checkedAt: number | null;
};

export type DesktopApp = {
	state(): Promise<UpdateState>;
	/** Starts a check (and the download of what it finds); poll `state()` for the outcome. */
	check(): Promise<UpdateState>;
	/** Saves the track and looks for its newest build right away. */
	setTrack(track: UpdateTrack): Promise<UpdateState>;
	/** Installs the downloaded update and restarts the app (does not return on success). */
	install(): Promise<void>;
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
		install: () => call('update_install')
	};
}

/** The track a release version belongs to; `null` for previews and development builds. */
export function trackOfVersion(version: string): UpdateTrack | null {
	if (version === '0.0.0' || /-preview\./.test(version)) return null;
	return /-nightly\./.test(version) ? 'nightly' : 'stable';
}

export const trackLabel = (track: UpdateTrack) => (track === 'stable' ? 'Stable' : 'Nightly');

/** While the app is busy, Settings polls quickly; otherwise now and then. */
export const isBusy = (phase: UpdatePhase) =>
	phase.kind === 'checking' || phase.kind === 'downloading' || phase.kind === 'installing';

export function downloadPercent(phase: UpdatePhase): number | null {
	if (phase.kind !== 'downloading' || !phase.total) return null;
	return Math.min(100, Math.floor((phase.downloaded / phase.total) * 100));
}

/** One status line for Settings. */
export function phaseText(phase: UpdatePhase): string {
	switch (phase.kind) {
		case 'idle':
			return 'Not checked yet.';
		case 'checking':
			return 'Checking for updates…';
		case 'upToDate':
			return 'Up to date.';
		case 'downloading': {
			const pct = downloadPercent(phase);
			return `Downloading libe ${phase.version}…${pct === null ? '' : ` ${pct} %`}`;
		}
		case 'ready':
			return phase.needsPassword
				? `libe ${phase.version} is ready to install (asks for your password).`
				: `libe ${phase.version} is ready. It installs when you restart or quit the app.`;
		case 'installing':
			return `Installing libe ${phase.version}…`;
		case 'failed':
			return phase.message;
		case 'unavailable':
			return phase.reason;
	}
}
