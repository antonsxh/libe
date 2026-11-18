/**
 * Block data access — planned time spans on the day timeline (`blocks` table).
 * Range validation (0 ≤ start < end ≤ 1440) happens in the routes before calling these.
 */
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { addDays } from '#lib/dates.ts';
import { db } from '#lib/server/db/index.ts';
import { blocks, quests, tasks } from '#lib/server/db/schema.ts';

/** A block joined with its task title and quest colour (null colour → "other", render slate). */
export interface BlockWithTask {
	id: string;
	taskId: string;
	taskTitle: string;
	day: string;
	startMin: number;
	endMin: number;
	questColor: string | null;
}

export interface BlockInput {
	taskId: string;
	day: string;
	startMin: number;
	endMin: number;
}

export async function getBlock(id: string) {
	const [block] = await db.select().from(blocks).where(eq(blocks.id, id));
	return block;
}

/** All blocks for a day, earliest first, with task and quest joined. */
export async function listDayBlocks(day: string): Promise<BlockWithTask[]> {
	return db
		.select({
			id: blocks.id,
			taskId: blocks.taskId,
			taskTitle: tasks.title,
			day: blocks.day,
			startMin: blocks.startMin,
			endMin: blocks.endMin,
			questColor: quests.color
		})
		.from(blocks)
		.innerJoin(tasks, eq(tasks.id, blocks.taskId))
		.leftJoin(quests, eq(quests.id, tasks.questId))
		.where(eq(blocks.day, day))
		.orderBy(asc(blocks.startMin), asc(blocks.createdAt));
}

/** Blocks of the Mon–Sun week starting `monday` (calendar "Show plan" overlay). */
export async function listWeekBlocks(monday: string): Promise<BlockWithTask[]> {
	return db
		.select({
			id: blocks.id,
			taskId: blocks.taskId,
			taskTitle: tasks.title,
			day: blocks.day,
			startMin: blocks.startMin,
			endMin: blocks.endMin,
			questColor: quests.color
		})
		.from(blocks)
		.innerJoin(tasks, eq(tasks.id, blocks.taskId))
		.leftJoin(quests, eq(quests.id, tasks.questId))
		.where(and(gte(blocks.day, monday), lte(blocks.day, addDays(monday, 6))))
		.orderBy(asc(blocks.day), asc(blocks.startMin), asc(blocks.createdAt));
}

export async function createBlock(input: BlockInput) {
	const [block] = await db.insert(blocks).values(input).returning();
	return block;
}

export async function updateBlock(id: string, startMin: number, endMin: number): Promise<void> {
	await db.update(blocks).set({ startMin, endMin }).where(eq(blocks.id, id));
}

export async function deleteBlock(id: string): Promise<void> {
	await db.delete(blocks).where(eq(blocks.id, id));
}
