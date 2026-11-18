/**
 * Quest form contract shared by the quest dialog (client) and the form actions (server).
 * Plain validation, no library.
 */
import { isQuestColor, type QuestColor } from '#lib/quest-colors.ts';
import { DEFAULT_QUEST_ICON, isSingleEmoji } from '#lib/emoji.ts';

export const QUEST_NAME_MAX = 80;
export const QUEST_DESC_MAX = 280;
export const QUEST_BUDGET_MAX_H = 168;

/** Raw string fields as submitted by the dialog's form. */
export interface QuestFormFields {
	name: string;
	description: string;
	icon: string;
	color: string;
	weeklyBudgetH: string;
}

export type QuestFormField = keyof QuestFormFields;

/** Validated quest values ready to persist. */
export interface QuestDraft {
	name: string;
	description: string;
	icon: string;
	color: QuestColor;
	/** Target hours per week; null = no budget. */
	weeklyBudgetH: number | null;
}

/**
 * Shape returned by the `create` / `update` form actions (and merged into `data.form`):
 * `{ ok: true, intent, questId }` on success, the submitted fields + `errors` on failure.
 * Loosely typed (all optional) so other quest actions' results are assignable too.
 */
export interface QuestFormResult {
	ok?: boolean;
	intent?: string;
	questId?: string;
	errors?: Partial<Record<QuestFormField, string>>;
	name?: string;
	description?: string;
	icon?: string;
	color?: string;
	weeklyBudgetH?: string;
}

export function parseQuestForm(fd: FormData): QuestFormFields {
	const str = (key: QuestFormField) => String(fd.get(key) ?? '');
	return {
		name: str('name'),
		description: str('description'),
		icon: str('icon'),
		color: str('color'),
		weeklyBudgetH: str('weeklyBudgetH')
	};
}

export type QuestFormValidation =
	{ ok: true; draft: QuestDraft } | { ok: false; errors: Partial<Record<QuestFormField, string>> };

/** Validate raw form fields; an empty icon falls back to {@link DEFAULT_QUEST_ICON}. */
export function validateQuestForm(fields: QuestFormFields): QuestFormValidation {
	const errors: Partial<Record<QuestFormField, string>> = {};

	const name = fields.name.trim();
	if (!name) errors.name = 'Give the quest a name.';
	else if (name.length > QUEST_NAME_MAX)
		errors.name = `Keep the name to at most ${QUEST_NAME_MAX} characters.`;

	const description = fields.description.trim();
	if (description.length > QUEST_DESC_MAX)
		errors.description = `Keep the description to at most ${QUEST_DESC_MAX} characters.`;

	const icon = fields.icon.trim() || DEFAULT_QUEST_ICON;
	if (!isSingleEmoji(icon)) errors.icon = 'Use exactly one emoji.';

	const color = fields.color;
	if (!isQuestColor(color)) errors.color = 'Pick one of the colours.';

	let weeklyBudgetH: number | null = null;
	const rawBudget = fields.weeklyBudgetH.trim();
	if (rawBudget !== '') {
		const n = Number(rawBudget);
		if (!Number.isFinite(n) || n <= 0 || n > QUEST_BUDGET_MAX_H)
			errors.weeklyBudgetH = `Budget must be more than 0 and at most ${QUEST_BUDGET_MAX_H} hours.`;
		else weeklyBudgetH = n;
	}

	if (Object.keys(errors).length > 0 || !isQuestColor(color)) return { ok: false, errors };
	return { ok: true, draft: { name, description, icon, color, weeklyBudgetH } };
}

/** Echo payload for `fail(400, …)` so the dialog can keep the user's input and show errors. */
export function questFormEcho(
	intent: string,
	fields: QuestFormFields,
	errors: Partial<Record<QuestFormField, string>>
) {
	return { intent, ok: false as const, ...fields, errors };
}
