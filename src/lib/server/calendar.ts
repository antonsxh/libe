/**
 * Calendar (weekly log) data access. Layout and totals are pure (`#lib/calendar.ts`).
 */
import { and, asc, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { quests, sessions, tasks } from '#lib/server/db/schema.ts';
import { addDays, type ISODay } from '#lib/dates.ts';
import { dayBounds } from '#lib/manual-log.ts';
import { sessionMinutes } from '#lib/stats-core.ts';
import type { CalendarSession, PickTask } from '#lib/calendar.ts';

export type { PickTask };

/** The server's IANA timezone (`TZ`) — the client lays the calendar out in this zone. */
export function serverTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Completed sessions overlapping the Mon–Sun week starting `monday` (server `TZ`), with task
 * title/done state and quest name/colour joined, oldest first. A session whose `ended_at` is
 * missing spans its logged `duration_min`. The active (running/paused) session is not included —
 * the client draws it live from the timer store.
 */
export async function listWeekSessions(monday: ISODay): Promise<CalendarSession[]> {
	const weekStart = dayBounds(monday).start;
	const weekEnd = dayBounds(addDays(monday, 6)).end;
	const spanEnd = sql`coalesce(${sessions.endedAt}, ${sessions.startedAt} + make_interval(mins => coalesce(${sessions.durationMin}, 0)))`;
	const rows = await db
		.select({
			id: sessions.id,
			taskId: sessions.taskId,
			taskTitle: tasks.title,
			taskDoneAt: tasks.doneAt,
			questId: tasks.questId,
			questName: quests.name,
			questColor: quests.color,
			source: sessions.source,
			startedAt: sessions.startedAt,
			endedAt: sessions.endedAt,
			pausedMs: sessions.pausedMs,
			durationMin: sessions.durationMin
		})
		.from(sessions)
		.innerJoin(tasks, eq(tasks.id, sessions.taskId))
		.leftJoin(quests, eq(quests.id, tasks.questId))
		.where(
			and(
				eq(sessions.state, 'completed'),
				lt(sessions.startedAt, weekEnd),
				sql`${spanEnd} > ${weekStart.toISOString()}::timestamptz`
			)
		)
		.orderBy(asc(sessions.startedAt));

	return rows.map((r): CalendarSession => {
		const loggedMs = Math.round(sessionMinutes(r) * 60_000);
		const startedAt = r.startedAt.getTime();
		let endedAt = r.endedAt?.getTime() ?? startedAt + (r.durationMin ?? 0) * 60_000;
		if (endedAt <= startedAt) endedAt = startedAt + Math.max(loggedMs, 60_000);
		return {
			id: r.id,
			taskId: r.taskId,
			taskTitle: r.taskTitle,
			taskDone: r.taskDoneAt !== null,
			questId: r.questId,
			questName: r.questName,
			questColor: r.questColor,
			source: r.source,
			startedAt,
			endedAt,
			loggedMs
		};
	});
}

/**
 * Tasks the calendar can log time against: every task of the shown week (done or not),
 * the backlog and all open tasks on other days — tasks of closed quests excluded.
 */
export async function listPickTasks(monday: ISODay): Promise<PickTask[]> {
	const sunday = addDays(monday, 6);
	const rows = await db
		.select({
			id: tasks.id,
			title: tasks.title,
			day: tasks.day,
			kind: tasks.kind,
			doneAt: tasks.doneAt,
			questName: quests.name,
			questColor: quests.color
		})
		.from(tasks)
		.leftJoin(quests, eq(quests.id, tasks.questId))
		.where(
			and(
				or(isNull(tasks.questId), isNull(quests.closedAt)),
				or(
					isNull(tasks.day),
					isNull(tasks.doneAt),
					and(gte(tasks.day, monday), lte(tasks.day, sunday))
				)
			)
		)
		.orderBy(
			asc(tasks.day),
			asc(tasks.kind),
			asc(quests.order),
			asc(tasks.order),
			asc(tasks.createdAt)
		);
	return rows.map(({ doneAt, ...t }) => ({ ...t, done: doneAt !== null }));
}
