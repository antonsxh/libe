/**
 * Streak data access: logged minutes per day of every completed session started before today
 * (server `TZ`) → {@link StreakBase}. Bucketing (`loggedMinutesByDay`) has the exact rule of
 * `todayLog()` / `dayWeekMinutes`, so "today counts" on Home and a past streak day agree;
 * today itself comes from `todayLog()` on the client (`pageStreak`), live with the timer.
 *
 * One query over the minimal columns (single user: thousands of rows at most), bucketed in TS
 * rather than grouped in SQL, so the duration rule (span minus pauses, `duration_min` fallback,
 * millisecond precision) is the same code as everywhere else. Called from the root layout
 * `load`, which re-runs only on `refreshAll`.
 */
import { and, eq, lt } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { sessions } from '#lib/server/db/schema.ts';
import { todayISO } from '#lib/dates.ts';
import { dayBounds } from '#lib/manual-log.ts';
import { loggedMinutesByDay } from '#lib/stats-core.ts';
import { streakBase, streakThreshold, type StreakBase } from '#lib/streak.ts';

/** The streak through yesterday for the current goal (`null` = fallback) and rest days. */
export async function loadStreakBase(
	dailyGoalMin: number | null,
	restMask: number
): Promise<StreakBase> {
	const today = todayISO();
	const { start } = dayBounds(today);
	const rows = await db
		.select({
			startedAt: sessions.startedAt,
			endedAt: sessions.endedAt,
			pausedMs: sessions.pausedMs,
			durationMin: sessions.durationMin
		})
		.from(sessions)
		.where(and(eq(sessions.state, 'completed'), lt(sessions.startedAt, start)));
	const threshold = streakThreshold(dailyGoalMin);
	return streakBase({
		minutesByDay: loggedMinutesByDay(rows),
		today,
		threshold: threshold.min,
		fromGoal: threshold.fromGoal,
		restMask
	});
}
