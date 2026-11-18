/**
 * In-process pub/sub for timer snapshots (SSE fan-out).
 *
 * libe runs as a single server process, so a module-level listener set is enough: every
 * mutation publishes the fresh snapshot to all open `/api/timer/stream` connections. With
 * several processes/instances this would need a shared channel (e.g. Postgres LISTEN/NOTIFY).
 */
import type { TimerSnapshot } from '#lib/timer.ts';

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
