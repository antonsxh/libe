/**
 * Daily goal — pure, client-safe logic. The goal is a global setting (`settings.daily_goal_min`,
 * null = no goal) like the profile; Phase 3 (streaks) reuses it.
 *
 * - A goal is a whole number of minutes, `DAILY_GOAL_MIN`‥`DAILY_GOAL_MAX`, a multiple of
 *   `DAILY_GOAL_STEP` (15 min … 16 h in quarter hours) — the same rule as the
 *   `settings_daily_goal_chk` constraint, which is built from these constants.
 * - "Logged today" has exactly Home's definition: completed sessions attributed to the day of
 *   their `started_at` in the server timezone (`server/stats.ts` → `todayLog()`). The server
 *   number never contains the active session; clients add its running time from the timer
 *   snapshot (`runningSpan`, `liveLoggedMin`) so the goal ring at Home (nav) and Home move live.
 */
import type { ISODay } from '#lib/dates.ts';
import type { Parsed } from '#lib/profile.ts';
import type { ActiveTimer, TimerView } from '#lib/timer.ts';

export const DAILY_GOAL_MIN = 15;
export const DAILY_GOAL_MAX = 960;
export const DAILY_GOAL_STEP = 15;

/** Choices of the Settings select (minutes); anything else is entered as "Custom". */
export const DAILY_GOAL_PRESETS = [30, 60, 120, 180, 240, 300, 360, 480] as const;
/** Minute choices of the custom hours/minutes input. */
export const DAILY_GOAL_MINUTE_STEPS = [0, 15, 30, 45] as const;

/** Where the goal is edited (Settings section anchor). */
export const GOAL_ANCHOR = 'goal';
export const GOAL_HREF = `/settings#${GOAL_ANCHOR}`;

/** Values of the Settings goal select besides the presets. */
export const GOAL_OFF = 'off';
export const GOAL_CUSTOM = 'custom';

/** A valid stored/entered goal in minutes. */
export function isDailyGoal(value: unknown): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= DAILY_GOAL_MIN &&
		value <= DAILY_GOAL_MAX &&
		value % DAILY_GOAL_STEP === 0
	);
}

/** A stored value as a goal (anything invalid → no goal). */
export function toDailyGoal(raw: number | null | undefined): number | null {
	return isDailyGoal(raw) ? raw : null;
}

/** A whole, non-negative number from a form field ('' → 0); NaN when it isn't one. */
function wholeNumber(raw: unknown): number {
	if (raw === null || raw === undefined) return 0;
	const text = String(raw).trim();
	if (text === '') return 0;
	if (!/^\d+$/.test(text)) return NaN;
	return Number(text);
}

/**
 * The goal from the Settings form: `preset` = `off` (no goal), one of the presets' minutes,
 * or `custom` with `hours` + `minutes`. Out of range / not a quarter hour → `dailyGoalInvalid`.
 */
export function parseDailyGoal(fields: {
	preset: unknown;
	hours?: unknown;
	minutes?: unknown;
}): Parsed<number | null> {
	const preset = typeof fields.preset === 'string' ? fields.preset.trim() : '';
	if (preset === '' || preset === GOAL_OFF) return { ok: true, value: null };
	let total: number;
	if (preset === GOAL_CUSTOM) {
		const h = wholeNumber(fields.hours);
		const m = wholeNumber(fields.minutes);
		total = h * 60 + m;
	} else {
		total = wholeNumber(preset);
	}
	return isDailyGoal(total) ? { ok: true, value: total } : { ok: false, error: 'dailyGoalInvalid' };
}

/** The select value for a stored goal: `off`, a preset, or `custom`. */
export function goalChoice(goalMin: number | null): string {
	if (goalMin === null) return GOAL_OFF;
	return (DAILY_GOAL_PRESETS as readonly number[]).includes(goalMin)
		? String(goalMin)
		: GOAL_CUSTOM;
}

/** Whole hours and the remaining minutes (negative → 0; fractions rounded down). */
export function splitMinutes(min: number): { h: number; m: number } {
	const total = Math.max(0, Math.floor(min));
	return { h: Math.floor(total / 60), m: total % 60 };
}

// ─── Today's progress ───────────────────────────────────────────────────────

/** Logged time today from the server (root layout data). Times are epoch ms. */
export interface TodayLog {
	day: ISODay;
	/** Completed sessions started today (server TZ), in minutes — Home's "today". */
	loggedMin: number;
	/** `[start, end)` of `day` in the server timezone. */
	start: number;
	end: number;
}

/** The active focus session's running time (not yet in {@link TodayLog.loggedMin}). */
export interface RunningSpan {
	startedAt: number;
	elapsedMs: number;
}

/**
 * The running time of the active session as the timer view shows it (0 in breaks and waiting
 * phases → null). Its start comes from the snapshot's session.
 */
export function runningSpan(
	timer: ActiveTimer | null | undefined,
	view: TimerView | null | undefined
): RunningSpan | null {
	const session = timer?.session;
	if (!session || !view || !view.isFocus || view.elapsedMs <= 0) return null;
	return { startedAt: session.startedAt, elapsedMs: view.elapsedMs };
}

/**
 * Minutes logged today at server time `now`: the server's completed minutes plus the active
 * session's running time when it started today (a session counts for the day it started,
 * like Home). After midnight (page open since yesterday, data not refreshed yet) yesterday's
 * minutes no longer count; a session started after `log.end` does.
 */
export function liveLoggedMin(log: TodayLog, running: RunningSpan | null, now: number): number {
	const stale = now >= log.end;
	const base = stale ? 0 : log.loggedMin;
	if (!running) return base;
	const today = stale
		? running.startedAt >= log.end
		: running.startedAt >= log.start && running.startedAt < log.end;
	return base + (today ? Math.max(0, running.elapsedMs) / 60_000 : 0);
}

export interface GoalProgress {
	/** Whole minutes logged (rounded down — "done" only once the goal is really reached). */
	loggedMin: number;
	goalMin: number;
	/** Share of the goal, clamped to 0‥1. */
	fraction: number;
	done: boolean;
}

/** Progress towards `goalMin` (a valid goal) after `loggedMin` minutes. */
export function goalProgress(loggedMin: number, goalMin: number): GoalProgress {
	const logged = Number.isFinite(loggedMin) ? Math.max(0, Math.floor(loggedMin)) : 0;
	const goal = Math.max(1, goalMin);
	return {
		loggedMin: logged,
		goalMin,
		fraction: Math.min(1, logged / goal),
		done: logged >= goal
	};
}
