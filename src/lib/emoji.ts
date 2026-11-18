/**
 * Emoji helpers (client-safe). A quest icon must be exactly one emoji grapheme cluster —
 * `Intl.Segmenter` keeps ZWJ sequences (👨‍👩‍👧) and flags (🇩🇪) together as a single grapheme.
 */

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const EMOJI_RE = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator})/u;

/** True if `value` is exactly one grapheme cluster containing a pictographic character. */
export function isSingleEmoji(value: string): boolean {
	const parts = [...segmenter.segment(value)].map((s) => s.segment);
	return parts.length === 1 && EMOJI_RE.test(parts[0]);
}

/** Default quest icon (matches the schema default). */
export const DEFAULT_QUEST_ICON = '✨';

/** Suggestions shown in the quest form. */
export const SUGGESTED_EMOJIS = [
	'🚀',
	'🏃',
	'📖',
	'✨',
	'🎨',
	'💪',
	'🧠',
	'💻',
	'🎸',
	'🌱',
	'✍️',
	'🧘',
	'🍳',
	'🎯',
	'🏠',
	'💰'
] as const;
