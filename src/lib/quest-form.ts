/**
 * Quest form contract shared by the quest dialog (client) and the form actions (server).
 * Plain validation, no library.
 */
import { isQuestColor, type QuestColor } from '#lib/quest-colors.ts';
import { DEFAULT_QUEST_ICON, isSingleEmoji } from '#lib/emoji.ts';
import type { ErrorCode } from '#lib/i18n/index.ts';

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
	/** Translated messages (the action turns the validation codes into text). */
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

export type QuestFormErrors = Partial<Record<QuestFormField, ErrorCode>>;

export type QuestFormValidation =
	{ ok: true; draft: QuestDraft } | { ok: false; errors: QuestFormErrors };

/** Validate raw form fields; an empty icon falls back to {@link DEFAULT_QUEST_ICON}. */
export function validateQuestForm(fields: QuestFormFields): QuestFormValidation {
	const errors: QuestFormErrors = {};

	const name = fields.name.trim();
	if (!name) errors.name = 'questNameRequired';
	else if (name.length > QUEST_NAME_MAX) errors.name = 'questNameTooLong';

	const description = fields.description.trim();
	if (description.length > QUEST_DESC_MAX) errors.description = 'questDescriptionTooLong';

	const icon = fields.icon.trim() || DEFAULT_QUEST_ICON;
	if (!isSingleEmoji(icon)) errors.icon = 'questIconInvalid';

	const color = fields.color;
	if (!isQuestColor(color)) errors.color = 'questColorInvalid';

	let weeklyBudgetH: number | null = null;
	const rawBudget = fields.weeklyBudgetH.trim();
	if (rawBudget !== '') {
		const n = Number(rawBudget);
		if (!Number.isFinite(n) || n <= 0 || n > QUEST_BUDGET_MAX_H)
			errors.weeklyBudgetH = 'questBudgetInvalid';
		else weeklyBudgetH = n;
	}

	if (Object.keys(errors).length > 0 || !isQuestColor(color)) return { ok: false, errors };
	return { ok: true, draft: { name, description, icon, color, weeklyBudgetH } };
}

/**
 * Echo payload for `fail(400, …)` so the dialog can keep the user's input and show errors
 * (`errors` translated with the request's messages, `t.errors[code]`).
 */
export function questFormEcho(
	intent: string,
	fields: QuestFormFields,
	errors: QuestFormErrors,
	messages: Record<ErrorCode, string>
) {
	const text: Partial<Record<QuestFormField, string>> = {};
	for (const [field, code] of Object.entries(errors) as [QuestFormField, ErrorCode][])
		text[field] = messages[code];
	return { intent, ok: false as const, ...fields, errors: text };
}

/** The quest dialog's "More options" (icon, description, weekly budget) as stored or echoed. */
export interface QuestExtras {
	icon?: string | null;
	description?: string | null;
	weeklyBudgetH?: number | string | null;
}

/**
 * Whether the quest dialog opens "More options": the quest has something set there — an icon
 * other than the default, a description or a weekly budget. A new quest starts collapsed.
 */
export function hasQuestExtras(extras: QuestExtras | null | undefined): boolean {
	if (!extras) return false;
	const icon = String(extras.icon ?? '').trim();
	const description = String(extras.description ?? '').trim();
	const budget = extras.weeklyBudgetH;
	return (
		(icon !== '' && icon !== DEFAULT_QUEST_ICON) ||
		description !== '' ||
		(budget !== null && budget !== undefined && String(budget).trim() !== '')
	);
}
