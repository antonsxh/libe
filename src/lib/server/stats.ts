/**
 * Hours per quest, derived from completed sessions joined to their task's quest.
 * Pure bucketing lives in `#lib/stats-core.ts`; only the query is here.
 */
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { sessions, tasks } from '#lib/server/db/schema.ts';
import { todayISO } from '#lib/dates.ts';
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
	/** Hours logged today (completed sessions of every task kind). */
	todayH: number;
	/** Hours logged in the current Mon–Sun week (completed sessions of every task kind). */
	weekH: number;
	/** Logged milliseconds per task id (all completed sessions, keyed by task). */
	byTaskMs: Record<string, number>;
}

/**
 * Totals for the Home header and task cards: hours today / this week and logged time
 * per task. Pure bucketing lives in `#lib/stats-core.ts`.
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

	const { todayMin, weekMin } = dayWeekMinutes(rows, { today: todayISO() });
	return {
		todayH: todayMin / 60,
		weekH: weekMin / 60,
		byTaskMs: Object.fromEntries(loggedMsByTask(rows))
	};
}
