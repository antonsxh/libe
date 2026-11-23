/**
 * Calendar (weekly log) — pure layout and totals, client-safe (no DB imports).
 *
 * Sessions are drawn at their **actual wall-clock span** in the server timezone: a block
 * runs from `startedAt` to `endedAt` (paused time is not cut out — it only reduces the
 * logged minutes), and a session crossing midnight is split into one segment per day.
 * Day totals follow the same split: each day gets the part of the session's logged time
 * that falls on it (pauses are spread proportionally over the span). This differs from the
 * stats elsewhere (Home, Quests), which attribute a whole session to the day of `started_at`.
 */
import { formatDayLabel, type ISODay } from '#lib/dates.ts';
import { dayBounds } from '#lib/manual-log.ts';
import { layoutBlocks } from '#lib/timeline.ts';

/** A logged (or the live active) session, serialisable (ms timestamps). */
export interface CalendarSession {
	id: string;
	taskId: string;
	taskTitle: string;
	taskDone: boolean;
	/** null for tasks of kind `other`. */
	questId: string | null;
	questName: string | null;
	questColor: string | null;
	source: 'focus' | 'manual' | 'pomodoro';
	startedAt: number;
	/** End of the span (for the active session: "now"). Always > `startedAt`. */
	endedAt: number;
	/** Logged time (span minus pauses). */
	loggedMs: number;
	/** The running/paused session from the timer. */
	active?: boolean;
	/** Active session currently paused. */
	paused?: boolean;
}

/** A task offered by the calendar's task picker. */
export interface PickTask {
	id: string;
	title: string;
	day: ISODay | null;
	kind: 'quest' | 'other';
	done: boolean;
	questName: string | null;
	questColor: string | null;
}

/** A column of the week grid (built by the page load). */
export interface CalendarDay {
	day: ISODay;
	/** `Mon` */
	weekday: string;
	dayNum: number;
	/** `Mon, Nov 9` */
	label: string;
	isToday: boolean;
}

/** The part of a session that falls on one day. Minutes are fractional wall-clock minutes. */
export interface CalendarSegment {
	key: string;
	session: CalendarSession;
	day: ISODay;
	/** 0 ≤ startMin < endMin ≤ 1440 */
	startMin: number;
	endMin: number;
	/** Share of the session's logged time on this day. */
	loggedMs: number;
	/** The session started on an earlier day / ends on a later day. */
	continuesBefore: boolean;
	continuesAfter: boolean;
}

export interface CalendarWeek {
	/** One list per day of `days`, in start order. */
	segments: CalendarSegment[][];
	/** Logged ms per day of `days`. */
	dayMs: number[];
	totalMs: number;
	/** Logged ms on quest tasks / on tasks of kind `other`. */
	questMs: number;
	otherMs: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function wallFormatter(timeZone: string | undefined): Intl.DateTimeFormat {
	const key = timeZone ?? '';
	let f = formatters.get(key);
	if (!f) {
		f = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		formatters.set(key, f);
	}
	return f;
}

/** Fractional wall-clock minutes since midnight of instant `ms` in `timeZone` (0 ≤ m < 1440). */
export function wallMinutes(ms: number, timeZone?: string): number {
	const parts = wallFormatter(timeZone).formatToParts(new Date(ms));
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
	return get('hour') * 60 + get('minute') + get('second') / 60;
}

/** `HH:MM` wall clock of instant `ms` in `timeZone`. */
export function wallClock(ms: number, timeZone?: string): string {
	const m = Math.floor(wallMinutes(ms, timeZone));
	return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** `[start, end)` instants (ms) of each day in `timeZone` (DST-aware: 23/25-hour days). */
export function daySpans(days: ISODay[], timeZone?: string): Array<{ start: number; end: number }> {
	return days.map((day) => {
		const { start, end } = dayBounds(day, timeZone);
		return { start: start.getTime(), end: end.getTime() };
	});
}

/**
 * Cut a session into per-day segments for `days` (only days it touches). Positions are wall
 * clock minutes; a segment reaching the day's end is drawn to 1440. If a DST fall-back makes
 * the wall-clock end precede the start, the segment keeps its real length instead.
 */
export function splitSession(
	session: CalendarSession,
	days: ISODay[],
	timeZone?: string,
	spans = daySpans(days, timeZone)
): CalendarSegment[] {
	const out: CalendarSegment[] = [];
	const spanMs = session.endedAt - session.startedAt;
	if (!(spanMs > 0)) return out;
	days.forEach((day, i) => {
		const { start, end } = spans[i];
		const a = Math.max(session.startedAt, start);
		const b = Math.min(session.endedAt, end);
		if (b <= a) return;
		const startMin = a === start ? 0 : wallMinutes(a, timeZone);
		let endMin = b === end ? 1440 : wallMinutes(b, timeZone);
		if (endMin <= startMin) endMin = Math.min(1440, startMin + (b - a) / 60_000);
		out.push({
			key: `${session.id}:${day}`,
			session,
			day,
			startMin,
			endMin,
			loggedMs: (session.loggedMs * (b - a)) / spanMs,
			continuesBefore: session.startedAt < start,
			continuesAfter: session.endedAt > end
		});
	});
	return out;
}

/** Segments and totals of a week (or any list of days). */
export function calendarWeek(
	sessions: CalendarSession[],
	days: ISODay[],
	timeZone?: string
): CalendarWeek {
	const spans = daySpans(days, timeZone);
	const segments: CalendarSegment[][] = days.map(() => []);
	const dayMs = days.map(() => 0);
	let questMs = 0;
	let otherMs = 0;
	for (const s of sessions) {
		for (const seg of splitSession(s, days, timeZone, spans)) {
			const i = days.indexOf(seg.day);
			segments[i].push(seg);
			dayMs[i] += seg.loggedMs;
			if (s.questId) questMs += seg.loggedMs;
			else otherMs += seg.loggedMs;
		}
	}
	for (const list of segments)
		list.sort((x, y) => x.startMin - y.startMin || x.endMin - y.endMin || (x.key < y.key ? -1 : 1));
	return { segments, dayMs, totalMs: questMs + otherMs, questMs, otherMs };
}

/** A segment placed in its day column, with the drawn (possibly enlarged) vertical range. */
export interface PlacedSegment<T> {
	item: T;
	column: number;
	columns: number;
	/** Drawn range in minutes-of-day (≥ `minMin` tall, kept inside 0‥1440). */
	top: number;
	bottom: number;
}

/**
 * Overlap columns for one day. Very short entries are drawn at least `minMin` tall, so the
 * layout uses that drawn range — otherwise a 5-minute entry would visually cover the next one
 * without sharing columns. Reuses {@link layoutBlocks}; preserves input order.
 */
export function layoutDay<T extends { startMin: number; endMin: number }>(
	items: T[],
	minMin = 0
): Array<PlacedSegment<T>> {
	const drawn = items.map((item) => {
		let top = item.startMin;
		let bottom = Math.max(item.endMin, top + minMin);
		if (bottom > 1440) {
			bottom = 1440;
			top = Math.max(0, Math.min(top, 1440 - minMin));
		}
		return { item, startMin: top, endMin: bottom };
	});
	return layoutBlocks(drawn).map((p) => ({
		item: p.block.item,
		column: p.column,
		columns: p.columns,
		top: p.block.startMin,
		bottom: p.block.endMin
	}));
}

/** First hour of the grid: `defaultHour`, or earlier to include the earliest start. */
export function gridStartHour(startMins: number[], defaultHour = 6): number {
	let hour = defaultHour;
	for (const m of startMins) hour = Math.min(hour, Math.floor(m / 60));
	return Math.max(0, hour);
}

/** Minute-of-day for a click `y` px below the grid top, rounded down to `step` minutes. */
export function slotMinute(y: number, hourPx: number, startHour: number, step = 15): number {
	const raw = startHour * 60 + (Math.max(0, y) / hourPx) * 60;
	return Math.min(1440 - step, Math.floor(raw / step) * step);
}

/**
 * Time label of a session: `10:58 – 13:20`, or with weekdays when it spans days
 * (`Thu 22:56 – Fri 00:08`).
 */
export function sessionSpanLabel(
	s: Pick<CalendarSession, 'startedAt' | 'endedAt'>,
	timeZone?: string,
	locale = 'en-US'
): string {
	const day = (ms: number) =>
		new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(new Date(ms));
	const a = day(s.startedAt);
	const b = day(s.endedAt - 1);
	if (a === b) return `${wallClock(s.startedAt, timeZone)} – ${wallClock(s.endedAt, timeZone)}`;
	const wd = (d: string) => formatDayLabel(d, { weekday: 'short' }, locale);
	return `${wd(a)} ${wallClock(s.startedAt, timeZone)} – ${wd(b)} ${wallClock(s.endedAt, timeZone)}`;
}
