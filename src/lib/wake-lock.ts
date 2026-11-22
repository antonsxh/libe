/**
 * Screen Wake Lock for the Focus screen: keep the display on while a timer is running and
 * the page is visible. Feature-detected and silent — unsupported browsers, a denied request
 * (battery saver, no user activation) or a lost lock never throw or log.
 */

/** Hold the lock? Only while the clock runs (focus or a break) and the page is visible. */
export function shouldHoldWakeLock(
	status: 'running' | 'paused' | 'waiting' | null,
	visibility: DocumentVisibilityState | 'visible' | 'hidden'
): boolean {
	return status === 'running' && visibility === 'visible';
}

/** The bits of `WakeLockSentinel` we use. */
export interface Sentinel {
	readonly released: boolean;
	release(): Promise<void>;
	addEventListener(type: 'release', listener: () => void): void;
}
/** The bits of `navigator` we use. */
export interface WakeLockHost {
	wakeLock?: { request(type: 'screen'): Promise<Sentinel> };
}

/**
 * Keeps one screen lock in line with `set(want)`. The browser drops the lock when the page
 * is hidden; calling `set(true)` again (on `visibilitychange`) re-acquires it.
 */
export class ScreenWakeLock {
	#host: WakeLockHost;
	#sentinel: Sentinel | null = null;
	#want = false;
	#pending: Promise<void> | null = null;

	constructor(host: WakeLockHost) {
		this.#host = host;
	}

	get supported(): boolean {
		return typeof this.#host.wakeLock?.request === 'function';
	}

	get held(): boolean {
		return this.#sentinel !== null && !this.#sentinel.released;
	}

	async set(want: boolean): Promise<void> {
		this.#want = want;
		if (!this.supported) return;
		// One request at a time; the end of it re-checks what is wanted now.
		if (this.#pending) return this.#pending;
		this.#pending = this.#sync().finally(() => (this.#pending = null));
		return this.#pending;
	}

	async #sync(): Promise<void> {
		for (let i = 0; i < 3; i++) {
			if (this.#want && !this.held) {
				try {
					const sentinel = await this.#host.wakeLock!.request('screen');
					sentinel.addEventListener('release', () => {
						if (this.#sentinel === sentinel) this.#sentinel = null;
					});
					this.#sentinel = sentinel;
				} catch {
					return; // denied / not allowed right now — try again on the next change
				}
			} else if (!this.#want && this.#sentinel) {
				const sentinel = this.#sentinel;
				this.#sentinel = null;
				await sentinel.release().catch(() => {});
			} else return;
		}
	}
}
