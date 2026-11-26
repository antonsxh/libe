/**
 * Quest form actions shared between pages, so they validate and echo the same way: "create"
 * (Quests and Home's first-quest dialog) and "update" (Quests and the quest detail's Edit).
 */
import { fail } from '@sveltejs/kit';
import { isUuid } from '#lib/ids.ts';
import { parseQuestForm, questFormEcho, validateQuestForm } from '#lib/quest-form.ts';
import { createQuest, updateQuest } from '#lib/server/quests.ts';
import { i18n, type Locale } from '#lib/i18n/index.ts';

export async function createQuestAction({
	request,
	locals
}: {
	request: Request;
	locals: { locale: Locale };
}) {
	const fields = parseQuestForm(await request.formData());
	const result = validateQuestForm(fields);
	const { errors } = i18n(locals.locale);
	if (!result.ok) return fail(400, questFormEcho('create', fields, result.errors, errors));
	const quest = await createQuest(result.draft);
	return { intent: 'create', ok: true, questId: quest.id };
}

export async function updateQuestAction({
	request,
	locals
}: {
	request: Request;
	locals: { locale: Locale };
}) {
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
}
