/**
 * Quest data access. Ordering uses the `sort_order` column (TS property `order`), ascending;
 * gaps are allowed. Move up/down swaps positions within the *open* quests (the grid order).
 */
import { asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { quests, type Quest } from '#lib/server/db/schema.ts';
import type { QuestDraft } from '#lib/quest-form.ts';

export type MoveDirection = 'up' | 'down';

export async function listOpenQuests(): Promise<Quest[]> {
	return db
		.select()
		.from(quests)
		.where(isNull(quests.closedAt))
		.orderBy(asc(quests.order), asc(quests.createdAt));
}

export async function listClosedQuests(): Promise<Quest[]> {
	return db
		.select()
		.from(quests)
		.where(sql`${quests.closedAt} is not null`)
		.orderBy(asc(quests.order), asc(quests.createdAt));
}

export async function getQuest(id: string): Promise<Quest | undefined> {
	const [quest] = await db.select().from(quests).where(eq(quests.id, id));
	return quest;
}

/** Append after the last quest of either state. */
export async function createQuest(draft: QuestDraft): Promise<Quest> {
	const [max] = await db.select({ max: sql<number | null>`max(${quests.order})` }).from(quests);
	const [quest] = await db
		.insert(quests)
		.values({ ...draft, order: (max?.max ?? -1) + 1 })
		.returning();
	return quest;
}

export async function updateQuest(id: string, draft: QuestDraft): Promise<Quest | undefined> {
	const [quest] = await db.update(quests).set(draft).where(eq(quests.id, id)).returning();
	return quest;
}

export async function setQuestClosed(id: string, closed: boolean): Promise<void> {
	await db
		.update(quests)
		.set({ closedAt: closed ? new Date() : null })
		.where(eq(quests.id, id));
}

/** Hard delete — cascades to tasks, blocks and sessions. Prefer closing in normal UX. */
export async function deleteQuest(id: string): Promise<void> {
	await db.delete(quests).where(eq(quests.id, id));
}

/** Swap the quest with its neighbour in the open-quest order. No-op at the edges. */
export async function moveQuest(id: string, dir: MoveDirection): Promise<void> {
	const siblings = await listOpenQuests();
	const i = siblings.findIndex((q) => q.id === id);
	if (i < 0) return;
	const j = dir === 'up' ? i - 1 : i + 1;
	if (j < 0 || j >= siblings.length) return;
	await db.transaction(async (tx) => {
		// Normalise to sequential orders first so swapped values are always unique.
		for (const [k, quest] of siblings.entries()) {
			const order = k === i ? j : k === j ? i : k;
			await tx.update(quests).set({ order }).where(eq(quests.id, quest.id));
		}
	});
}
