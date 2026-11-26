/**
 * Overdue tasks — pure rules (client-safe, no DB imports).
 *
 * A task is *overdue* when its planned day lies before today (the server's `TZ`, so it turns
 * overdue right after midnight), it is not done, and it is of kind `other` or its quest is
 * still open (a closed quest's tasks stay hidden, like its backlog). Overdue is computed, never
 * stored: the planned day is only rewritten by an explicit action (Today, Tomorrow, Backlog).
 * The SQL twin of `isOverdue` is `overdueCondition` in `server/tasks.ts`.
 */
import { addDays, formatDayLabel, isISODay } from '#lib/dates.ts';
import { isUuid } from '#lib/ids.ts';

/** Rows Home's Overdue group shows before "Show N more". */
export const OVERDUE_PREVIEW = 3;
/** Rows Plan's narrow backlog rail shows before "Show all" (its backlog stays in reach). */
export const OVERDUE_RAIL_PREVIEW = 3;
/** Most task ids one reschedule request may name (a form never lists more than the card). */
export const OVERDUE_MAX_IDS = 500;

export interface OverdueCandidate {
	day: string | null;
	doneAt: Date | string | null;
	kind: 'quest' | 'other';
	/** The quest's `closed_at` (null/undefined: open quest, or a task of kind `other`). */
	questClosedAt?: Date | string | null;
}

export function isOverdue(task: OverdueCandidate, today: string): boolean {
	if (task.day === null || task.day >= today || task.doneAt) return false;
	return task.kind === 'other' || !task.questClosedAt;
}

interface Sortable {
	day: string | null;
	order: number;
	createdAt: Date | string;
}

const time = (d: Date | string) => (typeof d === 'string' ? Date.parse(d) : d.getTime());

/** Display order: most recent day first (yesterday on top), then list order, then age. */
export function compareOverdue(a: Sortable, b: Sortable): number {
	const da = a.day ?? '';
	const db = b.day ?? '';
	if (da !== db) return da < db ? 1 : -1;
	return a.order - b.order || time(a.createdAt) - time(b.createdAt);
}

/** "yesterday", or "since <day>" — with the year once the day lies in another year. */
export type OverdueAge = { kind: 'yesterday' } | { kind: 'since'; withYear: boolean };

export function overdueAge(day: string, today: string): OverdueAge {
	if (day === addDays(today, -1)) return { kind: 'yesterday' };
	return { kind: 'since', withYear: day.slice(0, 4) !== today.slice(0, 4) };
}

/** `overdueAge` as text: "yesterday", "since Wed, Nov 18" (`Intl` in `locale`). */
export function overdueAgeLabel(
	day: string,
	today: string,
	text: { yesterday: string; since: (day: string) => string },
	locale = 'en-US'
): string {
	const age = overdueAge(day, today);
	if (age.kind === 'yesterday') return text.yesterday;
	const opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };
	if (age.withYear) opts.year = 'numeric';
	return text.since(formatDayLabel(day, opts, locale));
}

/** The first `limit` rows unless expanded; `hidden` = rows left out. */
export function previewOverdue<T>(tasks: readonly T[], expanded: boolean, limit = OVERDUE_PREVIEW) {
	const shown = expanded ? tasks.slice() : tasks.slice(0, limit);
	return { shown, hidden: tasks.length - shown.length };
}

/** Where an explicit reschedule sends overdue tasks. */
export type OverdueTarget = 'today' | 'tomorrow';

export function parseOverdueTarget(raw: unknown): OverdueTarget | null {
	return raw === 'today' || raw === 'tomorrow' ? raw : null;
}

export function overdueTargetDay(target: OverdueTarget, today: string): string {
	return target === 'today' ? today : addDays(today, 1);
}

/**
 * Which tasks a reschedule request names: `'all'` (every overdue task), or distinct UUIDs
 * (1‥`OVERDUE_MAX_IDS`). Anything else — no ids, a malformed id, too many — is null.
 */
export function parseOverdueSelection(
	all: boolean,
	ids: readonly unknown[]
): string[] | 'all' | null {
	if (all) return ids.length === 0 ? 'all' : null;
	if (ids.length === 0 || ids.length > OVERDUE_MAX_IDS) return null;
	if (!ids.every((id): id is string => typeof id === 'string' && isUuid(id))) return null;
	return [...new Set(ids)];
}

/**
 * New list positions for tasks appended to `day`, keeping their given order: each kind has its
 * own list on a day (quest work, Other), so each continues after that list's current maximum.
 */
export function appendOrders(
	tasks: readonly { id: string; kind: 'quest' | 'other' }[],
	maxOrder: Partial<Record<'quest' | 'other', number | null>>
): Map<string, number> {
	const next = {
		quest: (maxOrder.quest ?? -1) + 1,
		other: (maxOrder.other ?? -1) + 1
	};
	const out = new Map<string, number>();
	for (const task of tasks) out.set(task.id, next[task.kind]++);
	return out;
}

/** Days that hold at least one overdue task (the phone day strip's overdue dot). */
export function overdueDays(tasks: readonly { day: string | null }[]): Set<string> {
	return new Set(tasks.flatMap((t) => (t.day && isISODay(t.day) ? [t.day] : [])));
}
