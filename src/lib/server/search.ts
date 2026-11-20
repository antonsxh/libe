/**
 * Command palette search (`GET /api/search?q=`): open quests and not-done tasks whose title or
 * quest name contains the query (case-insensitive `ILIKE`, wildcards escaped). Returns data
 * only — the client labels it.
 *
 * Tasks are the stored rows (a recurring task is one row). A backlog task is only found while
 * its quest is open (closed quests' backlogs are hidden everywhere); scheduled tasks are found
 * like Home/Plan show them, whatever their quest's state.
 */
import { and, asc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { quests, tasks } from '#lib/server/db/schema.ts';
import { todayISO } from '#lib/dates.ts';
import {
	SEARCH_GROUP_LIMIT,
	escapeLike,
	normalizeQuery,
	rankQuests,
	rankTasks
} from '#lib/palette.ts';

/** Matching rows fetched before ranking (prefix matches first, so the cap drops the weakest). */
const CANDIDATES = 200;

export interface SearchQuest {
	id: string;
	name: string;
	icon: string;
	color: string;
}

export interface SearchTask {
	id: string;
	title: string;
	/** ISO day; null = backlog. */
	day: string | null;
	kind: 'quest' | 'other';
	questName: string | null;
	questColor: string | null;
}

export interface SearchResult {
	/** The normalised query the results belong to. */
	q: string;
	/** Server "today" (TZ) — the client labels days and picks targets relative to it. */
	today: string;
	quests: SearchQuest[];
	tasks: SearchTask[];
}

export async function search(raw: unknown): Promise<SearchResult> {
	const q = normalizeQuery(raw);
	const today = todayISO();
	if (!q) return { q, today, quests: [], tasks: [] };

	const contains = `%${escapeLike(q)}%`;
	const prefix = `${escapeLike(q)}%`;

	const [questRows, taskRows] = await Promise.all([
		db
			.select({ id: quests.id, name: quests.name, icon: quests.icon, color: quests.color })
			.from(quests)
			.where(and(isNull(quests.closedAt), ilike(quests.name, contains)))
			.orderBy(asc(quests.order), asc(quests.createdAt))
			.limit(CANDIDATES),
		db
			.select({
				id: tasks.id,
				title: tasks.title,
				day: tasks.day,
				kind: tasks.kind,
				questName: quests.name,
				questColor: quests.color
			})
			.from(tasks)
			.leftJoin(quests, eq(quests.id, tasks.questId))
			.where(
				and(
					isNull(tasks.doneAt),
					or(ilike(tasks.title, contains), ilike(quests.name, contains)),
					or(isNotNull(tasks.day), isNull(quests.closedAt))
				)
			)
			.orderBy(sql`(${tasks.title} ilike ${prefix}) desc`, asc(tasks.title))
			.limit(CANDIDATES)
	]);

	return {
		q,
		today,
		quests: rankQuests(questRows, q, SEARCH_GROUP_LIMIT),
		tasks: rankTasks(taskRows, q, today, SEARCH_GROUP_LIMIT)
	};
}
