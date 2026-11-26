import { describe, expect, test } from 'bun:test';
import { i18n } from '#lib/i18n/index.ts';
import {
	buildReview,
	comparisonLabel,
	daysElapsedInWeek,
	formatSignedHours,
	parseReviewView,
	percent,
	quarterComparisonLabel,
	quarterOf,
	quarterWeekTotals,
	quarterWeeks,
	reviewRange,
	reviewViewHref,
	splitSegments,
	weekSummary,
	weekSummaryText,
	type ReviewQuest,
	type SessionRow
} from './review.ts';

const TZ = 'Europe/Berlin';
/** Today: Wed 2026-11-18 → shown week Mon 11-16 … Sun 11-22, quarter Q4 2026. */
const TODAY = '2026-11-18';
const MONDAY = '2026-11-16';

/** A completed session starting at a Berlin wall time, lasting `min` minutes. */
function s(questId: string | null, berlinStart: string, min: number, pausedMin = 0): SessionRow {
	// Offsets: CEST (+02:00) until 2026-10-25 03:00, CET (+01:00) afterwards.
	const offset =
		berlinStart < '2026-10-25T03:00' || berlinStart >= '2027-03-28T03:00' ? '+02:00' : '+01:00';
	const startedAt = new Date(`${berlinStart}:00${offset}`);
	return {
		questId,
		startedAt,
		endedAt: new Date(startedAt.getTime() + (min + pausedMin) * 60_000),
		pausedMs: pausedMin * 60_000,
		durationMin: null
	};
}

const quest = (id: string, budget: number | null = null, closed = false): ReviewQuest => ({
	id,
	name: id.toUpperCase(),
	icon: '⭐',
	color: 'red',
	weeklyBudgetH: budget,
	closed
});

const QUESTS = [quest('q1', 10), quest('q2', 4), quest('q3', 5, true), quest('q4', 2, true)];
const opts = { monday: MONDAY, today: TODAY, timeZone: TZ };

describe('buildReview — week', () => {
	const rows = [
		s('q1', '2026-11-16T09:00', 60),
		s('q2', '2026-11-16T10:00', 30, 15), // pauses don't count
		s(null, '2026-11-17T08:00', 45),
		s('q1', '2026-11-18T07:00', 90),
		s('q3', '2026-11-18T12:00', 20), // closed quest with time this week
		s('q1', '2026-11-16T00:30', 10), // Monday 00:30 local = Sunday 23:30Z → Monday
		s('q1', '2026-11-15T23:30', 120), // previous Sunday → not in the week
		s('q2', '2026-11-22T23:50', 30) // Sunday 23:50, crosses midnight → counts on Sunday
	];
	const { week } = buildReview(rows, QUESTS, opts);

	test('per-day buckets by start day in the server timezone', () => {
		expect(week.days.map((d) => d.day)).toEqual([
			'2026-11-16',
			'2026-11-17',
			'2026-11-18',
			'2026-11-19',
			'2026-11-20',
			'2026-11-21',
			'2026-11-22'
		]);
		expect(week.days.map((d) => d.questMin)).toEqual([100, 0, 110, 0, 0, 0, 30]);
		expect(week.days.map((d) => d.otherMin)).toEqual([0, 45, 0, 0, 0, 0, 0]);
		expect(week.days[0].byQuest).toEqual([
			{ questId: 'q1', min: 70 },
			{ questId: 'q2', min: 30 }
		]);
		expect(week.days[2].byQuest.map((q) => q.questId)).toEqual(['q1', 'q3']);
	});

	test('day states relative to today', () => {
		expect(week.days.map((d) => d.state)).toEqual([
			'past',
			'past',
			'today',
			'future',
			'future',
			'future',
			'future'
		]);
	});

	test('totals, share and daily average of the current week', () => {
		expect(week.questMin).toBe(240);
		expect(week.otherMin).toBe(45);
		expect(week.totalMin).toBe(285);
		expect(week.questShare).toBeCloseTo(240 / 285);
		expect(week.daysElapsed).toBe(3);
		expect(week.dailyAvgMin).toBe(95);
	});

	test('budget = open quests only; rows = open quests + closed quests with time, desc', () => {
		expect(week.budgetMin).toBe(14 * 60);
		expect(week.quests.map((r) => [r.quest.id, r.weekMin, r.budgetMin])).toEqual([
			['q1', 160, 600],
			['q2', 60, 240],
			['q3', 20, null]
		]);
	});

	test('ties keep open quests first, then input order', () => {
		const { week: empty } = buildReview([], [quest('a', null, false), quest('b', 3)], opts);
		expect(empty.quests.map((r) => r.quest.id)).toEqual(['a', 'b']);
	});
});

describe('buildReview — daily average rules', () => {
	const rows = [s('q1', '2026-11-09T09:00', 140), s(null, '2026-11-12T09:00', 70)];

	test('past week divides by 7', () => {
		const { week } = buildReview(rows, QUESTS, { ...opts, monday: '2026-11-09' });
		expect(week.daysElapsed).toBe(7);
		expect(week.dailyAvgMin).toBe(30);
		expect(week.days.every((d) => d.state === 'past')).toBe(true);
	});

	test('current week divides by days up to and including today', () => {
		expect(daysElapsedInWeek(MONDAY, '2026-11-16')).toBe(1);
		expect(daysElapsedInWeek(MONDAY, '2026-11-22')).toBe(7);
		expect(daysElapsedInWeek(MONDAY, '2026-12-01')).toBe(7);
	});

	test('future week has no elapsed days → 0 average, no comparison', () => {
		const { week } = buildReview(rows, QUESTS, { ...opts, monday: '2026-11-30' });
		expect(week.daysElapsed).toBe(0);
		expect(week.dailyAvgMin).toBe(0);
		expect(week.previous).toBeNull();
		expect(week.days.every((d) => d.state === 'future')).toBe(true);
	});
});

describe('buildReview — previous-week comparison', () => {
	const rows = [
		s('q1', '2026-11-09T09:00', 60), // Mon
		s(null, '2026-11-11T09:00', 30), // Wed
		s('q1', '2026-11-12T09:00', 600), // Thu — outside Mon–Wed
		s('q1', '2026-11-16T09:00', 120)
	];

	test('current week compares the same elapsed days of last week', () => {
		const { week } = buildReview(rows, QUESTS, opts);
		expect(week.previous).toEqual({
			days: 3,
			questMin: 60,
			totalMin: 90,
			dailyAvgMin: 30,
			questShare: 60 / 90
		});
	});

	test('past week compares the whole previous week', () => {
		const { week } = buildReview(rows, QUESTS, {
			...opts,
			monday: '2026-11-16',
			today: '2026-11-25'
		});
		expect(week.previous?.days).toBe(7);
		expect(week.previous?.questMin).toBe(660);
	});
});

describe('buildReview — empty week', () => {
	test('zeros and no share', () => {
		const { week, quarter } = buildReview([], QUESTS, { ...opts, monday: '2027-06-07' });
		expect(week.totalMin).toBe(0);
		expect(week.questShare).toBeNull();
		expect(week.dailyAvgMin).toBe(0);
		expect(week.days.every((d) => d.questMin === 0 && d.byQuest.length === 0)).toBe(true);
		expect(week.quests.map((r) => r.weekMin)).toEqual([0, 0]);
		expect(quarter.label).toBe('Q2 2027');
		expect(quarter.elapsedDays).toBe(0);
		expect(quarter.budgetMin).toBe(0);
		expect(quarter.quests.map((r) => r.budgetMin)).toEqual([0, 0]);
		expect(quarter.weeks.at(-1)).toBe('2027-06-07');
		expect(quarter.shownIndex).toBe(quarter.weeks.length - 1);
	});
});

describe('quarter', () => {
	test('quarterOf labels', () => {
		expect(quarterOf('2026-11-18')).toEqual({
			start: '2026-10-01',
			end: '2026-12-31',
			label: 'Q4 2026',
			rangeLabel: 'Oct 1 – Dec 31'
		});
		expect(quarterOf('2027-02-14').label).toBe('Q1 2027');
		expect(quarterOf('2027-02-14').rangeLabel).toBe('Jan 1 – Mar 31');
	});

	test('quarter starting mid-week: first week starts before the quarter, days outside are clipped', () => {
		// Q4 2026 starts on Thursday Oct 1 → first week Mon Sep 28.
		const rows = [
			s('q1', '2026-09-30T10:00', 60), // Q3 → not counted
			s('q1', '2026-10-01T10:00', 30), // week 0
			s('q1', '2026-10-05T10:00', 45), // week 1
			s(null, '2026-10-06T10:00', 15), // other
			s('q2', '2026-11-18T10:00', 120) // week 7 (current)
		];
		const { quarter } = buildReview(rows, QUESTS, opts);
		expect(quarter.weeks[0]).toBe('2026-09-28');
		expect(quarter.weeks).toHaveLength(8);
		expect(quarter.shownIndex).toBe(7);
		const q1 = quarter.quests.find((r) => r.quest.id === 'q1')!;
		expect(q1.quarterMin).toBe(75);
		expect(q1.weeklyMin).toEqual([30, 45, 0, 0, 0, 0, 0, 0]);
		const q2 = quarter.quests.find((r) => r.quest.id === 'q2')!;
		expect(q2.weeklyMin.at(-1)).toBe(120);
		expect(quarter.questMin).toBe(195);
		expect(quarter.otherMin).toBe(15);
		// Oct 1 … Nov 18 = 49 days = 7 weeks of budget.
		expect(quarter.elapsedDays).toBe(49);
		expect(quarter.weeksElapsed).toBe(7);
		expect(q1.budgetMin).toBe(600 * 7);
		expect(quarter.budgetMin).toBe((600 + 240) * 7);
		// Closed quests: q3/q4 have no quarter time → absent.
		expect(quarter.quests.map((r) => r.quest.id)).toEqual(['q1', 'q2']);
	});

	test('weekly buckets sum to the quarter total', () => {
		const rows = Array.from({ length: 40 }, (_, i) =>
			s(
				i % 2 ? 'q1' : 'q2',
				`2026-10-${String((i % 30) + 1).padStart(2, '0')}T0${i % 10}:15`,
				10 + i
			)
		);
		const { quarter } = buildReview(rows, QUESTS, opts);
		for (const r of quarter.quests)
			expect(r.weeklyMin.reduce((a, b) => a + b, 0)).toBeCloseTo(r.quarterMin);
	});

	test('DST week (clocks back on Sun 2026-10-25) attributes by local day', () => {
		const rows = [
			s('q1', '2026-10-25T02:30', 30), // before the switch (CEST) → Sunday
			s('q1', '2026-10-25T23:30', 40), // after the switch (CET) → Sunday
			s('q1', '2026-10-26T00:30', 50) // next Monday (= Sun 23:30Z)
		];
		const { week, quarter } = buildReview(rows, QUESTS, { ...opts, monday: '2026-10-19' });
		expect(week.days[6].questMin).toBe(70);
		expect(week.questMin).toBe(70);
		const q1 = quarter.quests.find((r) => r.quest.id === 'q1')!;
		// weeks: Sep 28, Oct 5, 12, 19, 26, …
		expect(q1.weeklyMin.slice(3, 5)).toEqual([70, 50]);
		expect(quarter.shownIndex).toBe(3);
	});

	test('a week spanning two quarters belongs to the quarter of its Monday', () => {
		const rows = [s('q1', '2026-12-30T10:00', 60), s('q1', '2027-01-02T10:00', 90)];
		const res = buildReview(rows, QUESTS, {
			monday: '2026-12-28',
			today: '2027-01-05',
			timeZone: TZ
		});
		expect(res.week.questMin).toBe(150);
		expect(res.quarter.label).toBe('Q4 2026');
		expect(res.quarter.questMin).toBe(60);
		expect(res.quarter.weeks.at(-1)).toBe('2026-12-28');
		expect(res.quarter.shownIndex).toBe(res.quarter.weeks.length - 1);
		// Past quarter: all 92 days elapsed.
		expect(res.quarter.elapsedDays).toBe(92);

		// Same for a week starting in Q3 and ending in Q4.
		const q3 = buildReview([s('q1', '2026-10-01T10:00', 30)], QUESTS, {
			monday: '2026-09-28',
			today: TODAY,
			timeZone: TZ
		});
		expect(q3.quarter.label).toBe('Q3 2026');
		expect(q3.week.questMin).toBe(30);
		expect(q3.quarter.questMin).toBe(0);
	});

	test('quarterWeeks never runs past the quarter and extends to a later shown week', () => {
		const q = quarterOf('2026-11-18');
		expect(quarterWeeks(q, '2026-10-05', '2027-02-01').at(-1)).toBe('2026-12-28');
		expect(quarterWeeks(q, '2026-12-14', '2026-11-18').at(-1)).toBe('2026-12-14');
		expect(quarterWeeks(q, '2026-10-05', '2026-11-18').at(-1)).toBe('2026-11-16');
	});

	test('reviewRange covers the previous quarter, the shown week and its quarter', () => {
		expect(reviewRange('2026-11-16')).toEqual({ from: '2026-07-01', to: '2027-01-01' });
		expect(reviewRange('2026-10-05')).toEqual({ from: '2026-07-01', to: '2027-01-01' });
		expect(reviewRange('2026-12-28')).toEqual({ from: '2026-07-01', to: '2027-01-04' });
		expect(reviewRange('2027-01-04')).toEqual({ from: '2026-10-01', to: '2027-04-01' });
	});

	test('the quarter compares with the same span of the previous quarter', () => {
		const rows = [
			s('q1', '2026-07-01T10:00', 60), // Q3 day 1 → compared
			s(null, '2026-08-18T10:00', 30), // Q3 day 49 → compared (other)
			s('q2', '2026-08-19T10:00', 45), // Q3 day 50 → after the span
			s('q1', '2026-10-02T10:00', 100) // Q4
		];
		const { quarter } = buildReview(rows, QUESTS, opts);
		expect(quarter.elapsedDays).toBe(49);
		expect(quarter.previous).toEqual({
			label: 'Q3 2026',
			days: 49,
			partial: true,
			questMin: 60,
			totalMin: 90
		});
		const t = i18n('en');
		expect(quarterComparisonLabel(quarter.previous!, t)).toBe('vs this point in Q3 2026');
	});

	test('a finished quarter compares with the whole previous quarter (lengths differ)', () => {
		// Q1 2027 (90 days) after Q4 2026 (92 days): the last two days of Q4 count too.
		const rows = [s('q1', '2026-12-31T10:00', 40), s('q1', '2027-02-01T10:00', 20)];
		const { quarter } = buildReview(rows, QUESTS, {
			monday: '2027-03-29',
			today: '2027-05-01',
			timeZone: TZ
		});
		expect(quarter.label).toBe('Q1 2027');
		expect(quarter.previous).toMatchObject({ days: 92, partial: false, questMin: 40 });
		expect(quarterComparisonLabel(quarter.previous!, i18n('de'))).toBe('ggü. Q4 2026');
	});

	test('a future quarter has no comparison', () => {
		const { quarter } = buildReview([], QUESTS, { ...opts, monday: '2027-01-04' });
		expect(quarter.elapsedDays).toBe(0);
		expect(quarter.previous).toBeNull();
	});

	test('quarterWeekTotals sums the quests per week', () => {
		const rows = [
			s('q1', '2026-10-01T10:00', 30),
			s('q2', '2026-10-02T10:00', 15),
			s('q2', '2026-11-17T10:00', 60),
			s(null, '2026-11-17T12:00', 99) // Other is not quest work
		];
		const { quarter } = buildReview(rows, QUESTS, opts);
		expect(quarterWeekTotals(quarter)).toEqual([45, 0, 0, 0, 0, 0, 0, 60]);
	});
});

describe('phone view (?view=)', () => {
	test('parseReviewView: only "quarter" switches', () => {
		expect(parseReviewView('quarter')).toBe('quarter');
		expect(parseReviewView('week')).toBe('week');
		expect(parseReviewView('Quarter')).toBe('week');
		expect(parseReviewView(null)).toBe('week');
		expect(parseReviewView(undefined)).toBe('week');
	});

	test('reviewViewHref keeps the week and drops view for the week', () => {
		expect(reviewViewHref('', 'quarter')).toBe('/review?view=quarter');
		expect(reviewViewHref('?week=2026-11-09', 'quarter')).toBe(
			'/review?week=2026-11-09&view=quarter'
		);
		expect(reviewViewHref('?week=2026-11-09&view=quarter', 'week')).toBe('/review?week=2026-11-09');
		expect(reviewViewHref('?view=quarter', 'week')).toBe('/review');
	});
});

describe('formatting', () => {
	test('formatSignedHours', () => {
		expect(formatSignedHours(2.14)).toBe('+2.1h');
		expect(formatSignedHours(-0.44, 'de-DE')).toBe('−0,4\u202fh');
		expect(formatSignedHours(0.01, 'de-DE')).toBe('±0\u202fh');
		expect(formatSignedHours(-0.4)).toBe('−0.4h');
		expect(formatSignedHours(0.02)).toBe('±0h');
		expect(formatSignedHours(3)).toBe('+3h');
	});

	test('percent', () => {
		expect(percent(17.4, 20)).toBe(87);
		expect(percent(1, 0)).toBeNull();
	});

	test('comparisonLabel', () => {
		const en = i18n('en');
		expect(comparisonLabel(7, en)).toBe('vs last week');
		expect(comparisonLabel(3, en)).toBe('vs last Mon–Wed');
		expect(comparisonLabel(1, en)).toBe('vs last Mon');
		const de = i18n('de');
		expect(comparisonLabel(7, de)).toBe('ggü. Vorwoche');
		expect(comparisonLabel(3, de)).toBe('ggü. Mo–Mi der Vorwoche');
	});
});

describe('weekSummary', () => {
	const t = i18n('en');
	const base = buildReview([], QUESTS, opts).week;
	const text = (w: Partial<typeof base>) => weekSummaryText(weekSummary({ ...base, ...w }), t);
	const prev = (days: number, totalMin: number) => ({
		days,
		questMin: 0,
		totalMin,
		dailyAvgMin: 0,
		questShare: null
	});

	test('future week, nothing logged (yet)', () => {
		expect(text({ daysElapsed: 0, previous: null })).toBe('It hasn’t started yet.');
		expect(text({ daysElapsed: 3, totalMin: 0 })).toBe('Nothing logged yet.');
		expect(text({ daysElapsed: 7, totalMin: 0 })).toBe('Nothing logged.');
	});

	test('total and the difference to the same days of the previous week', () => {
		expect(text({ daysElapsed: 7, totalMin: 750, previous: prev(7, 624) })).toBe(
			'12.5h logged — 2.1h more than last week.'
		);
		expect(text({ daysElapsed: 3, totalMin: 120, previous: prev(3, 180) })).toBe(
			'2h logged — 1h less than the same days last week.'
		);
		expect(text({ daysElapsed: 7, totalMin: 600, previous: prev(7, 598) })).toBe(
			'10h logged — about the same as last week.'
		);
		expect(text({ daysElapsed: 7, totalMin: 90, previous: null })).toBe('1.5h logged.');
	});

	test('German', () => {
		const de = i18n('de');
		expect(
			weekSummaryText(
				weekSummary({ ...base, daysElapsed: 7, totalMin: 750, previous: prev(7, 624) }),
				de
			)
		).toBe('12,5 h erfasst – 2,1 h mehr als letzte Woche.');
	});
});

describe('splitSegments', () => {
	const quest = (id: string, color: string): ReviewQuest => ({
		id,
		name: id,
		icon: '✨',
		color,
		weeklyBudgetH: null,
		closed: false
	});
	test('one segment per quest with time, in row order, then Other in slate', () => {
		const rows = [
			{ quest: quest('a', 'red'), weekMin: 120, budgetMin: null },
			{ quest: quest('b', 'lime'), weekMin: 0, budgetMin: 60 },
			{ quest: quest('c', 'teal'), weekMin: 30, budgetMin: null }
		];
		expect(splitSegments(rows, 45)).toEqual([
			{ key: 'a', color: 'red', min: 120 },
			{ key: 'c', color: 'teal', min: 30 },
			{ key: 'other', color: 'slate', min: 45 }
		]);
	});
	test('no Other segment without Other time; nothing at all for an empty week', () => {
		const rows = [{ quest: quest('a', 'red'), weekMin: 10, budgetMin: null }];
		expect(splitSegments(rows, 0)).toEqual([{ key: 'a', color: 'red', min: 10 }]);
		expect(splitSegments([], 0)).toEqual([]);
	});
});
