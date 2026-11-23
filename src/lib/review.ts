/**
 * Weekly review bucketing (pure, client-safe). `server/review.ts` loads completed sessions
 * joined to their task's quest plus all quests and feeds them through {@link buildReview}.
 *
 * Attribution follows `stats-core.ts`: a whole session counts on the day of its `started_at`
 * in the server timezone (the Calendar splits spans at midnight instead, so a day total can
 * differ slightly there). Only completed sessions are passed in — the active one is live-only.
 *
 * The quarter section shows the calendar quarter of the shown week's **Monday**; a week that
 * spans two quarters therefore belongs to the quarter it starts in. Quarter totals count days
 * inside the quarter only, and the sparkline's weekly buckets are clipped to the quarter, so
 * they always sum to the quarter total.
 */
import {
	addDays,
	daysBetween,
	endOfQuarter,
	formatDayLabel,
	formatDecimal,
	formatHours,
	hourUnit,
	startOfQuarter,
	startOfWeek,
	todayISO,
	type ISODay
} from '#lib/dates.ts';
import { sessionMinutes, type SessionRow } from '#lib/stats-core.ts';
import type { I18n } from '#lib/i18n/index.ts';

export type { SessionRow };

export interface ReviewQuest {
	id: string;
	name: string;
	icon: string;
	color: string;
	weeklyBudgetH: number | null;
	closed: boolean;
}

export type DayState = 'past' | 'today' | 'future';

export interface QuestMinutes {
	questId: string;
	min: number;
}

export interface ReviewDay {
	day: ISODay;
	state: DayState;
	questMin: number;
	otherMin: number;
	/** Quest minutes of that day per quest, most first. */
	byQuest: QuestMinutes[];
}

export interface QuestWeekRow {
	quest: ReviewQuest;
	weekMin: number;
	/** Weekly budget in minutes; null for closed quests and quests without a budget. */
	budgetMin: number | null;
}

export interface WeekComparison {
	/** Days compared from the start of each week (7 for past weeks, elapsed days for the current one). */
	days: number;
	/** Previous week's first `days` days. */
	questMin: number;
	totalMin: number;
	dailyAvgMin: number;
	questShare: number | null;
}

export interface ReviewWeek {
	monday: ISODay;
	days: ReviewDay[];
	questMin: number;
	otherMin: number;
	totalMin: number;
	/** Sum of the open quests' weekly budgets (minutes). */
	budgetMin: number;
	/** 7 for past weeks, days up to and including today for the current week, 0 for future weeks. */
	daysElapsed: number;
	/** Total logged minutes ÷ {@link daysElapsed} (0 when no day has elapsed). */
	dailyAvgMin: number;
	/** Quest minutes ÷ total minutes (0‥1); null when nothing was logged. */
	questShare: number | null;
	/** Open quests and quests with time this week, most hours first. */
	quests: QuestWeekRow[];
	/** Same span of the previous week; null for future weeks. */
	previous: WeekComparison | null;
}

export interface QuarterQuestRow {
	quest: ReviewQuest;
	quarterMin: number;
	/** Minutes per quarter week (see {@link ReviewQuarter.weeks}), clipped to the quarter. */
	weeklyMin: number[];
	/** Weekly budget × weeks elapsed (minutes); null for closed quests / no budget. */
	budgetMin: number | null;
}

export interface QuarterInfo {
	start: ISODay;
	end: ISODay;
	/** `Q4 2026` */
	label: string;
	/** `Oct 1 – Dec 31` */
	rangeLabel: string;
}

export interface ReviewQuarter extends QuarterInfo {
	/** Mondays of the quarter's weeks so far (first week may start before `start`). */
	weeks: ISODay[];
	/** Index of the shown week in {@link weeks}. */
	shownIndex: number;
	/** Days of the quarter up to and including today (0 for a future quarter). */
	elapsedDays: number;
	/** `elapsedDays / 7` — the multiplier for weekly budgets. */
	weeksElapsed: number;
	questMin: number;
	otherMin: number;
	/** Sum of open quests' quarter budgets (minutes). */
	budgetMin: number;
	/** Open quests and quests with time this quarter, open first (in input order). */
	quests: QuarterQuestRow[];
}

export interface Review {
	week: ReviewWeek;
	quarter: ReviewQuarter;
}

/** Calendar quarter containing `day`. */
export function quarterOf(day: ISODay): QuarterInfo {
	const start = startOfQuarter(day);
	const end = endOfQuarter(day);
	const q = (Number(start.slice(5, 7)) - 1) / 3 + 1;
	const fmt = (d: ISODay) => formatDayLabel(d, { month: 'short', day: 'numeric' });
	return {
		start,
		end,
		label: `Q${q} ${start.slice(0, 4)}`,
		rangeLabel: `${fmt(start)} – ${fmt(end)}`
	};
}

/** Days of the week starting `monday` that have begun by `today` (0‥7). */
export function daysElapsedInWeek(monday: ISODay, today: ISODay): number {
	return Math.max(0, Math.min(7, daysBetween(monday, today) + 1));
}

/** Days of `[start, end]` that have begun by `today`. */
function elapsedIn(start: ISODay, end: ISODay, today: ISODay): number {
	const total = daysBetween(start, end) + 1;
	return Math.max(0, Math.min(total, daysBetween(start, today) + 1));
}

/**
 * Mondays of the quarter's weeks shown in the sparkline: from the week containing the
 * quarter's first day up to the later of this week and the shown week, never past the quarter.
 */
export function quarterWeeks(quarter: QuarterInfo, monday: ISODay, today: ISODay): ISODay[] {
	let last = today > monday ? today : monday;
	if (last > quarter.end) last = quarter.end;
	if (last < quarter.start) last = quarter.start;
	const first = startOfWeek(quarter.start);
	const lastMonday = startOfWeek(last);
	const weeks: ISODay[] = [];
	for (let m = first; m <= lastMonday; m = addDays(m, 7)) weeks.push(m);
	return weeks;
}

/**
 * Day range `[from, to)` the server must load sessions for: the previous week (comparison),
 * the shown week and the shown week's quarter.
 */
export function reviewRange(monday: ISODay): { from: ISODay; to: ISODay } {
	const q = quarterOf(monday);
	const prev = addDays(monday, -7);
	const weekEnd = addDays(monday, 7);
	const quarterEnd = addDays(q.end, 1);
	return {
		from: prev < q.start ? prev : q.start,
		to: weekEnd > quarterEnd ? weekEnd : quarterEnd
	};
}

const share = (quest: number, total: number) => (total > 0 ? quest / total : null);

export interface BuildReviewOptions {
	/** Monday of the shown week. */
	monday: ISODay;
	/** Today in the server timezone. */
	today: ISODay;
	/** IANA timezone used to attribute `startedAt` to a day (default: the runtime's). */
	timeZone?: string;
}

/** Bucket completed sessions into the week and quarter figures of the review page. */
export function buildReview(
	rows: SessionRow[],
	quests: ReviewQuest[],
	{ monday, today, timeZone }: BuildReviewOptions
): Review {
	monday = startOfWeek(monday);
	const prevMonday = addDays(monday, -7);
	const quarter = quarterOf(monday);
	const weeks = quarterWeeks(quarter, monday, today);
	const firstWeek = weeks[0];
	const daysElapsed = daysElapsedInWeek(monday, today);
	const compareDays = daysElapsed;

	// Per day of the shown week: quest id → minutes ('' = other).
	const weekDays = Array.from({ length: 7 }, () => new Map<string, number>());
	const prev = { questMin: 0, totalMin: 0 };
	const quarterAcc = new Map<string, { total: number; weekly: number[] }>();
	let quarterQuest = 0;
	let quarterOther = 0;

	for (const row of rows) {
		const mins = sessionMinutes(row);
		if (mins <= 0) continue;
		const day = todayISO(timeZone, row.startedAt);
		const key = row.questId ?? '';

		const inWeek = daysBetween(monday, day);
		if (inWeek >= 0 && inWeek < 7) {
			const bucket = weekDays[inWeek];
			bucket.set(key, (bucket.get(key) ?? 0) + mins);
		}

		const inPrev = daysBetween(prevMonday, day);
		if (inPrev >= 0 && inPrev < compareDays) {
			prev.totalMin += mins;
			if (row.questId) prev.questMin += mins;
		}

		if (day >= quarter.start && day <= quarter.end) {
			if (!row.questId) {
				quarterOther += mins;
				continue;
			}
			quarterQuest += mins;
			let acc = quarterAcc.get(row.questId);
			if (!acc)
				quarterAcc.set(row.questId, (acc = { total: 0, weekly: Array(weeks.length).fill(0) }));
			acc.total += mins;
			const idx = Math.floor(daysBetween(firstWeek, day) / 7);
			if (idx >= 0 && idx < weeks.length) acc.weekly[idx] += mins;
		}
	}

	/* ── week ──────────────────────────────────────────────────────────── */
	const days: ReviewDay[] = weekDays.map((bucket, i) => {
		const day = addDays(monday, i);
		let questMin = 0;
		const byQuest: QuestMinutes[] = [];
		for (const [questId, min] of bucket) {
			if (!questId) continue;
			questMin += min;
			byQuest.push({ questId, min });
		}
		byQuest.sort((a, b) => b.min - a.min);
		return {
			day,
			state: day < today ? 'past' : day === today ? 'today' : 'future',
			questMin,
			otherMin: bucket.get('') ?? 0,
			byQuest
		};
	});

	const weekByQuest = new Map<string, number>();
	for (const d of days)
		for (const q of d.byQuest)
			weekByQuest.set(q.questId, (weekByQuest.get(q.questId) ?? 0) + q.min);

	const budgetOf = (q: ReviewQuest) =>
		!q.closed && q.weeklyBudgetH !== null && q.weeklyBudgetH > 0 ? q.weeklyBudgetH * 60 : null;

	const questOrder = new Map(quests.map((q, i) => [q.id, i]));
	const weekRows: QuestWeekRow[] = quests
		.filter((q) => !q.closed || (weekByQuest.get(q.id) ?? 0) > 0)
		.map((quest) => ({
			quest,
			weekMin: weekByQuest.get(quest.id) ?? 0,
			budgetMin: budgetOf(quest)
		}))
		.sort(
			(a, b) =>
				b.weekMin - a.weekMin ||
				Number(a.quest.closed) - Number(b.quest.closed) ||
				questOrder.get(a.quest.id)! - questOrder.get(b.quest.id)!
		);

	const questMin = days.reduce((s, d) => s + d.questMin, 0);
	const otherMin = days.reduce((s, d) => s + d.otherMin, 0);
	const totalMin = questMin + otherMin;
	const budgetMin = quests.reduce((s, q) => s + (budgetOf(q) ?? 0), 0);

	const week: ReviewWeek = {
		monday,
		days,
		questMin,
		otherMin,
		totalMin,
		budgetMin,
		daysElapsed,
		dailyAvgMin: daysElapsed > 0 ? totalMin / daysElapsed : 0,
		questShare: share(questMin, totalMin),
		quests: weekRows,
		previous:
			compareDays > 0
				? {
						days: compareDays,
						questMin: prev.questMin,
						totalMin: prev.totalMin,
						dailyAvgMin: prev.totalMin / compareDays,
						questShare: share(prev.questMin, prev.totalMin)
					}
				: null
	};

	/* ── quarter ───────────────────────────────────────────────────────── */
	const elapsedDays = elapsedIn(quarter.start, quarter.end, today);
	const weeksElapsed = elapsedDays / 7;
	const quarterRows: QuarterQuestRow[] = quests
		.filter((q) => !q.closed || (quarterAcc.get(q.id)?.total ?? 0) > 0)
		.map((quest) => {
			const acc = quarterAcc.get(quest.id);
			const weekly = budgetOf(quest);
			return {
				quest,
				quarterMin: acc?.total ?? 0,
				weeklyMin: acc?.weekly ?? Array(weeks.length).fill(0),
				budgetMin: weekly === null ? null : weekly * weeksElapsed
			};
		})
		.sort((a, b) => Number(a.quest.closed) - Number(b.quest.closed));

	return {
		week,
		quarter: {
			...quarter,
			weeks,
			shownIndex: Math.max(0, weeks.indexOf(monday)),
			elapsedDays,
			weeksElapsed,
			questMin: quarterQuest,
			otherMin: quarterOther,
			budgetMin: quarterRows.reduce((s, r) => s + (r.budgetMin ?? 0), 0),
			quests: quarterRows
		}
	};
}

/* ── formatting ────────────────────────────────────────────────────────── */

/** Signed hours with one decimal: `+2.1h`, `−0.4h`, `±0h` (German: `+2,1 h`). */
export function formatSignedHours(hours: number, locale = 'en-US'): string {
	const r = Math.round(hours * 10) / 10;
	const unit = hourUnit(locale);
	if (r === 0) return `±0${unit}`;
	return `${r > 0 ? '+' : '−'}${formatDecimal(Math.abs(r), locale)}${unit}`;
}

/** Whole percent of `part / whole` (null when `whole` is 0). */
export function percent(part: number, whole: number): number | null {
	return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/**
 * "vs …" suffix of the week-over-week deltas: `vs last week`, or for the current week
 * `vs last Mon–Wed` (`vs last Mon` on Monday) — the same days of the previous week.
 */
export function comparisonLabel(days: number, t: I18n): string {
	if (days >= 7) return t.review.vsLastWeek;
	// 2024-01-01 is a Monday.
	const name = (i: number) =>
		formatDayLabel(addDays('2024-01-01', i), { weekday: 'short' }, t.intl);
	return t.review.vsLastDays(days <= 1 ? name(0) : `${name(0)}–${name(days - 1)}`);
}

/** What the personal headline says about the week (`weekSummaryText`). */
export type WeekSummary =
	| { kind: 'future' }
	| { kind: 'empty'; current: boolean }
	| {
			kind: 'logged';
			totalMin: number;
			/** Against the same days of the previous week (null: nothing to compare). */
			compare: { deltaMin: number; partial: boolean } | null;
	  };

/**
 * The week in one sentence: nothing elapsed yet, nothing logged (yet), or the total logged
 * and how it compares with the same days of the previous week (the KPIs' comparison span).
 */
export function weekSummary(week: ReviewWeek): WeekSummary {
	if (week.daysElapsed === 0) return { kind: 'future' };
	if (week.totalMin <= 0) return { kind: 'empty', current: week.daysElapsed < 7 };
	const prev = week.previous;
	return {
		kind: 'logged',
		totalMin: week.totalMin,
		compare: prev ? { deltaMin: week.totalMin - prev.totalMin, partial: prev.days < 7 } : null
	};
}

/**
 * `weekSummary` as text: "12.5h logged — 2.1h more than last week." A difference that rounds
 * to 0.0h reads "about the same".
 */
export function weekSummaryText(summary: WeekSummary, t: I18n): string {
	const s = t.review.summary;
	if (summary.kind === 'future') return s.future;
	if (summary.kind === 'empty') return summary.current ? s.emptyCurrent : s.empty;
	const hours = (min: number) => formatHours(min / 60, t.intl);
	const total = hours(summary.totalMin);
	const c = summary.compare;
	if (!c) return s.logged(total);
	const delta = Math.round((Math.abs(c.deltaMin) / 60) * 10) / 10;
	if (delta === 0) return s.same(total, c.partial);
	const text = formatHours(delta, t.intl);
	return c.deltaMin > 0 ? s.more(total, text, c.partial) : s.less(total, text, c.partial);
}
