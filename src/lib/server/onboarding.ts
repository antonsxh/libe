/**
 * First-run flow (`/welcome`) — data access. The rules (steps, choices, the redirect after
 * pairing) are in `#lib/onboarding.ts`; whether the flow is done is `settings.onboarded_at`
 * (`isOnboarded` / `markOnboarded` in `server/settings.ts`).
 */
import { todayISO } from '#lib/dates.ts';
import { isUuid } from '#lib/ids.ts';
import type { QuestDraft } from '#lib/quest-form.ts';
import { createQuest, getQuest, updateQuest } from '#lib/server/quests.ts';
import { createTask, getTaskWithQuest, updateTaskDetails } from '#lib/server/tasks.ts';

/** The quest task created in step 2, as steps 2 and 3 show it. */
export interface WelcomeTask {
	id: string;
	title: string;
	durationMin: number | null;
	questId: string;
	questName: string;
	questColor: string;
}

/** The task of `?task=` when it is an open quest task (anything else → null). */
export async function getWelcomeTask(id: string | null | undefined): Promise<WelcomeTask | null> {
	if (!isUuid(id)) return null;
	const task = await getTaskWithQuest(id);
	if (!task || task.doneAt || task.kind !== 'quest' || !task.questId || !task.questName)
		return null;
	return {
		id: task.id,
		title: task.title,
		durationMin: task.durationMin,
		questId: task.questId,
		questName: task.questName,
		questColor: task.questColor ?? 'slate'
	};
}

export interface FirstQuestInput {
	/** Validated by `validateQuestForm` (only name and colour are asked for). */
	quest: QuestDraft;
	title: string;
	durationMin: number;
}

/**
 * Step 2: create the quest and its first step on today's list (appended at the bottom), or —
 * back from step 3 with `existing` — rename/recolour that quest and edit that task instead of
 * creating a second pair. Returns the task's id.
 */
export async function saveFirstQuest(
	input: FirstQuestInput,
	existing: WelcomeTask | null
): Promise<string> {
	const quest = existing ? await getQuest(existing.questId) : undefined;
	if (existing && quest) {
		await updateQuest(quest.id, {
			name: input.quest.name,
			color: input.quest.color,
			description: quest.description,
			icon: quest.icon,
			weeklyBudgetH: quest.weeklyBudgetH
		});
		await updateTaskDetails(existing.id, { title: input.title, durationMin: input.durationMin });
		return existing.id;
	}
	const created = await createQuest(input.quest);
	const task = await createTask(
		{ kind: 'quest', questId: created.id },
		{ title: input.title, durationMin: input.durationMin, day: todayISO() },
		'bottom'
	);
	return task.id;
}
