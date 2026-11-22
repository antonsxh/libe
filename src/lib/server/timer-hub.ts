/**
 * In-process pub/sub for timer snapshots (SSE fan-out, push scheduler) and pomodoro phase ends.
 *
 * libe runs as a single server process, so a module-level listener set is enough: every
 * mutation publishes the fresh snapshot to all open `/api/timer/stream` connections. With
 * several processes/instances this would need a shared channel (e.g. Postgres LISTEN/NOTIFY).
 */
import type { TimerSnapshot } from '#lib/timer.ts';
import type { PushEvent } from '#lib/push.ts';

type Listener = (snapshot: TimerSnapshot) => void;

const listeners = new Set<Listener>();

export function subscribeTimer(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function publishTimer(snapshot: TimerSnapshot): void {
	for (const listener of listeners) {
		try {
			listener(snapshot);
		} catch {
			// A broken connection must not stop the others; its stream cleans up on abort.
		}
	}
}

// ─── Phase ends (Web Push) ──────────────────────────────────────────────────

type PhaseEndListener = (event: PushEvent) => void;

const phaseEndListeners = new Set<PhaseEndListener>();

/**
 * A pomodoro phase ended on its own and the rollover was committed (`server/timer.ts` →
 * `materialize`). The push scheduler listens; whoever triggered the rollover (its own timeout,
 * a client's `GET /api/timer`, a mutation) doesn't matter.
 */
export function subscribePhaseEnd(listener: PhaseEndListener): () => void {
	phaseEndListeners.add(listener);
	return () => {
		phaseEndListeners.delete(listener);
	};
}

export function publishPhaseEnd(event: PushEvent): void {
	for (const listener of phaseEndListeners) {
		try {
			listener(event);
		} catch (err) {
			console.error('[libe] phase-end listener failed', err);
		}
	}
}
