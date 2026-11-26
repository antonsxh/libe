/**
 * Phone day view of Plan and Calendar (≤ 720px): which day of the shown week is selected
 * (`?day=YYYY-MM-DD`) and the URLs that step between days. The server never reads `?day=`
 * — it loads the whole week — so changing the day is a client-only navigation.
 */
import { addDays, isISODay, startOfWeek, type ISODay } from './dates.ts';

/**
 * The selected day: `param` when it is a valid day inside the week of `monday`, else today
 * (when the week contains it), else the week's Monday.
 */
export function resolveDay(
	param: string | null | undefined,
	monday: ISODay,
	today: ISODay
): ISODay {
	const inWeek = (d: ISODay) => d >= monday && d <= addDays(monday, 6);
	if (isISODay(param) && inWeek(param)) return param;
	return inWeek(today) ? today : monday;
}

/** The day `delta` days from `day` and the Monday of its week (stepping past Sun/Mon changes week). */
export function stepDay(day: ISODay, delta: number): { day: ISODay; week: ISODay } {
	const next = addDays(day, delta);
	return { day: next, week: startOfWeek(next) };
}

/**
 * `?…` for the same page showing `day`: sets `day` and `week` (its Monday), keeps every other
 * param. Params listed in `weekScoped` (state about days of the shown week, e.g. Plan's
 * `other`) are dropped when `day` lies outside the shown week (`monday`). An action param
 * (`/name`) is never kept.
 */
export function dayHref(
	search: string | URLSearchParams,
	day: ISODay,
	monday: ISODay,
	weekScoped: readonly string[] = []
): string {
	const p = new URLSearchParams(search);
	for (const key of [...p.keys()]) if (key.startsWith('/')) p.delete(key);
	const week = startOfWeek(day);
	if (week !== monday) for (const key of weekScoped) p.delete(key);
	p.set('week', week);
	p.set('day', day);
	return `?${p.toString()}`;
}

/**
 * `?…` for the same page back at the current week with today selected (the day strip's
 * "Today"): drops `week`, `day` and the `weekScoped` params, keeps every other param.
 */
export function todayHref(
	search: string | URLSearchParams,
	weekScoped: readonly string[] = []
): string {
	const p = new URLSearchParams(search);
	for (const key of [...p.keys()]) if (key.startsWith('/')) p.delete(key);
	for (const key of ['week', 'day', ...weekScoped]) p.delete(key);
	const qs = p.toString();
	return qs ? `?${qs}` : '?';
}

/** Plan showing `day` (its week, and the day selected in the phone day view). */
export function planDayHref(day: ISODay): string {
	return `/plan${dayHref('', day, startOfWeek(day))}`;
}

/** Direction of a change from `from` to `to`: 1 = later, -1 = earlier, 0 = same/unknown. */
export function dayDirection(from: ISODay | null | undefined, to: ISODay): -1 | 0 | 1 {
	if (!from || from === to) return 0;
	return to > from ? 1 : -1;
}
