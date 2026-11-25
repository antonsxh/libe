/**
 * Task data access — generic so later milestones (day lists, "other" list, plan board)
 * can reuse it. A task's *list* is
 *   - scheduled (day set): all tasks of the same kind on that day — quest work of every quest
 *     shares one list, exactly as Home/Plan show it;
 *   - backlog (day null): the tasks of one quest (or all "other" tasks) without a day.
 * Top/bottom inserts and move up/down operate within that list only.
 */
import {
	and,
	asc,
	count,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	or,
	sql
} from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { quests, tasks, type Task } from '#lib/server/db/schema.ts';
import { dropIntoList, moveWithinGroup, orderAtBottom, orderAtTop } from '#lib/ordering.ts';
import { addDays } from '#lib/dates.ts';
import { appendOrders } from '#lib/overdue.ts';
import { broadcastTimer } from '#lib/server/timer.ts';

export type MoveDirection = 'up' | 'down';
export type ListPosition = 'top' | 'bottom';
export type TaskKind = 'quest' | 'other';

export interface TaskInput {
	title: string;
	description?: string;
	/** Planned minutes; null/undefined = unset. */
	durationMin?: number | null;
	/** ISO day; null/undefined = backlog. */
	day?: string | null;
}

export type TaskTarget = { kind: 'quest'; questId: string } | { kind: 'other' };

export async function getTask(id: string): Promise<Task | undefined> {
	const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
	return task;
}

/** A task joined with its quest's name/colour (both null for tasks of kind `other`). */
export interface TaskWithQuest extends Task {
	questName: string | null;
	questColor: string | null;
}

const taskWithQuestSelect = { task: tasks, questName: quests.name, questColor: quests.color };

function flattenTask(row: { task: Task; questName: string | null; questColor: string | null }) {
	return { ...row.task, questName: row.questName, questColor: row.questColor };
}

/** One task with its quest's name/colour. */
export async function getTaskWithQuest(id: string): Promise<TaskWithQuest | undefined> {
	const [row] = await db
		.select(taskWithQuestSelect)
		.from(tasks)
		.leftJoin(quests, eq(quests.id, tasks.questId))
		.where(eq(tasks.id, id));
	return row ? flattenTask(row) : undefined;
}

/** Open ("today") tasks of one kind for a day, in list order, with the quest joined. */
export async function listDayTasks(day: string, kind: TaskKind): Promise<TaskWithQuest[]> {
	const rows = await db
		.select(taskWithQuestSelect)
		.from(tasks)
		.leftJoin(quests, eq(quests.id, tasks.questId))
		.where(and(eq(tasks.day, day), eq(tasks.kind, kind)))
		.orderBy(asc(tasks.order), asc(tasks.createdAt));
	return rows.map(flattenTask);
}

/** Backlog tasks (day = null) of all open quests, grouped by quest order then list order. */
export async function listOpenBacklog(): Promise<TaskWithQuest[]> {
	const rows = await db
		.select(taskWithQuestSelect)
		.from(tasks)
		.innerJoin(quests, eq(quests.id, tasks.questId))
		.where(and(isNull(tasks.day), isNull(quests.closedAt)))
		.orderBy(asc(quests.order), asc(quests.createdAt), asc(tasks.order), asc(tasks.createdAt));
	return rows.map(flattenTask);
}

/** Backlog tasks of kind `other` (no quest, no day), in list order. */
export async function listOtherBacklog(): Promise<TaskWithQuest[]> {
	const rows = await db
		.select(taskWithQuestSelect)
		.from(tasks)
		.leftJoin(quests, eq(quests.id, tasks.questId))
		.where(and(isNull(tasks.day), eq(tasks.kind, 'other')))
		.orderBy(asc(tasks.order), asc(tasks.createdAt));
	return rows.map(flattenTask);
}

/** Every task scheduled Mon–Sun of the week starting `monday`, quest joined, by day then list order. */
export async function listWeekTasks(monday: string): Promise<TaskWithQuest[]> {
	const rows = await db
		.select(taskWithQuestSelect)
		.from(tasks)
		.leftJoin(quests, eq(quests.id, tasks.questId))
		.where(and(gte(tasks.day, monday), lte(tasks.day, addDays(monday, 6))))
		.orderBy(asc(tasks.day), asc(tasks.order), asc(tasks.createdAt));
	return rows.map(flattenTask);
}

/**
 * SQL twin of `isOverdue` (`#lib/overdue.ts`): planned before `today`, not done, and of kind
 * `other` or of an open quest. Needs `quests` left-joined on the task's quest.
 */
function overdueCondition(today: string) {
	return and(
		lt(tasks.day, today),
		isNull(tasks.doneAt),
		or(eq(tasks.kind, 'other'), isNull(quests.closedAt))
	);
}

/**
 * Overdue tasks (see `#lib/overdue.ts`) with the quest joined, in display order: most recent
 * day first, then list order (`compareOverdue`).
 */
export async function listOverdue(today: string): Promise<TaskWithQuest[]> {
	const rows = await db
		.select(taskWithQuestSelect)
		.from(tasks)
		.leftJoin(quests, eq(quests.id, tasks.questId))
		.where(overdueCondition(today))
		.orderBy(desc(tasks.day), asc(tasks.order), asc(tasks.createdAt));
	return rows.map(flattenTask);
}

/**
 * Root layout counts in one query on `tasks_day_idx`: `overdue` (the nav dot) and `badge` =
 * today's open tasks + overdue ones (the app icon badge, also sent in push payloads). Both
 * leave out closed quests' tasks, like the lists.
 */
export async function taskCounts(today: string): Promise<{ overdue: number; badge: number }> {
	const [row] = await db
		.select({
			badge: count(),
			overdue: sql<number>`count(*) filter (where ${tasks.day} < ${today})`.mapWith(Number)
		})
		.from(tasks)
		.leftJoin(quests, eq(quests.id, tasks.questId))
		.where(
			and(
				lte(tasks.day, today),
				isNull(tasks.doneAt),
				or(eq(tasks.kind, 'other'), isNull(quests.closedAt))
			)
		);
	return { overdue: row?.overdue ?? 0, badge: row?.badge ?? 0 };
}

/**
 * Explicit reschedule of overdue tasks (Home's "Today" / "All to today", Plan's Overdue group,
 * the palette): `ids` (only those still overdue move — a stale form can't move anything
 * else) or `'all'`, onto `day`, appended to the end of the target day's lists in their
 * overdue display order. One transaction. Returns how many tasks moved.
 */
export async function rescheduleOverdue(
	ids: readonly string[] | 'all',
	day: string,
	today: string
): Promise<number> {
	return db.transaction(async (tx) => {
		const rows = await tx
			.select({ id: tasks.id, kind: tasks.kind })
			.from(tasks)
			.leftJoin(quests, eq(quests.id, tasks.questId))
			.where(
				ids === 'all'
					? overdueCondition(today)
					: and(overdueCondition(today), inArray(tasks.id, [...ids]))
			)
			.orderBy(desc(tasks.day), asc(tasks.order), asc(tasks.createdAt))
			.for('update', { of: tasks });
		if (rows.length === 0) return 0;
		const bounds = await tx
			.select({ kind: tasks.kind, max: sql<number | null>`max(${tasks.order})` })
			.from(tasks)
			.where(eq(tasks.day, day))
			.groupBy(tasks.kind);
		const orders = appendOrders(
			rows,
			Object.fromEntries(bounds.map((b) => [b.kind, b.max === null ? null : Number(b.max)]))
		);
		for (const [id, order] of orders) {
			await tx.update(tasks).set({ day, order }).where(eq(tasks.id, id));
		}
		return rows.length;
	});
}

/** A task's sibling scope — see the module comment. */
function inListCondition(task: Pick<Task, 'kind' | 'questId' | 'day'>) {
	if (task.day) return and(eq(tasks.day, task.day), eq(tasks.kind, task.kind));
	return and(
		isNull(tasks.day),
		task.questId ? eq(tasks.questId, task.questId) : isNull(tasks.questId)
	);
}

/** Tasks of one quest without a day (the backlog), in list order. */
export async function listQuestBacklog(questId: string): Promise<Task[]> {
	return db
		.select()
		.from(tasks)
		.where(and(eq(tasks.questId, questId), isNull(tasks.day)))
		.orderBy(asc(tasks.order), asc(tasks.createdAt));
}

/** Tasks of one quest that have a day, ordered by day then list order. */
export async function listQuestScheduled(questId: string): Promise<(Task & { day: string })[]> {
	const rows = await db
		.select()
		.from(tasks)
		.where(and(eq(tasks.questId, questId), isNotNull(tasks.day)))
		.orderBy(asc(tasks.day), asc(tasks.order), asc(tasks.createdAt));
	return rows.filter((t): t is Task & { day: string } => t.day !== null);
}

/** Insert at the top (`order = min − 1`) or bottom (`order = max + 1`) of the target list. */
export async function createTask(
	target: TaskTarget,
	input: TaskInput,
	position: ListPosition = 'bottom'
): Promise<Task> {
	const day = input.day ?? null;
	const questId = target.kind === 'quest' ? target.questId : null;
	const [bound] = await db
		.select({
			bound:
				position === 'top'
					? sql<number | null>`min(${tasks.order})`
					: sql<number | null>`max(${tasks.order})`
		})
		.from(tasks)
		.where(inListCondition({ kind: target.kind, questId, day }));
	const order = position === 'top' ? orderAtTop(bound?.bound) : orderAtBottom(bound?.bound);
	const [task] = await db
		.insert(tasks)
		.values({
			kind: target.kind,
			questId,
			title: input.title,
			description: input.description ?? '',
			durationMin: input.durationMin ?? null,
			day,
			order
		})
		.returning();
	return task;
}

/**
 * Move a task to another day (or to the backlog with `day = null`), appending at the
 * bottom of the target list. No-op when the task is already there.
 */
export async function moveTaskToDay(id: string, day: string | null): Promise<void> {
	const task = await getTask(id);
	if (!task || task.day === day) return;
	const [max] = await db
		.select({ max: sql<number | null>`max(${tasks.order})` })
		.from(tasks)
		.where(inListCondition({ kind: task.kind, questId: task.questId, day }));
	await db
		.update(tasks)
		.set({ day, order: orderAtBottom(max?.max) })
		.where(eq(tasks.id, id));
}

/**
 * Drag & drop move: put the task into the list for `day` (null = backlog) directly before
 * `beforeId` (null or unknown id = append at the end) and renumber that list 0..n−1. The
 * target list follows the task's own kind/quest (a task's kind never changes by moving);
 * the source list is left gap-tolerant (only the moved row leaves it). See `dropIntoList`.
 */
export async function moveTaskTo(
	id: string,
	day: string | null,
	beforeId: string | null
): Promise<void> {
	const task = await getTask(id);
	if (!task) return;
	const siblings = await db
		.select()
		.from(tasks)
		.where(inListCondition({ ...task, day }))
		.orderBy(asc(tasks.order), asc(tasks.createdAt));
	const next = dropIntoList(siblings, task, beforeId);
	await db.transaction(async (tx) => {
		await tx.update(tasks).set({ day }).where(eq(tasks.id, id));
		for (const [k, sibling] of next.entries()) {
			await tx.update(tasks).set({ order: k }).where(eq(tasks.id, sibling.id));
		}
	});
}

/** Change a task's title and planned minutes (already validated); tells timer clients. */
export async function updateTaskDetails(
	id: string,
	input: { title: string; durationMin: number | null }
): Promise<void> {
	await db
		.update(tasks)
		.set({ title: input.title, durationMin: input.durationMin })
		.where(eq(tasks.id, id));
	// The active timer may show this task's title.
	await broadcastTimer();
}

export async function setTaskDone(id: string, done: boolean): Promise<void> {
	await db
		.update(tasks)
		.set({ doneAt: done ? new Date() : null })
		.where(eq(tasks.id, id));
}

/** Delete a task (cascades to blocks/sessions/pomodoro runs) and tell timer clients. */
export async function deleteTask(id: string): Promise<void> {
	await db.delete(tasks).where(eq(tasks.id, id));
	// The active timer may have belonged to this task — push the fresh state.
	await broadcastTimer();
}

/** Swap the task with its neighbour in the same list. No-op at the edges. */
export async function moveTask(id: string, dir: MoveDirection): Promise<void> {
	const task = await getTask(id);
	if (!task) return;
	const siblings = await db
		.select()
		.from(tasks)
		.where(inListCondition(task))
		.orderBy(asc(tasks.order), asc(tasks.createdAt));
	// Open and done tasks are rendered as separate groups, so only swap within the same group.
	const next = moveWithinGroup(
		siblings,
		id,
		dir,
		(a, b) => (a.doneAt === null) === (b.doneAt === null)
	);
	if (!next) return;
	// Re-number the whole list 0..n-1: swapping bare order values would no-op or
	// create ties when the bucket's values have gaps or start below zero.
	await db.transaction(async (tx) => {
		for (const [k, sibling] of next.entries()) {
			await tx.update(tasks).set({ order: k }).where(eq(tasks.id, sibling.id));
		}
	});
}
