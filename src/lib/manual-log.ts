/**
 * "Log time afterwards" (manual sessions) — pure validation, client-safe.
 * Wall-clock inputs (`day` + `HH:MM`) are interpreted in the server timezone (`TZ`), the same
 * zone that attributes sessions to days.
 */
import { addDays, isISODay } from '#lib/dates.ts';
import { parseClock } from '#lib/timeline.ts';
import { MAX_TIMER_MIN } from '#lib/timer.ts';
import type { ErrorCode } from '#lib/i18n/index.ts';

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

/** Error codes per field (`t.errors[code]`). */
export type ManualLogErrors = { day?: ErrorCode; start?: ErrorCode; duration?: ErrorCode };

export type ManualLogResult =
	| { ok: true; startedAt: Date; endedAt: Date; durationMin: number }
	| { ok: false; errors: ManualLogErrors };

interface SpanContext {
	now: Date;
	timeZone?: string;
	/** Span of the currently running/paused session (`[startedAt, now)`) → no overlap allowed. */
	active?: { start: Date; end: Date } | null;
}

/** Rules shared by every logged span: not in the future, not too old, clear of the timer. */
function checkSpan(
	startedAt: Date,
	endedAt: Date,
	{ now, active }: SpanContext
): { kind: 'future' | 'age' | 'active'; code: ErrorCode } | null {
	if (endedAt.getTime() > now.getTime() + FUTURE_SLACK_MS)
		return { kind: 'future', code: 'logInFuture' };
	if (startedAt.getTime() < now.getTime() - MANUAL_LOG_MAX_AGE_DAYS * DAY_MS)
		return { kind: 'age', code: 'logTooOld' };
	if (
		active &&
		overlaps(startedAt.getTime(), endedAt.getTime(), active.start.getTime(), active.end.getTime())
	)
		return { kind: 'active', code: 'logOverlapsTimer' };
	return null;
}

/**
 * Validate a manual log: valid day + `HH:MM`, 1‥1440 whole minutes, starting within the last
 * {@link MANUAL_LOG_MAX_AGE_DAYS} days and ending no later than `now`.
 * `active` = span of the currently running/paused session (`[startedAt, now)`) → no overlap.
 */
export function validateManualLog(input: ManualLogInput, ctx: SpanContext): ManualLogResult {
	const errors: ManualLogErrors = {};
	if (!isISODay(input.day)) errors.day = 'pickDate';
	const startMin = parseClock(input.start);
	if (startMin === null) errors.start = 'pickStartTime';
	const rawDur = input.durationMin;
	const dur = typeof rawDur === 'number' ? rawDur : Number(String(rawDur ?? '').trim() || NaN);
	if (!Number.isInteger(dur) || dur < 1 || dur > MAX_TIMER_MIN)
		errors.duration = 'logDurationInvalid';
	if (Object.keys(errors).length > 0 || startMin === null) return { ok: false, errors };

	const startedAt = wallTimeToDate(input.day as string, startMin, ctx.timeZone);
	const endedAt = new Date(startedAt.getTime() + dur * 60_000);
	const problem = checkSpan(startedAt, endedAt, ctx);
	if (problem)
		return {
			ok: false,
			errors: problem.kind === 'age' ? { day: problem.code } : { start: problem.code }
		};
	return { ok: true, startedAt, endedAt, durationMin: dur };
}

/** Start and end as explicit wall times (calendar edit / log dialog). */
export interface SessionSpanInput {
	day: unknown;
	start: unknown;
	endDay: unknown;
	end: unknown;
}

export type SessionSpanErrors = { day?: ErrorCode; start?: ErrorCode; end?: ErrorCode };

export type SessionSpanResult =
	| { ok: true; startedAt: Date; endedAt: Date; durationMin: number }
	| { ok: false; errors: SessionSpanErrors };

/**
 * Keep an existing instant when the edited wall time names the same minute — `HH:MM` inputs
 * cannot express seconds, so an untouched field must not shift `10:58:23` to `10:58:00`.
 */
export function keepSameMinute(parsed: Date, original: Date | null | undefined): Date {
	if (!original) return parsed;
	const floor = Math.floor(original.getTime() / 60_000) * 60_000;
	return floor === parsed.getTime() ? original : parsed;
}

/**
 * Validate a span given as start day + `HH:MM` and end day + `HH:MM` (server `TZ`):
 * end after start, at most {@link MAX_TIMER_MIN} minutes, plus the shared rules (not in the
 * future, ≤ 365 days back, no overlap with the active session). `original` = the session
 * being edited (unchanged minutes keep their seconds).
 */
export function validateSessionSpan(
	input: SessionSpanInput,
	ctx: SpanContext & { original?: { startedAt: Date; endedAt: Date | null } }
): SessionSpanResult {
	const errors: SessionSpanErrors = {};
	const startMin = parseClock(input.start);
	const endMin = parseClock(input.end);
	if (!isISODay(input.day)) errors.day = 'pickStartDate';
	else if (startMin === null) errors.start = 'pickStartTime';
	if (!isISODay(input.endDay) || endMin === null) errors.end = 'pickEnd';
	if (Object.keys(errors).length > 0 || startMin === null || endMin === null)
		return { ok: false, errors };

	const startedAt = keepSameMinute(
		wallTimeToDate(input.day as string, startMin, ctx.timeZone),
		ctx.original?.startedAt
	);
	const endedAt = keepSameMinute(
		wallTimeToDate(input.endDay as string, endMin, ctx.timeZone),
		ctx.original?.endedAt
	);
	const spanMs = endedAt.getTime() - startedAt.getTime();
	if (spanMs <= 0) return { ok: false, errors: { end: 'endBeforeStart' } };
	if (spanMs > MAX_TIMER_MIN * 60_000) return { ok: false, errors: { end: 'sessionTooLong' } };
	const problem = checkSpan(startedAt, endedAt, ctx);
	if (problem) {
		const field = problem.kind === 'future' ? 'end' : problem.kind === 'age' ? 'day' : 'start';
		return { ok: false, errors: { [field]: problem.code } };
	}
	return { ok: true, startedAt, endedAt, durationMin: Math.max(1, Math.round(spanMs / 60_000)) };
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
