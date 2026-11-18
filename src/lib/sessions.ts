/**
 * Pure session-timing helpers (client-safe, no DB imports).
 * A live timer can compute the current elapsed time of a running/paused session server-side
 * from the row alone, because `paused_at` marks the start of the current pause.
 */

export interface SessionTiming {
	state: string;
	startedAt: Date;
	/** Sum of finished pauses in ms. */
	pausedMs: number;
	/** Start of the current pause while `state === 'paused'`. */
	pausedAt?: Date | null;
	endedAt?: Date | null;
}

/**
 * Elapsed running time in ms: `(ended_at ?? now) − started_at − paused_ms
 * − (state === 'paused' && paused_at ? now − paused_at : 0)`. Never negative.
 */
export function sessionElapsedMs(session: SessionTiming, now: Date = new Date()): number {
	const end = (session.endedAt ?? now).getTime();
	const livePause =
		session.state === 'paused' && session.pausedAt ? now.getTime() - session.pausedAt.getTime() : 0;
	return Math.max(0, end - session.startedAt.getTime() - session.pausedMs - livePause);
}
