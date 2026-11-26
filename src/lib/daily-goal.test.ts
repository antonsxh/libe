import { describe, expect, test } from 'bun:test';
import { i18n } from '#lib/i18n/index.ts';
import {
	DAILY_GOAL_MAX,
	DAILY_GOAL_MIN,
	DAILY_GOAL_PRESETS,
	goalChoice,
	goalProgress,
	isDailyGoal,
	liveLoggedMin,
	parseDailyGoal,
	runningSpan,
	splitMinutes,
	toDailyGoal,
	type TodayLog
} from './daily-goal.ts';
import type { ActiveTimer, TimerView } from './timer.ts';

const invalid = { ok: false, error: 'dailyGoalInvalid' } as const;

describe('isDailyGoal / toDailyGoal', () => {
	test('15 min … 16 h in quarter hours', () => {
		expect(isDailyGoal(DAILY_GOAL_MIN)).toBe(true);
		expect(isDailyGoal(DAILY_GOAL_MAX)).toBe(true);
		expect(isDailyGoal(135)).toBe(true);
		expect(isDailyGoal(0)).toBe(false);
		expect(isDailyGoal(DAILY_GOAL_MAX + 15)).toBe(false);
		expect(isDailyGoal(50)).toBe(false);
		expect(isDailyGoal(60.5)).toBe(false);
		expect(isDailyGoal('60')).toBe(false);
	});

	test('every preset is a valid goal', () => {
		for (const p of DAILY_GOAL_PRESETS) expect(isDailyGoal(p)).toBe(true);
	});

	test('stored values outside the rule mean no goal', () => {
		expect(toDailyGoal(240)).toBe(240);
		expect(toDailyGoal(null)).toBeNull();
		expect(toDailyGoal(undefined)).toBeNull();
		expect(toDailyGoal(7)).toBeNull();
	});
});

describe('parseDailyGoal', () => {
	test('off / empty → no goal', () => {
		expect(parseDailyGoal({ preset: 'off' })).toEqual({ ok: true, value: null });
		expect(parseDailyGoal({ preset: '' })).toEqual({ ok: true, value: null });
		expect(parseDailyGoal({ preset: null })).toEqual({ ok: true, value: null });
	});

	test('a preset in minutes', () => {
		expect(parseDailyGoal({ preset: '240' })).toEqual({ ok: true, value: 240 });
		expect(parseDailyGoal({ preset: '45' })).toEqual({ ok: true, value: 45 });
		expect(parseDailyGoal({ preset: '50' })).toEqual(invalid);
		expect(parseDailyGoal({ preset: 'lots' })).toEqual(invalid);
	});

	test('custom hours + minutes, boundaries included', () => {
		const custom = (hours: string, minutes: string) =>
			parseDailyGoal({ preset: 'custom', hours, minutes });
		expect(custom('2', '15')).toEqual({ ok: true, value: 135 });
		expect(custom('0', '15')).toEqual({ ok: true, value: 15 });
		expect(custom('16', '0')).toEqual({ ok: true, value: 960 });
		expect(custom(' 3 ', '')).toEqual({ ok: true, value: 180 });
		expect(custom('16', '15')).toEqual(invalid);
		expect(custom('0', '0')).toEqual(invalid);
		expect(custom('', '')).toEqual(invalid);
		expect(custom('1', '10')).toEqual(invalid);
		expect(custom('-1', '30')).toEqual(invalid);
		expect(custom('1.5', '0')).toEqual(invalid);
	});
});

test('goalChoice: off, a preset or custom', () => {
	expect(goalChoice(null)).toBe('off');
	expect(goalChoice(240)).toBe('240');
	expect(goalChoice(135)).toBe('custom');
	// Settings lists fewer presets: everything else is custom there.
	expect(goalChoice(120, [30, 60, 120, 180])).toBe('120');
	expect(goalChoice(240, [30, 60, 120, 180])).toBe('custom');
	expect(goalChoice(null, [30, 60])).toBe('off');
});

test('splitMinutes', () => {
	expect(splitMinutes(130)).toEqual({ h: 2, m: 10 });
	expect(splitMinutes(59.9)).toEqual({ h: 0, m: 59 });
	expect(splitMinutes(-5)).toEqual({ h: 0, m: 0 });
	expect(splitMinutes(240)).toEqual({ h: 4, m: 0 });
});

describe('liveLoggedMin', () => {
	const H = 3_600_000;
	const log: TodayLog = { day: '2026-11-20', loggedMin: 90, start: 100 * H, end: 124 * H };

	test('server minutes alone without an active session', () => {
		expect(liveLoggedMin(log, null, 110 * H)).toBe(90);
	});

	test('adds the running time of a session started today', () => {
		const running = { startedAt: 109 * H, elapsedMs: 30 * 60_000 };
		expect(liveLoggedMin(log, running, 109.5 * H)).toBe(120);
	});

	test('a session started yesterday counts for yesterday (its start day), like Home', () => {
		const running = { startedAt: 99 * H, elapsedMs: 2 * H };
		expect(liveLoggedMin(log, running, 101 * H)).toBe(90);
	});

	test("after midnight yesterday's minutes drop; a session started since then counts", () => {
		expect(liveLoggedMin(log, null, 125 * H)).toBe(0);
		expect(liveLoggedMin(log, { startedAt: 123 * H, elapsedMs: 2 * H }, 125 * H)).toBe(0);
		expect(liveLoggedMin(log, { startedAt: 124.5 * H, elapsedMs: 30 * 60_000 }, 125 * H)).toBe(30);
	});
});

describe('runningSpan', () => {
	const session = {
		id: 's1',
		source: 'focus' as const,
		state: 'running' as const,
		startedAt: 1_000,
		pausedMs: 0,
		pausedAt: null,
		durationMin: 25
	};
	const timer = { mode: 'focus', session, run: null } as unknown as ActiveTimer;
	const view = (v: Partial<TimerView>) => ({ isFocus: true, elapsedMs: 5_000, ...v }) as TimerView;

	test('the focus session’s start and the elapsed time the view shows', () => {
		expect(runningSpan(timer, view({}))).toEqual({ startedAt: 1_000, elapsedMs: 5_000 });
	});

	test('nothing in breaks, waiting phases or without a session', () => {
		expect(runningSpan(timer, view({ isFocus: false, elapsedMs: 0 }))).toBeNull();
		expect(runningSpan(timer, view({ elapsedMs: 0 }))).toBeNull();
		expect(runningSpan({ ...timer, session: null }, view({}))).toBeNull();
		expect(runningSpan(null, null)).toBeNull();
	});
});

describe('goalProgress', () => {
	test('fraction clamped to 0‥1, whole minutes rounded down', () => {
		expect(goalProgress(30, 60)).toEqual({
			loggedMin: 30,
			goalMin: 60,
			fraction: 0.5,
			done: false
		});
		expect(goalProgress(59.9, 60)).toMatchObject({ loggedMin: 59, done: false });
		expect(goalProgress(60, 60)).toMatchObject({ fraction: 1, done: true });
		expect(goalProgress(200, 60)).toMatchObject({ loggedMin: 200, fraction: 1, done: true });
		expect(goalProgress(-3, 60)).toMatchObject({ loggedMin: 0, fraction: 0 });
		expect(goalProgress(NaN, 60)).toMatchObject({ loggedMin: 0, fraction: 0 });
	});
});

test('accessible progress text in both languages', () => {
	const label = (locale: 'en' | 'de', logged: number, goal: number) => {
		const t = i18n(locale);
		const d = (min: number) => {
			const { h, m } = splitMinutes(min);
			return t.goal.duration(h, m);
		};
		return t.goal.progress(d(logged), d(goal));
	};
	expect(label('en', 130, 240)).toBe('2 h 10 min of 4 h today');
	expect(label('en', 30, 60)).toBe('30 min of 1 h today');
	expect(label('en', 0, 90)).toBe('0 min of 1 h 30 min today');
	expect(label('de', 130, 240)).toBe('2 h 10 min von 4 h heute');
});
