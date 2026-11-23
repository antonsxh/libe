/**
 * The "create quest" form action, shared by Quests (`/quests`) and Home's first-quest dialog
 * (Home without open quests), so both validate and echo the same way.
 */
import { fail } from '@sveltejs/kit';
import { parseQuestForm, questFormEcho, validateQuestForm } from '#lib/quest-form.ts';
import { createQuest } from '#lib/server/quests.ts';
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
