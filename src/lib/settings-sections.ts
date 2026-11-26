/**
 * Settings' sections (AB1) — pure, client-safe. Phones show one inset grouped list whose rows
 * open sheets; wider screens show a macOS System Settings layout: a sidebar of these sections
 * and the selected one's form beside it. The selection is `?section=` (client-only: the
 * server's `load` never reads it, so switching sections re-runs no `load`); the old anchors
 * `#profile`, `#goal` and `#streak` still land on their section.
 */
import { GOAL_ANCHOR } from '#lib/daily-goal.ts';
import { PROFILE_ANCHOR } from '#lib/profile.ts';
import { STREAK_ANCHOR } from '#lib/streak.ts';

export const SETTINGS_SECTIONS = [
	'profile',
	'goal',
	'focus',
	'notifications',
	'appearance',
	'language',
	'devices',
	'desktop'
] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SECTION_PARAM = 'section';
/** The pane wider screens show without a `?section=`. */
export const DEFAULT_SECTION: SettingsSection = 'profile';

export function isSettingsSection(value: unknown): value is SettingsSection {
	return typeof value === 'string' && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/** The sections this device shows: Notifications not in the desktop app, Desktop app only there. */
export function availableSections(opts: { desktopApp: boolean }): SettingsSection[] {
	return SETTINGS_SECTIONS.filter((s) =>
		s === 'notifications' ? !opts.desktopApp : s === 'desktop' ? opts.desktopApp : true
	);
}

/** The section an old Settings anchor (`#profile`, `#goal`, `#streak`) pointed at. */
export function sectionFromHash(hash: string): SettingsSection | null {
	const anchor = hash.replace(/^#/, '');
	if (anchor === PROFILE_ANCHOR) return 'profile';
	if (anchor === GOAL_ANCHOR || anchor === STREAK_ANCHOR) return 'goal';
	return null;
}

/**
 * The section a URL asks for: a valid, available `?section=`, else an old anchor, else null
 * (wider screens then show {@link DEFAULT_SECTION}; phones show the list).
 */
export function requestedSection(
	url: { searchParams: { get(name: string): string | null }; hash: string },
	available: readonly SettingsSection[]
): SettingsSection | null {
	const param = url.searchParams.get(SECTION_PARAM);
	if (isSettingsSection(param) && available.includes(param)) return param;
	const fromHash = sectionFromHash(url.hash);
	return fromHash && available.includes(fromHash) ? fromHash : null;
}

/** `/settings?section=…` (other query parameters dropped). */
export function settingsHref(section: SettingsSection | null): string {
	return section ? `/settings?${SECTION_PARAM}=${section}` : '/settings';
}

/**
 * Short value of the rest-days row: weekday names (Monday first) for up to three days, else
 * the count — `name(i)` is the short weekday name, `count(n)` the "n days" text, `none` for
 * no rest day.
 */
export function restDaysSummary(
	days: readonly number[],
	text: { name: (weekday: number) => string; count: (n: number) => string; none: string }
): string {
	const sorted = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
	if (sorted.length === 0) return text.none;
	if (sorted.length > 3) return text.count(sorted.length);
	return sorted.map(text.name).join(', ');
}

/** A Monday — weekday names come from `Intl` (Monday first, like the app's weeks). */
const REF_MONDAY = Date.UTC(2024, 0, 1);

/** Name of weekday `i` (0 = Monday … 6 = Sunday) in `locale`. */
export function weekdayName(i: number, weekday: 'short' | 'long', locale: string): string {
	return new Intl.DateTimeFormat(locale, { weekday, timeZone: 'UTC' }).format(
		new Date(REF_MONDAY + i * 86_400_000)
	);
}
