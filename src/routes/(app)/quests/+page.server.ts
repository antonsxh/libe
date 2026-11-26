import { isUuid } from '#lib/ids.ts';
import { questHours } from '#lib/server/stats.ts';
import { createQuestAction, updateQuestAction } from '#lib/server/quest-actions.ts';
import {
	deleteQuest,
	listClosedQuests,
	listOpenQuests,
	moveQuest,
	setQuestClosed
} from '#lib/server/quests.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [open, closed, hours] = await Promise.all([
		listOpenQuests(),
		listClosedQuests(),
		questHours()
	]);
	return { open, closed, hours };
};

export const actions = {
	create: createQuestAction,

	update: updateQuestAction,

	close: async ({ request }) => {
		const questId = String((await request.formData()).get('questId') ?? '');
		if (isUuid(questId)) await setQuestClosed(questId, true);
		return { intent: 'close', ok: true, questId };
	},

	reopen: async ({ request }) => {
		const questId = String((await request.formData()).get('questId') ?? '');
		if (isUuid(questId)) await setQuestClosed(questId, false);
		return { intent: 'reopen', ok: true, questId };
	},

	delete: async ({ request }) => {
		const questId = String((await request.formData()).get('questId') ?? '');
		if (isUuid(questId)) await deleteQuest(questId);
		return { intent: 'delete', ok: true, questId };
	},

	moveUp: async ({ request }) => {
		const questId = String((await request.formData()).get('questId') ?? '');
		if (isUuid(questId)) await moveQuest(questId, 'up');
		return { intent: 'moveUp', ok: true, questId };
	},

	moveDown: async ({ request }) => {
		const questId = String((await request.formData()).get('questId') ?? '');
		if (isUuid(questId)) await moveQuest(questId, 'down');
		return { intent: 'moveDown', ok: true, questId };
	}
} satisfies Actions;
