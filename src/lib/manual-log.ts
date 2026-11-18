/**
 * "Log time afterwards" (manual sessions) — pure validation, client-safe.
 * Wall-clock inputs (`day` + `HH:MM`) are interpreted in the server timezone (`TZ`), the same
 * zone that attributes sessions to days.
 */
import { addDays, isISODay } from '#lib/dates.ts';
import { parseClock } from '#lib/timeline.ts';
import { MAX_TIMER_MIN } from '#lib/timer.ts';

const DAY_MS = 86_400_000;
/** Manual logs may reach back this many days. */
export const MANUAL_LOG_MAX_AGE_DAYS = 365;
/** Tolerated clock skew for "not in the future" (client clock vs. server clock). */
const FUTURE_SLACK_MS = 60_000;

/** Offset of `timeZone` from UTC at instant `ms`, in ms (e.g. +3_600_000 for CET). */
export function zoneOffsetMs(ms: number, timeZone?: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	}).formatToParts(new Date(ms));
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	const asUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second')
	);
	return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant of wall time `day` + `minutes` in `timeZone` (default: the runtime zone).
 * Times skipped by a DST jump resolve to the later offset.
 */
export function wallTimeToDate(day: string, minutes: number, timeZone?: string): Date {
	const [y, m, d] = day.split('-').map(Number);
	const naive = Date.UTC(y, m - 1, d, 0, minutes);
	let ms = naive - zoneOffsetMs(naive, timeZone);
	// Second pass: the offset at the result may differ (DST boundary).
	ms = naive - zoneOffsetMs(ms, timeZone);
	return new Date(ms);
}

/** `[start, end)` of a calendar day in `timeZone`. */
export function dayBounds(day: string, timeZone?: string): { start: Date; end: Date } {
	return {
		start: wallTimeToDate(day, 0, timeZone),
		end: wallTimeToDate(addDays(day, 1), 0, timeZone)
	};
}

/** Half-open intervals `[aStart, aEnd)` and `[bStart, bEnd)` intersect. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
	return aStart < bEnd && bStart < aEnd;
}

export interface ManualLogInput {
	day: unknown;
	start: unknown;
	durationMin: unknown;
}

export type ManualLogErrors = { day?: string; start?: string; duration?: string };

export type ManualLogResult =
	| { ok: true; startedAt: Date; endedAt: Date; durationMin: number }
	| { ok: false; errors: ManualLogErrors };

/**
 * Validate a manual log: valid day + `HH:MM`, 1‥1440 whole minutes, starting within the last
 * {@link MANUAL_LOG_MAX_AGE_DAYS} days and ending no later than `now`.
 * `active` = span of the currently running/paused session (`[startedAt, now)`) → no overlap.
 */
export function validateManualLog(
	input: ManualLogInput,
	{
		now,
		timeZone,
		active
	}: { now: Date; timeZone?: string; active?: { start: Date; end: Date } | null }
): ManualLogResult {
	const errors: ManualLogErrors = {};
	if (!isISODay(input.day)) errors.day = 'Pick a date.';
	const startMin = parseClock(input.start);
	if (startMin === null) errors.start = 'Pick a start time.';
	const rawDur = input.durationMin;
	const dur = typeof rawDur === 'number' ? rawDur : Number(String(rawDur ?? '').trim() || NaN);
	if (!Number.isInteger(dur) || dur < 1 || dur > MAX_TIMER_MIN)
		errors.duration = `Duration must be a whole number from 1 to ${MAX_TIMER_MIN} minutes.`;
	if (Object.keys(errors).length > 0 || startMin === null) return { ok: false, errors };

	const startedAt = wallTimeToDate(input.day as string, startMin, timeZone);
	const endedAt = new Date(startedAt.getTime() + dur * 60_000);
	if (endedAt.getTime() > now.getTime() + FUTURE_SLACK_MS)
		return { ok: false, errors: { start: 'That time is in the future.' } };
	if (startedAt.getTime() < now.getTime() - MANUAL_LOG_MAX_AGE_DAYS * DAY_MS)
		return { ok: false, errors: { day: 'Logs can reach back at most 365 days.' } };
	if (
		active &&
		overlaps(startedAt.getTime(), endedAt.getTime(), active.start.getTime(), active.end.getTime())
	)
		return {
			ok: false,
			errors: { start: 'This overlaps the running timer — stop it first or pick another time.' }
		};
	return { ok: true, startedAt, endedAt, durationMin: dur };
}

/** End time `HH:MM` for a start and a duration (wraps past midnight). */
export function endClock(startMin: number, durationMin: number): string {
	const end = (startMin + durationMin) % 1440;
	return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}

/** Duration from start to end clock; an end at/before the start means the next day. */
export function durationBetween(startMin: number, endMin: number): number {
	const d = endMin - startMin;
	return d > 0 ? d : d + 1440;
}
