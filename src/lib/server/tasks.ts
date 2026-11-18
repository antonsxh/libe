/**
 * Task data access — generic so later milestones (day lists, "other" list, plan board)
 * can reuse it. A task's *list* is defined by (quest_id ?? 'other') + (day ?? backlog):
 * move up/down swaps within the same list only.
 */
import { and, asc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { tasks, type Task } from '#lib/server/db/schema.ts';

export type MoveDirection = 'up' | 'down';

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

/** A task's sibling scope: same quest (or both "other") and same day (or both backlog). */
function inListCondition(task: Pick<Task, 'questId' | 'day'>) {
	const questCond = task.questId ? eq(tasks.questId, task.questId) : isNull(tasks.questId);
	const dayCond = task.day ? eq(tasks.day, task.day) : isNull(tasks.day);
	return and(questCond, dayCond);
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

/** Append to the end of the target list. */
export async function createTask(target: TaskTarget, input: TaskInput): Promise<Task> {
	const day = input.day ?? null;
	const [max] = await db
		.select({ max: sql<number | null>`max(${tasks.order})` })
		.from(tasks)
		.where(inListCondition({ questId: target.kind === 'quest' ? target.questId : null, day }));
	const [task] = await db
		.insert(tasks)
		.values({
			kind: target.kind,
			questId: target.kind === 'quest' ? target.questId : null,
			title: input.title,
			description: input.description ?? '',
			durationMin: input.durationMin ?? null,
			day,
			order: (max?.max ?? -1) + 1
		})
		.returning();
	return task;
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
	const i = siblings.findIndex((t) => t.id === id);
	if (i < 0) return;
	const j = dir === 'up' ? i - 1 : i + 1;
	if (j < 0 || j >= siblings.length) return;
	await db.transaction(async (tx) => {
		for (const [k, sibling] of siblings.entries()) {
			const order = k === i ? j : k === j ? i : k;
			await tx.update(tasks).set({ order }).where(eq(tasks.id, sibling.id));
		}
	});
}
