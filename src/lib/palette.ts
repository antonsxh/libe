/**
 * Command palette — pure logic (client-safe, no DB imports; the server search uses the query
 * helpers too).
 *
 * - Query handling shared by client and `GET /api/search`: `normalizeQuery`, `escapeLike`.
 * - Client-side matching of pages/actions (`matchRank`, `filterByText`).
 * - Server-side ranking of the task/quest candidates (`rankTasks`, `rankQuests`).
 * - Keyboard navigation over the grouped list (`flattenGroups`, `stepIndex`).
 * - Where a task lives in the UI (`taskHref`), shortcut / platform detection.
 */
import { startOfWeek } from '#lib/dates.ts';
import { BACKLOG_HREF } from '#lib/nav.ts';

/** Longest query the server looks at (longer input is cut, not rejected). */
export const SEARCH_MAX_LEN = 100;
/** Results per server group (quests, tasks). */
export const SEARCH_GROUP_LIMIT = 8;
/** Client debounce before asking the server. */
export const SEARCH_DEBOUNCE_MS = 120;

/** Trim, collapse inner whitespace, cut to `SEARCH_MAX_LEN`. Non-strings → `''`. */
export function normalizeQuery(raw: unknown): string {
	if (typeof raw !== 'string') return '';
	return raw.replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX_LEN).trim();
}

/** Escape `\`, `%` and `_` for a `LIKE`/`ILIKE` pattern (Postgres' default escape is `\`). */
export function escapeLike(s: string): string {
	return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ─── Matching ───────────────────────────────────────────────────────────────

/**
 * How well `text` matches the (normalised) query, case-insensitive: 0 = prefix, 1 = a word
 * starts with it, 2 = substring, -1 = no match. An empty query matches everything (0).
 */
export function matchRank(text: string, query: string): number {
	const q = query.toLowerCase();
	if (!q) return 0;
	const s = text.toLowerCase();
	const at = s.indexOf(q);
	if (at < 0) return -1;
	if (at === 0) return 0;
	for (let i = at; i >= 0; i = s.indexOf(q, i + 1)) {
		if (/[\s\-–—_/·.,:(]/.test(s[i - 1])) return 1;
	}
	return 2;
}

/** Items whose text matches, best match first; ties keep their original order. */
export function filterByText<T>(items: T[], query: string, text: (item: T) => string): T[] {
	return items
		.map((item, i) => ({ item, i, rank: matchRank(text(item), query) }))
		.filter((x) => x.rank >= 0)
		.sort((a, b) => a.rank - b.rank || a.i - b.i)
		.map((x) => x.item);
}

// ─── Server ranking ─────────────────────────────────────────────────────────

export interface RankableTask {
	title: string;
	/** ISO day; null = backlog. */
	day: string | null;
}

/** 0 = today or upcoming, 1 = past day, 2 = backlog. */
export function dayBucket(day: string | null, today: string): number {
	if (day === null) return 2;
	return day >= today ? 0 : 1;
}

/**
 * Tasks matching on title or quest name, ranked: title prefix matches first, then other title
 * matches, then matches on the quest name only; within each, today/upcoming days before past
 * days and the backlog, then by title.
 */
export function rankTasks<T extends RankableTask>(
	tasks: T[],
	query: string,
	today: string,
	limit = SEARCH_GROUP_LIMIT
): T[] {
	const q = query.toLowerCase();
	const titleRank = (t: T) => {
		const at = t.title.toLowerCase().indexOf(q);
		return at === 0 ? 0 : at > 0 ? 1 : 2;
	};
	return tasks
		.map((t) => ({ t, title: titleRank(t), bucket: dayBucket(t.day, today) }))
		.sort(
			(a, b) =>
				a.title - b.title ||
				a.bucket - b.bucket ||
				a.t.title.localeCompare(b.t.title) ||
				(a.t.day ?? '').localeCompare(b.t.day ?? '')
		)
		.slice(0, limit)
		.map((x) => x.t);
}

/** Quests (already in grid order) ranked prefix matches first, order kept otherwise. */
export function rankQuests<T extends { name: string }>(
	quests: T[],
	query: string,
	limit = SEARCH_GROUP_LIMIT
): T[] {
	const q = query.toLowerCase();
	return quests
		.map((quest, i) => ({ quest, i, prefix: quest.name.toLowerCase().startsWith(q) ? 0 : 1 }))
		.sort((a, b) => a.prefix - b.prefix || a.i - b.i)
		.slice(0, limit)
		.map((x) => x.quest);
}

// ─── Navigation targets ─────────────────────────────────────────────────────

/**
 * Where a task is shown: today's tasks on Home's "Today" list, the backlog in Home's Backlog
 * sheet (`BACKLOG_HREF`: every open quest's and the "other" backlog, at every width — the Plan
 * board scrolls its backlog column out of view on phones); any other day opens that week on
 * the Plan board, with the day's "Other" zone expanded for tasks of kind `other`.
 */
export function taskHref(
	task: { day: string | null; kind: 'quest' | 'other' },
	today: string
): string {
	if (task.day === null) return BACKLOG_HREF;
	if (task.day === today) return '/';
	const week = `/plan?week=${startOfWeek(task.day)}`;
	return task.kind === 'other' ? `${week}&other=${task.day}` : week;
}

// ─── Keyboard navigation ────────────────────────────────────────────────────

export interface Group<T> {
	key: string;
	label: string;
	items: T[];
}

/** All items of the non-empty groups in display order (what ↑/↓ walk through). */
export function flattenGroups<T>(groups: Group<T>[]): T[] {
	return groups.flatMap((g) => g.items);
}

/** Next index after moving `delta` (±1) through `count` items, wrapping; -1 when empty. */
export function stepIndex(current: number, delta: number, count: number): number {
	if (count <= 0) return -1;
	if (current < 0 || current >= count) return delta >= 0 ? 0 : count - 1;
	return (((current + delta) % count) + count) % count;
}

// ─── Shortcut ───────────────────────────────────────────────────────────────

interface NavigatorLike {
	userAgentData?: { platform?: string } | null;
	platform?: string;
	userAgent?: string;
}

/** Apple platform (⌘ instead of Ctrl): User-Agent Client Hints first, then `platform`/UA. */
export function isApplePlatform(nav: NavigatorLike | undefined): boolean {
	if (!nav) return false;
	const apple = /mac|iphone|ipad|ipod|ios/i;
	const hint = nav.userAgentData?.platform;
	if (hint) return apple.test(hint);
	if (nav.platform) return apple.test(nav.platform);
	return apple.test(nav.userAgent ?? '');
}

interface KeyLike {
	key: string;
	code?: string;
	metaKey: boolean;
	ctrlKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}

/** ⌘K on Apple platforms, Ctrl+K elsewhere (no other modifiers; any keyboard layout). */
export function isPaletteShortcut(e: KeyLike, apple: boolean): boolean {
	if (e.altKey || e.shiftKey) return false;
	if (apple ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return false;
	return e.key.toLowerCase() === 'k' || e.code === 'KeyK';
}
