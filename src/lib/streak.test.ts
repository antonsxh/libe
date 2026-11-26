import { describe, expect, test } from 'bun:test';
import { addDays, weekdayIndex } from './dates.ts';
import {
	computeStreak,
	isRestDay,
	isRestMask,
	isStreakMilestone,
	liveStreak,
	nextStreakBase,
	pageStreak,
	parseRestDays,
	restMaskOf,
	restWeekdays,
	STREAK_FALLBACK_MIN,
	streakBase,
	streakHint,
	streakMarks,
	streakThreshold,
	toRestMask,
	type StreakBase
} from './streak.ts';
import type { TodayLog } from './daily-goal.ts';

/** Reference "today": Friday 2026-11-20. */
const TODAY = '2026-11-20';
const T = 60;
/** Weekday indices: Mon 0 … Sun 6. */
const MON = 0;
const WED = 2;
const THU = 3;
const FRI = 4;
const SAT = 5;
const SUN = 6;

/** Minutes per day from offsets relative to TODAY (`{-1: 60}` = yesterday 60 min). */
function hist(byOffset: Record<number, number>, today = TODAY): Map<string, number> {
	return new Map(Object.entries(byOffset).map(([off, min]) => [addDays(today, Number(off)), min]));
}
const streak = (byOffset: Record<number, number>, restMask = 0, threshold = T, today = TODAY) =>
	computeStreak({ minutesByDay: hist(byOffset, today), today, threshold, restMask });

describe('rest days', () => {
	test('mask ↔ weekdays', () => {
		expect(restMaskOf([SAT, SUN])).toBe(0b110_0000);
		expect(restWeekdays(0b110_0000)).toEqual([SAT, SUN]);
		expect(restWeekdays(0)).toEqual([]);
		expect(isRestDay(restMaskOf([FRI]), TODAY)).toBe(true);
		expect(isRestDay(restMaskOf([THU]), TODAY)).toBe(false);
	});

	test('valid masks: at most six weekdays', () => {
		expect(isRestMask(0)).toBe(true);
		expect(isRestMask(0b011_1111)).toBe(true);
		expect(isRestMask(0b111_1111)).toBe(false);
		expect(isRestMask(128)).toBe(false);
		expect(isRestMask(-1)).toBe(false);
		expect(isRestMask(1.5)).toBe(false);
		expect(toRestMask(127)).toBe(0);
		expect(toRestMask(null)).toBe(0);
		expect(toRestMask(3)).toBe(3);
	});

	test('parseRestDays: checkbox values, six at most', () => {
		expect(parseRestDays([])).toEqual({ ok: true, value: 0 });
		expect(parseRestDays(['5', '6', '6'])).toEqual({ ok: true, value: 0b110_0000 });
		expect(parseRestDays(['0', '1', '2', '3', '4', '5'])).toEqual({ ok: true, value: 0b011_1111 });
		expect(parseRestDays(['0', '1', '2', '3', '4', '5', '6'])).toEqual({
			ok: false,
			error: 'streakRestDaysTooMany'
		});
		for (const bad of ['7', '-1', 'mon', '', '1.0', null])
			expect(parseRestDays([bad])).toEqual({ ok: false, error: 'streakRestDayInvalid' });
	});
});

describe('threshold', () => {
	test('the daily goal, else the fallback', () => {
		expect(streakThreshold(120)).toEqual({ min: 120, fromGoal: true });
		expect(streakThreshold(null)).toEqual({ min: STREAK_FALLBACK_MIN, fromGoal: false });
		expect(streakThreshold(undefined)).toEqual({ min: STREAK_FALLBACK_MIN, fromGoal: false });
	});

	test('the same history counts differently with goal vs fallback', () => {
		const days = { [-2]: 30, [-1]: 30, 0: 30 };
		expect(streak(days, 0, STREAK_FALLBACK_MIN).current).toBe(3);
		expect(streak(days, 0, 60).current).toBe(0);
	});

	test('exactly the threshold counts, a fraction below does not', () => {
		expect(streak({ [-1]: 60 }).current).toBe(1);
		expect(streak({ [-1]: 59.99 }).current).toBe(0);
	});
});

describe('computeStreak', () => {
	test('empty history', () => {
		expect(streak({})).toMatchObject({ current: 0, longest: 0, state: 'none', remainingMin: T });
	});

	test('only today', () => {
		expect(streak({ 0: 75 })).toMatchObject({
			current: 1,
			longest: 1,
			state: 'active',
			remainingMin: 0
		});
		expect(streak({ 0: 20 })).toMatchObject({ current: 0, state: 'none', remainingMin: 40 });
	});

	test('today pending: alive through yesterday, not broken yet', () => {
		const s = streak({ [-3]: 90, [-2]: 60, [-1]: 61, 0: 39.5 });
		expect(s).toMatchObject({ current: 3, longest: 3, state: 'pending', todayMin: 39.5 });
		// Remaining minutes round up: 20.5 → 21.
		expect(s.remainingMin).toBe(21);
	});

	test('today done extends it', () => {
		expect(streak({ [-2]: 60, [-1]: 60, 0: 60 })).toMatchObject({ current: 3, state: 'active' });
	});

	test('a gap breaks it; longest keeps the older run', () => {
		const s = streak({ [-9]: 60, [-8]: 60, [-7]: 60, [-6]: 60, [-4]: 60, [-1]: 60 });
		expect(s).toMatchObject({ current: 1, longest: 4, state: 'pending' });
	});

	test('missed yesterday → none, longest from history', () => {
		expect(streak({ [-4]: 60, [-3]: 60, [-2]: 60 })).toMatchObject({
			current: 0,
			longest: 3,
			state: 'none'
		});
	});

	test('the current run can be the longest', () => {
		expect(streak({ [-10]: 60, [-3]: 60, [-2]: 60, [-1]: 60, 0: 60 })).toMatchObject({
			current: 4,
			longest: 4
		});
	});

	test('days after today are ignored', () => {
		expect(streak({ [-1]: 60, 1: 60, 2: 60 })).toMatchObject({ current: 1, longest: 1 });
	});

	test('rest day in the middle neither breaks nor extends', () => {
		// TODAY is a Friday: -2 = Wednesday.
		expect(weekdayIndex(addDays(TODAY, -2))).toBe(WED);
		const days = { [-3]: 60, [-2]: 0, [-1]: 60 };
		expect(streak(days).current).toBe(1);
		expect(streak(days, restMaskOf([WED]))).toMatchObject({ current: 2, longest: 2 });
	});

	test('several rest days in a row (weekend) bridge the gap', () => {
		// Mon 2026-11-16 … with Sat/Sun 14/15 as rest days: Fri 13 → Mon 16 continues.
		const today = '2026-11-17'; // Tuesday
		const s = streak({ [-4]: 60, [-1]: 60, 0: 60 }, restMaskOf([SAT, SUN]), T, today);
		expect(s).toMatchObject({ current: 3, state: 'active' });
	});

	test('a rest day that reaches the threshold extends it', () => {
		const s = streak({ [-3]: 60, [-2]: 60, [-1]: 60 }, restMaskOf([WED]));
		expect(s.current).toBe(3);
	});

	test('rest days at the edges: trailing rest days keep it alive', () => {
		// Last streak day Wednesday, Thursday is a rest day, today (Friday) pending.
		const s = streak({ [-2]: 60 }, restMaskOf([THU]));
		expect(s).toMatchObject({ current: 1, state: 'pending' });
		// Without the rest day it would be broken.
		expect(streak({ [-2]: 60 }).state).toBe('none');
	});

	test('rest days at the edges: leading rest days do not count', () => {
		// Wed/Thu rest days before the first streak day: still a 1-day streak.
		const s = streak({ [-1]: 0, 0: 60 }, restMaskOf([WED, THU]));
		expect(s).toMatchObject({ current: 1, longest: 1 });
	});

	test('today is a rest day: below the threshold → state rest; reached → active', () => {
		const rest = restMaskOf([FRI]);
		expect(streak({ [-1]: 60, 0: 10 }, rest)).toMatchObject({
			current: 1,
			state: 'rest',
			restToday: true
		});
		expect(streak({ [-1]: 60, 0: 60 }, rest)).toMatchObject({ current: 2, state: 'active' });
		expect(streak({ 0: 10 }, rest)).toMatchObject({ current: 0, state: 'none' });
	});

	test('a gap of a whole week always breaks (at most six rest days)', () => {
		const sixRest = restMaskOf([MON, 1, WED, THU, SAT, SUN]); // all but Friday
		// Last Friday counted, every day since is a rest day: still alive.
		expect(streak({ [-7]: 60 }, sixRest)).toMatchObject({ current: 1, state: 'pending' });
		// Fridays a week apart connect over six rest days …
		expect(streak({ [-14]: 60, [-7]: 60, 0: 60 }, sixRest).current).toBe(3);
		// … but a missed Friday in between breaks it.
		expect(streak({ [-14]: 60, 0: 60 }, sixRest)).toMatchObject({ current: 1, longest: 1 });
	});

	test('DST: a run across the switch to summer time is unbroken', () => {
		// Europe switches on Sunday 2026-03-29; day math is on dates, not milliseconds.
		const today = '2026-03-31';
		const s = streak({ [-4]: 60, [-3]: 60, [-2]: 60, [-1]: 60, 0: 60 }, 0, T, today);
		expect(s).toMatchObject({ current: 5, longest: 5 });
		const autumn = streak({ [-2]: 60, [-1]: 60, 0: 60 }, 0, T, '2026-10-26');
		expect(autumn.current).toBe(3);
	});

	test('a plain object works as minutesByDay', () => {
		const s = computeStreak({
			minutesByDay: { [addDays(TODAY, -1)]: 60, [TODAY]: 60 },
			today: TODAY,
			threshold: T,
			restMask: 0
		});
		expect(s.current).toBe(2);
	});

	test('invalid rest masks mean no rest days', () => {
		expect(streak({ [-3]: 60, [-1]: 60 }, 127).current).toBe(1);
	});
});

describe('live composition', () => {
	const base: StreakBase = streakBase({
		minutesByDay: hist({ [-2]: 60, [-1]: 60 }),
		today: TODAY,
		threshold: T,
		restMask: 0,
		fromGoal: true
	});

	test('the base excludes today', () => {
		const withToday = streakBase({
			minutesByDay: hist({ [-2]: 60, [-1]: 60, 0: 500 }),
			today: TODAY,
			threshold: T,
			restMask: 0
		});
		expect(withToday).toMatchObject({ before: 2, longestBefore: 2, day: TODAY });
		expect(base).toMatchObject({ before: 2, longestBefore: 2, fromGoal: true });
	});

	test('pending flips to active once the live minutes cross the threshold', () => {
		expect(liveStreak(base, 59)).toMatchObject({ state: 'pending', current: 2, remainingMin: 1 });
		expect(liveStreak(base, 60)).toMatchObject({ state: 'active', current: 3, longest: 3 });
	});

	test('pageStreak adds the running session to the server minutes', () => {
		const start = Date.UTC(2026, 10, 19, 23); // 00:00 Berlin
		const log: TodayLog = { day: TODAY, loggedMin: 40, start, end: start + 86_400_000 };
		const now = start + 10 * 3_600_000;
		const running = { startedAt: now - 25 * 60_000, elapsedMs: 25 * 60_000 };
		expect(pageStreak(base, log, null, now).state).toBe('pending');
		expect(pageStreak(base, log, running, now)).toMatchObject({ state: 'active', current: 3 });
	});

	test('pageStreak rolls to the next day after midnight', () => {
		const start = Date.UTC(2026, 10, 19, 23);
		const log: TodayLog = { day: TODAY, loggedMin: 70, start, end: start + 86_400_000 };
		const after = log.end + 60_000;
		// Yesterday (TODAY) counted with 70 min → 3 days through yesterday, new day pending.
		expect(pageStreak(base, log, null, after)).toMatchObject({ state: 'pending', current: 3 });
		const missed = { ...log, loggedMin: 10 };
		expect(pageStreak(base, missed, null, after)).toMatchObject({ state: 'none', current: 0 });
	});

	test('nextStreakBase: rest days carry, misses reset', () => {
		const fri = { ...base, restMask: restMaskOf([FRI]) };
		expect(nextStreakBase(fri, 0)).toMatchObject({ before: 2, day: addDays(TODAY, 1) });
		expect(nextStreakBase(base, 0)).toMatchObject({ before: 0, longestBefore: 2 });
		expect(nextStreakBase(base, 60)).toMatchObject({ before: 3, longestBefore: 3 });
	});
});

describe('streakHint', () => {
	test('no streak and nothing logged today: no hint', () => {
		expect(streakHint(streak({}))).toBeNull();
		expect(streakHint(streak({ [-3]: 60 }))).toBeNull(); // broken long ago
	});

	test('no streak, but today has some time: how much more starts one', () => {
		const s = streak({ 0: 20 });
		expect(s.state).toBe('none');
		expect(streakHint(s)).toBe('start');
	});

	test('a streak that still needs time today: keep it', () => {
		expect(streakHint(streak({ [-1]: 60 }))).toBe('keep');
		expect(streakHint(streak({ [-1]: 60, 0: 30 }))).toBe('keep');
	});

	test('a rest day carrying the streak says so', () => {
		const s = streak({ [-1]: 60 }, restMaskOf([FRI]));
		expect(s.state).toBe('rest');
		expect(streakHint(s)).toBe('rest');
	});

	test('nothing once today counts (or a milestone shows instead)', () => {
		expect(streakHint(streak({ [-1]: 60, 0: 60 }))).toBeNull();
		const seventh = streak({ [-6]: 60, [-5]: 60, [-4]: 60, [-3]: 60, [-2]: 60, [-1]: 60, 0: 60 });
		expect(seventh.milestone).toBe(7);
		expect(streakHint(seventh)).toBeNull();
	});
});

describe('milestones', () => {
	test('7, 30, 100, 365, every hundred after 100, every year', () => {
		const hits = Array.from({ length: 800 }, (_, i) => i + 1).filter(isStreakMilestone);
		expect(hits).toEqual([7, 30, 100, 200, 300, 365, 400, 500, 600, 700, 730, 800]);
		expect(isStreakMilestone(0)).toBe(false);
		expect(isStreakMilestone(-7)).toBe(false);
	});

	test('reported only on the day the streak reaches it', () => {
		const six = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [-(i + 1), 60]));
		expect(streak({ ...six, 0: 60 }).milestone).toBe(7);
		// Still 6 through yesterday and today pending → nothing yet.
		expect(streak({ ...six, 0: 10 }).milestone).toBeNull();
		// The day after: current stays 7 while pending — no repeat.
		const seven = { ...six, [-7]: 60 };
		expect(streak({ ...seven, 0: 10 })).toMatchObject({ current: 7, milestone: null });
		expect(streak({ ...seven, 0: 60 })).toMatchObject({ current: 8, milestone: null });
	});
});

describe('streakMarks', () => {
	const week = (mins: number[]) => mins.map((min, i) => ({ day: addDays('2026-11-16', i), min })); // Mon … Sun
	const opts = { today: TODAY, threshold: T, restMask: restMaskOf([WED, SUN]) };

	test('done / rest / missed / today / future', () => {
		expect(streakMarks(week([60, 10, 0, 70, 30, 0, 0]), opts)).toEqual([
			'done',
			'missed',
			'rest',
			'done',
			'today',
			'future',
			'rest'
		]);
	});

	test('a rest day that qualifies is done; live minutes decide today', () => {
		const days = week([0, 0, 90, 0, 30, 0, 0]);
		expect(streakMarks(days, opts)[2]).toBe('done');
		expect(streakMarks(days, { ...opts, todayMin: 61 })[4]).toBe('done');
	});

	test('a past week has no today/future', () => {
		const past = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ day: addDays('2026-11-09', i), min: 60 }));
		expect(streakMarks(past, opts).every((m) => m === 'done')).toBe(true);
	});
});
