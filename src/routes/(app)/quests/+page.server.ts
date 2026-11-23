import { fail } from '@sveltejs/kit';
import { isUuid } from '#lib/ids.ts';
import { parseQuestForm, questFormEcho, validateQuestForm } from '#lib/quest-form.ts';
import { questHours } from '#lib/server/stats.ts';
import { createQuestAction } from '#lib/server/quest-actions.ts';
import {
	deleteQuest,
	listClosedQuests,
	listOpenQuests,
	moveQuest,
	setQuestClosed,
	updateQuest
} from '#lib/server/quests.ts';
import { i18n } from '#lib/i18n/index.ts';
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

	update: async ({ request, locals }) => {
		const formData = await request.formData();
		const questId = String(formData.get('questId') ?? '');
		const fields = parseQuestForm(formData);
		const result = validateQuestForm(fields);
		const { errors } = i18n(locals.locale);
		if (!isUuid(questId))
			return fail(400, questFormEcho('update', fields, { name: 'questUnknown' }, errors));
		if (!result.ok) return fail(400, questFormEcho('update', fields, result.errors, errors));
		const quest = await updateQuest(questId, result.draft);
		if (!quest) return fail(404, questFormEcho('update', fields, { name: 'questGone' }, errors));
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
