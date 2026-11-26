/**
 * Hours per quest, derived from completed sessions joined to their task's quest.
 * Pure bucketing lives in `#lib/stats-core.ts`; only the query is here.
 */
import { and, eq, gte, lt } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { sessions, tasks } from '#lib/server/db/schema.ts';
import { todayISO } from '#lib/dates.ts';
import { dayBounds } from '#lib/manual-log.ts';
import type { TodayLog } from '#lib/daily-goal.ts';
import {
	aggregateQuestStats,
	dayWeekMinutes,
	loggedMsByTask,
	SPARKLINE_WEEKS,
	type QuestStats,
	type SessionRow
} from '#lib/stats-core.ts';

export type { QuestStats };
export { SPARKLINE_WEEKS };

export interface HoursSummary {
	/** Per-quest stats keyed by quest id (quests without sessions are absent). */
	byQuest: Record<string, QuestStats>;
	/** Hours logged this quarter across all sessions, including "other" tasks. */
	quarterTotalH: number;
}

/**
 * Weeks Mon–Sun and the calendar quarter containing the server's "today" (`TZ`),
 * plus sparkline hours for the last {@link SPARKLINE_WEEKS} weeks.
 */
export async function questHours(): Promise<HoursSummary> {
	const rows = await db
		.select({
			questId: tasks.questId,
			startedAt: sessions.startedAt,
			endedAt: sessions.endedAt,
			pausedMs: sessions.pausedMs,
			durationMin: sessions.durationMin
		})
		.from(sessions)
		.innerJoin(tasks, eq(tasks.id, sessions.taskId))
		.where(eq(sessions.state, 'completed'));

	const { byQuest, quarterTotalH } = aggregateQuestStats(rows satisfies SessionRow[], {
		today: todayISO(),
		weeks: SPARKLINE_WEEKS
	});
	return { byQuest: Object.fromEntries(byQuest), quarterTotalH };
}

export interface HomeTime {
	/** Hours logged in the current Mon–Sun week (completed sessions of every task kind). */
	weekH: number;
	/** Logged milliseconds per task id (all completed sessions, keyed by task). */
	byTaskMs: Record<string, number>;
}

/**
 * Totals for the Home header and task cards: hours this week and logged time per task
 * ("today" comes from {@link todayLog} via the root layout). Pure bucketing lives in
 * `#lib/stats-core.ts`.
 */
export async function homeTime(): Promise<HomeTime> {
	const rows = await db
		.select({
			taskId: sessions.taskId,
			startedAt: sessions.startedAt,
			endedAt: sessions.endedAt,
			pausedMs: sessions.pausedMs,
			durationMin: sessions.durationMin
		})
		.from(sessions)
		.where(eq(sessions.state, 'completed'));

	const { weekMin } = dayWeekMinutes(rows, { today: todayISO() });
	return {
		weekH: weekMin / 60,
		byTaskMs: Object.fromEntries(loggedMsByTask(rows))
	};
}

/**
 * Minutes logged today — Home's "today" stat and the daily-goal ring (root layout data, every
 * page). Completed sessions of every task kind attributed to the day of their `started_at`
 * in the server timezone (`dayWeekMinutes`, the same rule as the week total); only today's
 * rows are read (`sessions_started_idx`). The active session is not included — clients add
 * its running time from the timer snapshot (`liveLoggedMin`).
 */
export async function todayLog(): Promise<TodayLog> {
	const day = todayISO();
	const { start, end } = dayBounds(day);
	const rows = await db
		.select({
			startedAt: sessions.startedAt,
			endedAt: sessions.endedAt,
			pausedMs: sessions.pausedMs,
			durationMin: sessions.durationMin
		})
		.from(sessions)
		.where(
			and(
				eq(sessions.state, 'completed'),
				gte(sessions.startedAt, start),
				lt(sessions.startedAt, end)
			)
		);
	const { todayMin } = dayWeekMinutes(rows, { today: day });
	return { day, loggedMin: todayMin, start: start.getTime(), end: end.getTime() };
}

export interface QuestDetailTime {
	/** This week's / this quarter's hours of the quest (zero without sessions). */
	weekH: number;
	quarterH: number;
	/** Logged milliseconds per task of the quest. */
	byTaskMs: Record<string, number>;
}

/** Logged time of one quest (the quest detail's summary and its scheduled rows). */
export async function questDetailTime(questId: string): Promise<QuestDetailTime> {
	const rows = await db
		.select({
			taskId: sessions.taskId,
			questId: tasks.questId,
			startedAt: sessions.startedAt,
			endedAt: sessions.endedAt,
			pausedMs: sessions.pausedMs,
			durationMin: sessions.durationMin
		})
		.from(sessions)
		.innerJoin(tasks, eq(tasks.id, sessions.taskId))
		.where(and(eq(sessions.state, 'completed'), eq(tasks.questId, questId)));
	const { byQuest } = aggregateQuestStats(rows, { today: todayISO(), weeks: 1 });
	const stats = byQuest.get(questId);
	return {
		weekH: stats?.weekH ?? 0,
		quarterH: stats?.quarterH ?? 0,
		byTaskMs: Object.fromEntries(loggedMsByTask(rows))
	};
}
