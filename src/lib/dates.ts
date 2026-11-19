/**
 * Calendar-day helpers. A "day" is an ISO date string `YYYY-MM-DD` without timezone,
 * matching the `date` columns in the database. Weeks start on Monday.
 * All arithmetic is done in UTC on the date parts, so DST never shifts a day.
 */

export type ISODay = string;

const DAY_MS = 86_400_000;

/** Today's date in the given IANA timezone (default: the runtime's timezone, i.e. `TZ` on the server). */
export function todayISO(timeZone?: string, now: Date = new Date()): ISODay {
	// en-CA formats as YYYY-MM-DD
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
}

export function parseDay(day: ISODay): Date {
	const [y, m, d] = day.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

export function formatDay(date: Date): ISODay {
	return date.toISOString().slice(0, 10);
}

export function isISODay(value: unknown): value is ISODay {
	return (
		typeof value === 'string' &&
		/^\d{4}-\d{2}-\d{2}$/.test(value) &&
		formatDay(parseDay(value)) === value
	);
}

export function addDays(day: ISODay, n: number): ISODay {
	return formatDay(new Date(parseDay(day).getTime() + n * DAY_MS));
}

/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(day: ISODay): number {
	return (parseDay(day).getUTCDay() + 6) % 7;
}

/** Monday of the week containing `day`. */
export function startOfWeek(day: ISODay): ISODay {
	return addDays(day, -weekdayIndex(day));
}

/** The 7 days (Mon–Sun) of the week containing `day`. */
export function weekDays(day: ISODay): ISODay[] {
	const monday = startOfWeek(day);
	return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/**
 * Month heading for the week whose Monday is `monday`: `"October 2026"`, or
 * `"Oct – Nov 2026"` when the Mon–Sun range spans two months (with years baked
 * in when it spans a year end: `"Dec 2025 – Jan 2026"`).
 */
export function weekMonthLabel(monday: ISODay, locale = 'en-US'): string {
	const first = parseDay(monday);
	const last = new Date(first.getTime() + 6 * DAY_MS);
	if (
		first.getUTCFullYear() === last.getUTCFullYear() &&
		first.getUTCMonth() === last.getUTCMonth()
	) {
		return formatDayLabel(monday, { month: 'long', year: 'numeric' }, locale);
	}
	const fmt = (d: Date, options: Intl.DateTimeFormatOptions) =>
		new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(d);
	const sameYear = first.getUTCFullYear() === last.getUTCFullYear();
	const left = sameYear
		? fmt(first, { month: 'short' })
		: fmt(first, { month: 'short', year: 'numeric' });
	return `${left} – ${fmt(last, { month: 'short', year: 'numeric' })}`;
}

/**
 * Compact range label for the week whose Monday is `monday`: `"Nov 9 – 15"`, or
 * `"Oct 26 – Nov 1"` when the Mon–Sun range spans two months (also across a year end).
 * Other locales use their own range pattern (German: `"9.–15. Nov."`).
 */
export function weekRangeLabel(monday: ISODay, locale = 'en-US'): string {
	const sunday = addDays(monday, 6);
	return dayRangeLabel(monday, sunday, locale);
}

/** `"Oct 1 – Dec 31"` / `"1. Okt. – 31. Dez."` (month + day; one month shown once when shared). */
export function dayRangeLabel(first: ISODay, last: ISODay, locale = 'en-US'): string {
	const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' };
	if (!locale.startsWith('en')) {
		return new Intl.DateTimeFormat(locale, options).formatRange(parseDay(first), parseDay(last));
	}
	const left = formatDayLabel(first, options, locale);
	const sameMonth = first.slice(0, 7) === last.slice(0, 7);
	const right = sameMonth
		? String(Number(last.slice(8, 10)))
		: formatDayLabel(last, options, locale);
	return `${left} – ${right}`;
}

/** First day of the calendar quarter containing `day`. */
export function startOfQuarter(day: ISODay): ISODay {
	const d = parseDay(day);
	const month = Math.floor(d.getUTCMonth() / 3) * 3;
	return formatDay(new Date(Date.UTC(d.getUTCFullYear(), month, 1)));
}

/** Last day of the calendar quarter containing `day`. */
export function endOfQuarter(day: ISODay): ISODay {
	const d = parseDay(day);
	const month = Math.floor(d.getUTCMonth() / 3) * 3 + 3;
	return formatDay(new Date(Date.UTC(d.getUTCFullYear(), month, 0)));
}

/** Whole days from `a` to `b` (`b - a`; negative when `b` is earlier). */
export function daysBetween(a: ISODay, b: ISODay): number {
	return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / DAY_MS);
}

/** Format a day for display, e.g. `formatDayLabel('2026-10-15', { weekday: 'long', month: 'long', day: 'numeric' })`. */
export function formatDayLabel(
	day: ISODay,
	options: Intl.DateTimeFormatOptions,
	locale = 'en-US'
): string {
	return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }).format(parseDay(day));
}

/** Minutes since midnight → `HH:MM` (e.g. 570 → "09:30"). */
export function formatMinutes(min: number): string {
	const h = Math.floor(min / 60);
	const m = min % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Minute of the current day (0‥1439) in the given timezone (default: the runtime's). */
export function minuteOfDay(now: Date = new Date(), timeZone?: string): number {
	const s = new Intl.DateTimeFormat('en-US', {
		hourCycle: 'h23',
		hour: '2-digit',
		minute: '2-digit',
		timeZone
	}).format(now);
	const m = /^(\d{2}):(\d{2})$/.exec(s);
	return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** Milliseconds → `H:MM:SS` or `MM:SS` (timer display). */
export function formatDuration(ms: number): string {
	const total = Math.max(0, Math.round(ms / 1000));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const mm = String(m).padStart(2, '0');
	const ss = String(s).padStart(2, '0');
	return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Hours with at most one decimal, without trailing `.0` (10.5 → "10.5h", 3 → "3h");
 * German: decimal comma and a narrow space before the unit ("10,5 h").
 */
export function formatHours(hours: number, locale = 'en-US'): string {
	return `${formatDecimal(Math.round(hours * 10) / 10, locale)}${hourUnit(locale)}`;
}

/** The hour unit appended to a number: `h` (English), narrow no-break space + `h` (German). */
export function hourUnit(locale = 'en-US'): string {
	return locale.startsWith('en') ? 'h' : '\u202fh';
}

/** A number as written in `locale` (English keeps the plain `String(n)` form: no grouping). */
export function formatDecimal(n: number, locale = 'en-US'): string {
	return locale.startsWith('en')
		? String(n)
		: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
}
