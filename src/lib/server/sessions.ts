/** Logged sessions of a task: manual entries ("Log time afterwards") and the per-day list. */
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { sessions } from '#lib/server/db/schema.ts';
import { dayBounds } from '#lib/manual-log.ts';
import { sessionMinutes } from '#lib/stats-core.ts';

export interface LoggedSession {
	id: string;
	source: 'focus' | 'manual' | 'pomodoro';
	startedAt: number;
	endedAt: number | null;
	/** Logged minutes (wall time minus pauses). */
	minutes: number;
}

/** Completed sessions of a task that started on `day` (server TZ), oldest first. */
export async function listTaskSessionsOnDay(taskId: string, day: string): Promise<LoggedSession[]> {
	const { start, end } = dayBounds(day);
	const rows = await db
		.select()
		.from(sessions)
		.where(
			and(
				eq(sessions.taskId, taskId),
				eq(sessions.state, 'completed'),
				gte(sessions.startedAt, start),
				lt(sessions.startedAt, end)
			)
		)
		.orderBy(asc(sessions.startedAt));
	return rows.map((s) => ({
		id: s.id,
		source: s.source,
		startedAt: s.startedAt.getTime(),
		endedAt: s.endedAt?.getTime() ?? null,
		minutes: Math.round(sessionMinutes(s))
	}));
}

export async function createManualSession(input: {
	taskId: string;
	startedAt: Date;
	endedAt: Date;
	durationMin: number;
}): Promise<string> {
	const [row] = await db
		.insert(sessions)
		.values({
			taskId: input.taskId,
			state: 'completed',
			startedAt: input.startedAt,
			endedAt: input.endedAt,
			durationMin: input.durationMin,
			source: 'manual'
		})
		.returning({ id: sessions.id });
	return row.id;
}

/** A completed session by id (active ones are owned by the timer). */
export async function getLoggedSession(id: string) {
	const [row] = await db
		.select()
		.from(sessions)
		.where(and(eq(sessions.id, id), eq(sessions.state, 'completed')));
	return row;
}

/**
 * Manual adjustment of a completed session (calendar edit): new task and span. Pauses are
 * kept only when the span is unchanged — an edited span is taken as the time worked.
 * `duration_min` of manual logs follows the span (it is their logged length).
 */
export async function updateLoggedSession(
	id: string,
	input: { taskId: string; startedAt: Date; endedAt: Date; durationMin: number }
): Promise<boolean> {
	const current = await getLoggedSession(id);
	if (!current) return false;
	const sameSpan =
		current.startedAt.getTime() === input.startedAt.getTime() &&
		current.endedAt?.getTime() === input.endedAt.getTime();
	const rows = await db
		.update(sessions)
		.set({
			taskId: input.taskId,
			startedAt: input.startedAt,
			endedAt: input.endedAt,
			pausedMs: sameSpan ? current.pausedMs : 0,
			durationMin: current.source === 'manual' ? input.durationMin : current.durationMin
		})
		.where(and(eq(sessions.id, id), eq(sessions.state, 'completed')))
		.returning({ id: sessions.id });
	return rows.length > 0;
}

/** Delete a *completed* session (an active one is ended via the timer). Returns success. */
export async function deleteLoggedSession(id: string): Promise<boolean> {
	const rows = await db
		.delete(sessions)
		.where(and(eq(sessions.id, id), eq(sessions.state, 'completed')))
		.returning({ id: sessions.id });
	return rows.length > 0;
}
