/**
 * Task data access — generic so later milestones (day lists, "other" list, plan board)
 * can reuse it. A task's *list* is
 *   - scheduled (day set): all tasks of the same kind on that day — quest work of every quest
 *     shares one list, exactly as Home/Plan show it;
 *   - backlog (day null): the tasks of one quest (or all "other" tasks) without a day.
 * Top/bottom inserts and move up/down operate within that list only.
 */
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { quests, tasks, type Task } from '#lib/server/db/schema.ts';
import { moveWithinGroup, orderAtBottom, orderAtTop } from '#lib/ordering.ts';

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

export async function setTaskDone(id: string, done: boolean): Promise<void> {
	await db
		.update(tasks)
		.set({ doneAt: done ? new Date() : null })
		.where(eq(tasks.id, id));
}

export async function deleteTask(id: string): Promise<void> {
	await db.delete(tasks).where(eq(tasks.id, id));
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
