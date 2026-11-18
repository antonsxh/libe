/**
 * Weekly review data access: one query for the completed sessions of the previous week, the
 * shown week and its quarter, one for all quests. Bucketing is pure (`#lib/review.ts`).
 */
import { and, asc, eq, gte, lt } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { quests, sessions, tasks } from '#lib/server/db/schema.ts';
import { todayISO, type ISODay } from '#lib/dates.ts';
import { dayBounds } from '#lib/manual-log.ts';
import { buildReview, reviewRange, type Review, type ReviewQuest } from '#lib/review.ts';
import { serverTimeZone } from '#lib/server/calendar.ts';

/** Review of the Mon–Sun week starting `monday` (server `TZ`). */
export async function weeklyReview(monday: ISODay): Promise<Review> {
	const timeZone = serverTimeZone();
	const range = reviewRange(monday);
	const from = dayBounds(range.from, timeZone).start;
	const to = dayBounds(range.to, timeZone).start;

	const [rows, questRows] = await Promise.all([
		db
			.select({
				questId: tasks.questId,
				startedAt: sessions.startedAt,
				endedAt: sessions.endedAt,
				pausedMs: sessions.pausedMs,
				durationMin: sessions.durationMin
			})
			.from(sessions)
			.innerJoin(tasks, eq(tasks.id, sessions.taskId))
			.where(
				and(
					eq(sessions.state, 'completed'),
					gte(sessions.startedAt, from),
					lt(sessions.startedAt, to)
				)
			),
		db
			.select({
				id: quests.id,
				name: quests.name,
				icon: quests.icon,
				color: quests.color,
				weeklyBudgetH: quests.weeklyBudgetH,
				closedAt: quests.closedAt
			})
			.from(quests)
			.orderBy(asc(quests.order), asc(quests.createdAt))
	]);

	const questList: ReviewQuest[] = questRows.map(({ closedAt, ...q }) => ({
		...q,
		closed: closedAt !== null
	}));
	return buildReview(rows, questList, { monday, today: todayISO(timeZone), timeZone });
}
