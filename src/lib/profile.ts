/**
 * The owner's profile — pure, client-safe logic. libe is single-user: the profile is global
 * (columns of the single `settings` row, the same on every paired device) and is only ever
 * sent to paired devices, never rendered on a public page.
 *
 * - `normalizeDisplayName`: trim, collapse whitespace, NFC; empty → `null` ("no name").
 *   The limit counts **code points** (`DISPLAY_NAME_MAX`), the same unit as Postgres'
 *   `char_length` in the `settings_display_name_chk` constraint and as device names — a
 *   grapheme limit could accept a name the database rejects (combining marks, ZWJ emoji).
 * - `initials`: up to two graphemes (first and last word) for the avatar.
 * - `greetingPart`: the part of the day for Home's greeting.
 */
import { OTHER_COLOR, isQuestColor, type QuestColor } from '#lib/quest-colors.ts';
import type { ErrorCode } from '#lib/i18n/index.ts';

/** Longest display name, in code points (see module docs). */
export const DISPLAY_NAME_MAX = 40;

/** Avatar colour of a fresh install (the app's accent family). Matches the column default. */
export const DEFAULT_AVATAR_COLOR: QuestColor = 'amber';

/** Where the profile is edited (Settings section anchor) — avatar menu, command palette. */
export const PROFILE_ANCHOR = 'profile';
export const PROFILE_HREF = `/settings#${PROFILE_ANCHOR}`;

export interface Profile {
	/** Null = no name set (the avatar shows a neutral icon). */
	displayName: string | null;
	/** A key of `QUEST_COLORS`. */
	avatarColor: QuestColor;
}

export const DEFAULT_PROFILE: Profile = { displayName: null, avatarColor: DEFAULT_AVATAR_COLOR };

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };

/**
 * A display name from user input: NFC, whitespace runs → one space, trimmed, control
 * characters dropped. Empty (or not a string) → `null` = no name. Longer than
 * `DISPLAY_NAME_MAX` code points → `profileNameTooLong`.
 */
export function normalizeDisplayName(raw: unknown): Parsed<string | null> {
	if (typeof raw !== 'string') return { ok: true, value: null };
	const value = raw
		.normalize('NFC')
		.replace(/\s+/g, ' ')
		.replace(/\p{Cc}/gu, '')
		.trim();
	if (!value) return { ok: true, value: null };
	if ([...value].length > DISPLAY_NAME_MAX) return { ok: false, error: 'profileNameTooLong' };
	return { ok: true, value };
}

/** An avatar colour from user input (a `QUEST_COLORS` key). */
export function parseAvatarColor(raw: unknown): Parsed<QuestColor> {
	return isQuestColor(raw) ? { ok: true, value: raw } : { ok: false, error: 'profileColorInvalid' };
}

/** A stored row's values as a `Profile` (unknown colours fall back to slate, like quests). */
export function toProfile(row: { displayName: string | null; avatarColor: string } | undefined) {
	if (!row) return { ...DEFAULT_PROFILE };
	return {
		displayName: row.displayName?.trim() || null,
		avatarColor: isQuestColor(row.avatarColor) ? row.avatarColor : OTHER_COLOR
	} satisfies Profile;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** A grapheme that can stand for a word: a letter, a digit or an emoji (not punctuation). */
const MEANINGFUL = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;

function firstMeaningful(word: string): string | null {
	for (const { segment } of segmenter.segment(word)) {
		if (MEANINGFUL.test(segment)) return segment;
	}
	return null;
}

/**
 * Avatar initials: the first grapheme of the first and of the last word, upper-cased for
 * `locale` ("Anton Schmidt" → "AS", "anton" → "A", "Ölaf ütz" → "ÖÜ"). Graphemes, so
 * combining marks and emoji stay whole; leading punctuation is skipped and punctuation-only
 * words ("&", "-") are ignored. No usable word → `null`.
 */
export function initials(name: string | null | undefined, locale?: string): string | null {
	if (!name) return null;
	const letters = name
		.normalize('NFC')
		.split(/\s+/)
		.map(firstMeaningful)
		.filter((g): g is string => g !== null);
	if (letters.length === 0) return null;
	const picked = letters.length === 1 ? [letters[0]] : [letters[0], letters[letters.length - 1]];
	return picked.map((g) => g.toLocaleUpperCase(locale)).join('');
}

export const GREETING_PARTS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type GreetingPart = (typeof GREETING_PARTS)[number];

/** Part of the day for an hour 0‥23: 5–11 morning, 12–17 afternoon, 18–22 evening, 23–4 night. */
export function greetingPart(hour: number): GreetingPart {
	const h = ((Math.floor(hour) % 24) + 24) % 24;
	if (h >= 5 && h < 12) return 'morning';
	if (h >= 12 && h < 18) return 'afternoon';
	if (h >= 18 && h < 23) return 'evening';
	return 'night';
}
