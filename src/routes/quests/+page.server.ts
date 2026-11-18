import { fail } from '@sveltejs/kit';
import { isUuid } from '#lib/ids.ts';
import { parseQuestForm, questFormEcho, validateQuestForm } from '#lib/quest-form.ts';
import { questHours } from '#lib/server/stats.ts';
import {
	createQuest,
	deleteQuest,
	listClosedQuests,
	listOpenQuests,
	moveQuest,
	setQuestClosed,
	updateQuest
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
	create: async ({ request }) => {
		const fields = parseQuestForm(await request.formData());
		const result = validateQuestForm(fields);
		if (!result.ok) return fail(400, questFormEcho('create', fields, result.errors));
		const quest = await createQuest(result.draft);
		return { intent: 'create', ok: true, questId: quest.id };
	},

	update: async ({ request }) => {
		const formData = await request.formData();
		const questId = String(formData.get('questId') ?? '');
		const fields = parseQuestForm(formData);
		const result = validateQuestForm(fields);
		if (!isUuid(questId))
			return fail(400, questFormEcho('update', fields, { name: 'Unknown quest.' }));
		if (!result.ok) return fail(400, questFormEcho('update', fields, result.errors));
		const quest = await updateQuest(questId, result.draft);
		if (!quest)
			return fail(404, questFormEcho('update', fields, { name: 'That quest no longer exists.' }));
		return { intent: 'update', ok: true, questId: quest.id };
	},

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
