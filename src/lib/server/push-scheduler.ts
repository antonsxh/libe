/**
 * Web Push scheduler for timer phase ends — one `setTimeout` in the single server process
 * (like the timer hub; several instances would each send, guarded only by the DB claim).
 *
 * - Every published timer snapshot (`timer-hub.ts`: start, pause, resume, phase changes,
 *   stop/discard/complete, settings, task deletions → `broadcastTimer`) re-arms it from the
 *   pure `nextPushEvent(snapshot)` — the previous timeout is cancelled.
 * - When it fires it reads the timer (`getTimerSnapshot`): a pomodoro phase end is then rolled
 *   over and published by `server/timer.ts` (`publishPhaseEnd` → sent here); a countdown that
 *   reached its target is sent directly (it keeps running as overtime, nothing rolls over).
 * - Each event is sent at most once: `claimEvent(key)` is an atomic compare-and-set in the DB,
 *   so recomputes, a client's rollover racing the timeout, and restarts never send twice.
 *   A due time in the past (restart, shifted DB times) sends immediately.
 * - Sending is fire-and-forget: a timer request never waits for a push service, and a failing
 *   push only logs.
 */
import { building } from '$app/env';
import { armDelay, nextPushEvent, type PushEvent } from '#lib/push.ts';
import type { TimerSnapshot } from '#lib/timer.ts';
import { getTimerSnapshot } from '#lib/server/timer.ts';
import { subscribePhaseEnd, subscribeTimer } from '#lib/server/timer-hub.ts';
import { claimEvent, hasSubscriptions, sendTimerPush } from '#lib/server/push.ts';

interface Scheduler {
	stop(): void;
}

// Survives module re-evaluation in dev (HMR): a reload stops the old instance first.
const KEY = Symbol.for('libe.pushScheduler');
type Global = typeof globalThis & { [KEY]?: Scheduler };

/** Start (or restart) the scheduler — once per process, from `hooks.server.ts` `init`. */
export function startPushScheduler(): void {
	if (building) return;
	const g = globalThis as Global;
	g[KEY]?.stop();

	let timeout: ReturnType<typeof setTimeout> | null = null;
	/** Key of the event the current timeout waits for (a second due check → retry pacing). */
	let armedKey: string | null = null;
	/** Last key this process claimed — skips the DB for repeated overtime checks. */
	let sentKey: string | null = null;

	const deliver = (event: PushEvent) => {
		if (event.key === sentKey) return;
		void (async () => {
			// Claim first, even with nobody subscribed: a device that subscribes later must not
			// get this (by then stale) event on the next timer change.
			const claimed = await claimEvent(event.key);
			sentKey = event.key;
			if (!claimed || !(await hasSubscriptions())) return;
			await sendTimerPush(event);
		})().catch((err) => console.error('[libe] push: timer notification failed', err));
	};

	const check = async () => {
		timeout = null;
		try {
			// Rolls a pomodoro run over (→ publishPhaseEnd + publishTimer → re-armed below).
			arm(await getTimerSnapshot());
		} catch (err) {
			console.error('[libe] push: timer check failed', err);
			timeout = setTimeout(check, 30_000);
		}
	};

	function arm(snapshot: TimerSnapshot): void {
		if (timeout) clearTimeout(timeout);
		timeout = null;
		const event = nextPushEvent(snapshot);
		if (!event) {
			armedKey = null;
			return;
		}
		const now = Date.now();
		if (event.kind === 'countdownDone' && event.at <= now) {
			// Overtime: nothing rolls over, the event stays "due" — send (once) and stop here.
			armedKey = null;
			deliver(event);
			return;
		}
		const retry = event.at <= now && armedKey === event.key;
		armedKey = event.key;
		timeout = setTimeout(check, armDelay(event, now, retry));
	}

	const offTimer = subscribeTimer(arm);
	const offPhase = subscribePhaseEnd(deliver);
	g[KEY] = {
		stop() {
			offTimer();
			offPhase();
			if (timeout) clearTimeout(timeout);
			timeout = null;
		}
	};
	// Re-arm from the DB: rolls over what ended while the server was down (sent if not yet).
	void check();
}
