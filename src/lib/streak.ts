/**
 * Streaks — pure, client-safe logic (Profile Phase 3).
 *
 * - A **streak day** is a day whose logged minutes reach the threshold: the daily goal when one
 *   is set (`settings.daily_goal_min`), otherwise {@link STREAK_FALLBACK_MIN}. Logged minutes
 *   per day have exactly the definition of `todayLog()` / Home's "today": completed sessions
 *   attributed to the day of their `started_at` in the server timezone (`loggedMinutesByDay`
 *   in `#lib/stats-core.ts`). Every past day is judged with the *current* threshold — there is
 *   no goal history, so changing the goal re-evaluates the whole streak.
 * - **Rest days** (`settings.streak_rest_days`, a weekday bitmask, bit 0 = Monday … bit 6 =
 *   Sunday, at most {@link MAX_REST_DAYS}): a rest day below the threshold neither breaks nor
 *   extends a streak; a rest day that reaches it extends it like any other day.
 * - **Current streak**: consecutive streak days ending today or yesterday (rest days in between
 *   skipped). Today below the threshold doesn't break it yet — the state is `pending` until
 *   midnight (`rest` when today is a rest day: nothing to do).
 * - **Live**: the server computes {@link StreakBase} (everything before today, `streakBase`);
 *   the client adds today's live minutes (`liveLoggedMin`) with {@link liveStreak}, so a running
 *   session crossing the threshold flips `pending → active` without a reload.
 *
 * Day arithmetic uses `#lib/dates.ts` (UTC on the date parts) — DST never shifts a day.
 */
import { addDays, daysBetween, weekdayIndex, type ISODay } from '#lib/dates.ts';
import { liveLoggedMin, type RunningSpan, type TodayLog } from '#lib/daily-goal.ts';
import type { Parsed } from '#lib/profile.ts';

/** Threshold of a streak day while no daily goal is set (minutes). */
export const STREAK_FALLBACK_MIN = 25;
/** At most this many rest days a week — a week of rest days would never need a streak day. */
export const MAX_REST_DAYS = 6;
/** Bitmask of all seven weekdays (not a valid setting: see {@link MAX_REST_DAYS}). */
export const ALL_WEEKDAYS_MASK = 0b111_1111;
/** Largest valid mask value — the check constraint is `0 … REST_MASK_MAX` minus the full week. */
export const REST_MASK_MAX = ALL_WEEKDAYS_MASK - 1;

/** Where the rest days are edited: Settings' "Daily goal and streak" (old anchor `#streak` too). */
export const STREAK_ANCHOR = 'streak';
export const STREAK_HREF = '/settings?section=goal';

// ─── Rest days ──────────────────────────────────────────────────────────────

/** Number of set bits (weekdays) in a mask. */
function bitCount(mask: number): number {
	let n = 0;
	for (let i = 0; i < 7; i++) if (mask & (1 << i)) n++;
	return n;
}

/** A valid stored rest-day mask: whole number 0‥127 with at most six weekdays. */
export function isRestMask(value: unknown): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= 0 &&
		value <= ALL_WEEKDAYS_MASK &&
		bitCount(value) <= MAX_REST_DAYS
	);
}

/** A stored value as a mask (anything invalid → no rest days). */
export function toRestMask(raw: number | null | undefined): number {
	return isRestMask(raw) ? raw : 0;
}

/** Weekday indices (0 = Monday … 6 = Sunday) of a mask, ascending. */
export function restWeekdays(mask: number): number[] {
	return Array.from({ length: 7 }, (_, i) => i).filter((i) => (mask & (1 << i)) !== 0);
}

/** Mask of weekday indices (0 = Monday … 6 = Sunday). */
export function restMaskOf(weekdays: Iterable<number>): number {
	let mask = 0;
	for (const i of weekdays) mask |= 1 << i;
	return mask;
}

/** Is `day` one of the rest weekdays? */
export function isRestDay(mask: number, day: ISODay): boolean {
	return (mask & (1 << weekdayIndex(day))) !== 0;
}

/**
 * Rest days from the Settings form: the values of the `restDay` checkboxes (`"0"` = Monday …
 * `"6"` = Sunday; duplicates are harmless). Unknown values → `streakRestDayInvalid`, all seven
 * → `streakRestDaysTooMany`.
 */
export function parseRestDays(values: readonly unknown[]): Parsed<number> {
	let mask = 0;
	for (const raw of values) {
		const text = typeof raw === 'string' ? raw.trim() : '';
		if (!/^[0-6]$/.test(text)) return { ok: false, error: 'streakRestDayInvalid' };
		mask |= 1 << Number(text);
	}
	return bitCount(mask) > MAX_REST_DAYS
		? { ok: false, error: 'streakRestDaysTooMany' }
		: { ok: true, value: mask };
}

// ─── Threshold ──────────────────────────────────────────────────────────────

export interface StreakThreshold {
	/** Minutes a day needs to count. */
	min: number;
	/** true = the daily goal, false = the {@link STREAK_FALLBACK_MIN} fallback. */
	fromGoal: boolean;
}

export function streakThreshold(goalMin: number | null | undefined): StreakThreshold {
	return goalMin && goalMin > 0
		? { min: goalMin, fromGoal: true }
		: { min: STREAK_FALLBACK_MIN, fromGoal: false };
}

/** Does a day with `min` logged minutes count? (Same comparison as the goal ring's "done".) */
export function qualifies(min: number | undefined, threshold: number): boolean {
	return Number.isFinite(min) && (min as number) >= threshold;
}

// ─── Streak ─────────────────────────────────────────────────────────────────

/** Logged minutes per ISO day (any order; days without time may be absent). */
export type MinutesByDay = ReadonlyMap<ISODay, number> | Readonly<Record<ISODay, number>>;

function entries(byDay: MinutesByDay): Array<[ISODay, number]> {
	return byDay instanceof Map ? [...byDay] : Object.entries(byDay);
}

/** What the server knows: the streak through yesterday (root layout data `streak`). */
export interface StreakBase {
	/** Today (server timezone) — the day {@link liveStreak} adds. */
	day: ISODay;
	/** Minutes a day needs. */
	threshold: number;
	/** Threshold is the daily goal (else the fallback). */
	fromGoal: boolean;
	/** Rest weekdays (bit 0 = Monday). */
	restMask: number;
	/** Streak ending yesterday (rest days skipped); 0 when broken or none. */
	before: number;
	/** Longest streak among the days before `day`. */
	longestBefore: number;
}

export interface StreakInput {
	minutesByDay: MinutesByDay;
	today: ISODay;
	threshold: number;
	restMask: number;
	fromGoal?: boolean;
}

/**
 * The streak through yesterday from the logged minutes per day — `today` and later days are
 * ignored. Walks only the qualifying days: between two of them the streak continues iff every
 * day in the gap is a rest day (at most six in a row, so a gap of a week always breaks it).
 */
export function streakBase({
	minutesByDay,
	today,
	threshold,
	restMask,
	fromGoal = false
}: StreakInput): StreakBase {
	const mask = toRestMask(restMask);
	const days = entries(minutesByDay)
		.filter(([day, min]) => day < today && qualifies(min, threshold))
		.map(([day]) => day)
		.sort();
	/** Every day strictly between `a` and `b` is a rest day. */
	const bridged = (a: ISODay, b: ISODay): boolean => {
		const gap = daysBetween(a, b) - 1;
		if (gap > MAX_REST_DAYS) return false;
		for (let i = 1; i <= gap; i++) if (!isRestDay(mask, addDays(a, i))) return false;
		return true;
	};

	let run = 0;
	let longest = 0;
	let prev: ISODay | null = null;
	for (const day of days) {
		if (prev !== null && day === prev) continue;
		run = prev !== null && bridged(prev, day) ? run + 1 : 1;
		longest = Math.max(longest, run);
		prev = day;
	}
	const before = prev !== null && bridged(prev, today) ? run : 0;
	return { day: today, threshold, fromGoal, restMask: mask, before, longestBefore: longest };
}

/**
 * `active`: today counts. `pending`: the streak is alive but today hasn't reached the threshold
 * yet. `rest`: alive, today is a rest day below the threshold (nothing to do). `none`: no streak.
 */
export type StreakState = 'active' | 'pending' | 'rest' | 'none';

export interface Streak {
	/** Days in the current streak (including today once it counts). */
	current: number;
	/** Longest streak ever, the current one included. */
	longest: number;
	state: StreakState;
	/** Today's logged minutes used. */
	todayMin: number;
	threshold: number;
	fromGoal: boolean;
	/** Whole minutes still needed today (rounded up; 0 once today counts). */
	remainingMin: number;
	/** Today is a rest day. */
	restToday: boolean;
	/** The milestone the streak reached *today* (7, 30, 100 …), else null. */
	milestone: number | null;
}

/** The streak once today has `todayMin` logged minutes. */
export function liveStreak(base: StreakBase, todayMin: number): Streak {
	const min = Number.isFinite(todayMin) ? Math.max(0, todayMin) : 0;
	const done = qualifies(min, base.threshold);
	const restToday = isRestDay(base.restMask, base.day);
	const current = done ? base.before + 1 : base.before;
	const state: StreakState = done
		? 'active'
		: base.before === 0
			? 'none'
			: restToday
				? 'rest'
				: 'pending';
	return {
		current,
		longest: Math.max(base.longestBefore, current),
		state,
		todayMin: min,
		threshold: base.threshold,
		fromGoal: base.fromGoal,
		remainingMin: done ? 0 : Math.max(1, Math.ceil(base.threshold - min)),
		restToday,
		milestone: done && isStreakMilestone(current) ? current : null
	};
}

/** The base for the next day, once `day` ended with `dayMin` logged minutes. */
export function nextStreakBase(base: StreakBase, dayMin: number): StreakBase {
	const before = qualifies(dayMin, base.threshold)
		? base.before + 1
		: isRestDay(base.restMask, base.day)
			? base.before
			: 0;
	return {
		...base,
		day: addDays(base.day, 1),
		before,
		longestBefore: Math.max(base.longestBefore, before)
	};
}

/** Current and longest streak from the logged minutes per day (today included). */
export function computeStreak(input: StreakInput): Streak {
	const byDay = entries(input.minutesByDay);
	const todayMin = byDay
		.filter(([day]) => day === input.today)
		.reduce((sum, [, min]) => sum + min, 0);
	return liveStreak(streakBase(input), todayMin);
}

/**
 * The streak as a page shows it: the server base plus today's live minutes (completed sessions
 * from `todayLog` + the running session, exactly the goal ring's number). When the page has
 * been open past midnight (`now ≥ log.end`) and the data isn't refreshed yet, the base rolls to
 * the new day with yesterday's server minutes.
 */
export function pageStreak(
	base: StreakBase,
	log: TodayLog,
	running: RunningSpan | null,
	now: number
): Streak {
	const todayMin = liveLoggedMin(log, running, now);
	const rolled =
		now >= log.end && base.day === log.day ? nextStreakBase(base, log.loggedMin) : base;
	return liveStreak(rolled, todayMin);
}

/**
 * The hint under Home's streak chip — only while it helps: `keep` while a running streak still
 * needs time today, `rest` on a rest day that carries it, `start` once today has some time but
 * not enough to start a streak. Nothing while there is no streak and nothing logged today
 * ("Log 25 min today to start one" on every quiet day is noise) and once today counts.
 */
export type StreakHint = 'keep' | 'rest' | 'start';

export function streakHint(streak: Streak): StreakHint | null {
	if (streak.milestone !== null) return null;
	switch (streak.state) {
		case 'pending':
			return 'keep';
		case 'rest':
			return 'rest';
		case 'none':
			return streak.todayMin > 0 ? 'start' : null;
		default:
			return null;
	}
}

// ─── Milestones ─────────────────────────────────────────────────────────────

export const STREAK_MILESTONES = [7, 30, 100, 365] as const;

/** 7, 30, 100, 365 days — and after 100 every further hundred and every full year. */
export function isStreakMilestone(n: number): boolean {
	if (!Number.isInteger(n) || n <= 0) return false;
	if ((STREAK_MILESTONES as readonly number[]).includes(n)) return true;
	return (n > 100 && n % 100 === 0) || (n > 365 && n % 365 === 0);
}

// ─── Week markers (Review) ──────────────────────────────────────────────────

/**
 * One day of a week row: `done` reached the threshold, `rest` a rest day below it, `missed` a
 * past day that broke (or didn't extend) a streak, `today` not reached yet, `future`.
 */
export type StreakMark = 'done' | 'rest' | 'missed' | 'today' | 'future';

/**
 * Markers for the days of a week from their logged minutes. Today uses `todayMin` (live) when
 * given, else its entry in `days`. Rest days in the future show as `rest`.
 */
export function streakMarks(
	days: ReadonlyArray<{ day: ISODay; min: number }>,
	{
		today,
		threshold,
		restMask,
		todayMin
	}: { today: ISODay; threshold: number; restMask: number; todayMin?: number }
): StreakMark[] {
	const mask = toRestMask(restMask);
	return days.map(({ day, min }) => {
		const rest = isRestDay(mask, day);
		if (day > today) return rest ? 'rest' : 'future';
		const value = day === today && todayMin !== undefined ? todayMin : min;
		if (qualifies(value, threshold)) return 'done';
		if (rest) return 'rest';
		return day === today ? 'today' : 'missed';
	});
}
