/**
 * Pure stats bucketing (client-safe, no DB imports). `server/stats.ts` queries completed
 * sessions joined to their task's quest and feeds them through `aggregateQuestStats`.
 * A session is attributed to the calendar day (and therefore week/quarter) of its
 * `started_at` in the server timezone.
 */
import {
	addDays,
	parseDay,
	startOfQuarter,
	startOfWeek,
	todayISO,
	type ISODay
} from '#lib/dates.ts';

const WEEK_MS = 7 * 86_400_000;

export interface SessionRow {
	/** Quest of the task the session belongs to; null for tasks of kind `other`. */
	questId: string | null;
	startedAt: Date;
	endedAt: Date | null;
	pausedMs: number;
	durationMin: number | null;
}

export interface QuestStats {
	/** Hours in the current week (Mon–Sun). */
	weekH: number;
	/** Hours in the current calendar quarter. */
	quarterH: number;
	/** Hours per week for the last `weeks` weeks, oldest first, current week last. */
	weeklyH: number[];
}

export const SPARKLINE_WEEKS = 8;

/** Logged minutes of a completed session: wall time minus pauses, falling back to `durationMin`. */
export function sessionMinutes(
	s: Pick<SessionRow, 'startedAt' | 'endedAt' | 'pausedMs' | 'durationMin'>
): number {
	if (s.endedAt) {
		const ms = s.endedAt.getTime() - s.startedAt.getTime() - s.pausedMs;
		if (ms > 0) return ms / 60000;
	}
	return s.durationMin ?? 0;
}

export interface AggregateOptions {
	/** Reference day in the server timezone, e.g. `todayISO()`. */
	today: ISODay;
	/** IANA timezone used to attribute `startedAt` to a day. Defaults to the runtime timezone. */
	timeZone?: string;
	/** Number of sparkline weeks (current week last). Defaults to {@link SPARKLINE_WEEKS}. */
	weeks?: number;
}

export interface AggregateResult {
	byQuest: Map<string, QuestStats>;
	/** Hours logged this quarter across all sessions, including tasks of kind `other`. */
	quarterTotalH: number;
}

/** Bucket completed sessions into per-quest week/quarter/sparkline hours. */
export function aggregateQuestStats(
	rows: SessionRow[],
	{ today, timeZone, weeks = SPARKLINE_WEEKS }: AggregateOptions
): AggregateResult {
	const thisMonday = startOfWeek(today);
	const oldestMonday = addDays(thisMonday, -7 * (weeks - 1));
	const quarterStart = startOfQuarter(today);
	const oldestMondayMs = parseDay(oldestMonday).getTime();

	interface Acc {
		weekly: number[];
		weekMin: number;
		quarterMin: number;
	}
	const accs = new Map<string, Acc>();
	let totalMin = 0;

	for (const row of rows) {
		const mins = sessionMinutes(row);
		if (mins <= 0) continue;
		const day = todayISO(timeZone, row.startedAt);
		// ISO date strings compare chronologically.
		if (day >= quarterStart) totalMin += mins;
		if (!row.questId) continue;

		let acc = accs.get(row.questId);
		if (!acc)
			accs.set(row.questId, (acc = { weekly: Array(weeks).fill(0), weekMin: 0, quarterMin: 0 }));

		const monday = startOfWeek(day);
		if (monday === thisMonday) acc.weekMin += mins;
		if (day >= quarterStart) acc.quarterMin += mins;
		const idx = Math.round((parseDay(monday).getTime() - oldestMondayMs) / WEEK_MS);
		if (idx >= 0 && idx < weeks) acc.weekly[idx] += mins;
	}

	const byQuest = new Map<string, QuestStats>();
	for (const [questId, acc] of accs) {
		byQuest.set(questId, {
			weekH: acc.weekMin / 60,
			quarterH: acc.quarterMin / 60,
			weeklyH: acc.weekly.map((m) => m / 60)
		});
	}
	return { byQuest, quarterTotalH: totalMin / 60 };
}
