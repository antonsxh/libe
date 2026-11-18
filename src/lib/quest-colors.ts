/**
 * Quest colour family. `quests.color` stores one of these keys.
 * Each key maps to a CSS custom property in `styles/tokens.css`.
 */
export const QUEST_COLORS = [
	'red',
	'orange',
	'amber',
	'lime',
	'green',
	'teal',
	'blue',
	'purple',
	'pink',
	'olive',
	'slate'
] as const;

export type QuestColor = (typeof QUEST_COLORS)[number];

/** Colour used for tasks of kind `other` (no quest). */
export const OTHER_COLOR: QuestColor = 'slate';

export function isQuestColor(value: unknown): value is QuestColor {
	return typeof value === 'string' && (QUEST_COLORS as readonly string[]).includes(value);
}

/** CSS value for a quest colour key, e.g. `var(--quest-red)`. Unknown keys fall back to slate. */
export function questColorVar(key: string | null | undefined): string {
	return `var(--quest-${isQuestColor(key) ? key : OTHER_COLOR})`;
}
