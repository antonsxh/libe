/**
 * The one text format for a planned or logged **duration** (task cards, Next up, backlog,
 * Calendar totals, Review day bars, session lists): `25 min`, `1 h`, `1 h 30 min`, `26 h`.
 * Clock-style `mm:ss` / `h:mm:ss` is only for the live timer (`formatClock` in `#lib/timer.ts`);
 * decimal hours for stats/charts stay with `formatHours` (`#lib/dates.ts`).
 *
 * Units are the same in English and German (`h`, `min`); German puts a narrow no-break space
 * between number and unit (like `formatHours`). The i18n messages' `goal.duration` uses this
 * too. Give inline durations `white-space: nowrap` where a line could break inside one.
 */

/** Whole minutes (rounded, never negative) → `25 min` / `1 h` / `1 h 30 min`. */
export function formatDurationMin(minutes: number, locale = 'en-US'): string {
	const total = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
	const sp = locale.startsWith('en') ? ' ' : '\u202f';
	const h = Math.floor(total / 60);
	const m = total % 60;
	if (h === 0) return `${m}${sp}min`;
	return m === 0 ? `${h}${sp}h` : `${h}${sp}h ${m}${sp}min`;
}

/** Milliseconds → {@link formatDurationMin} (rounded to the nearest minute). */
export function formatDurationMs(ms: number, locale = 'en-US'): string {
	return formatDurationMin(ms / 60_000, locale);
}
