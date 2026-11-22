import { describe, expect, test } from 'bun:test';
import { dayDirection, dayHref, resolveDay, stepDay } from './day-view.ts';

const MON = '2026-11-16';
const SUN = '2026-11-22';

describe('resolveDay', () => {
	test('a valid day inside the shown week wins', () => {
		expect(resolveDay('2026-11-18', MON, '2026-11-20')).toBe('2026-11-18');
		expect(resolveDay(MON, MON, '2026-11-20')).toBe(MON);
		expect(resolveDay(SUN, MON, '2026-11-20')).toBe(SUN);
	});
	test('missing, invalid or outside the week → today when the week contains it', () => {
		expect(resolveDay(null, MON, '2026-11-20')).toBe('2026-11-20');
		expect(resolveDay('2026-11-23', MON, '2026-11-20')).toBe('2026-11-20');
		expect(resolveDay('2026-11-15', MON, '2026-11-20')).toBe('2026-11-20');
		expect(resolveDay('2026-02-30', MON, '2026-11-20')).toBe('2026-11-20');
		expect(resolveDay('tomorrow', MON, '2026-11-20')).toBe('2026-11-20');
	});
	test('…else the Monday of the shown week', () => {
		expect(resolveDay(null, '2026-11-23', '2026-11-20')).toBe('2026-11-23');
		expect(resolveDay('2026-11-18', '2026-11-23', '2026-11-20')).toBe('2026-11-23');
	});
});

describe('stepDay', () => {
	test('inside a week', () => {
		expect(stepDay('2026-11-18', 1)).toEqual({ day: '2026-11-19', week: MON });
		expect(stepDay('2026-11-18', -1)).toEqual({ day: '2026-11-17', week: MON });
	});
	test('crosses into the next / previous week (and month / year)', () => {
		expect(stepDay(SUN, 1)).toEqual({ day: '2026-11-23', week: '2026-11-23' });
		expect(stepDay(MON, -1)).toEqual({ day: '2026-11-15', week: '2026-11-09' });
		expect(stepDay('2026-12-31', 1)).toEqual({ day: '2027-01-01', week: '2026-12-28' });
	});
	test('DST weekend keeps whole days', () => {
		expect(stepDay('2026-10-25', 1)).toEqual({ day: '2026-10-26', week: '2026-10-26' });
	});
});

describe('dayHref', () => {
	test('sets day and its week, keeps other params', () => {
		expect(dayHref('?q=a,b&hideDone=1', '2026-11-18', MON)).toBe(
			'?q=a%2Cb&hideDone=1&week=2026-11-16&day=2026-11-18'
		);
	});
	test('a new week replaces ?week= and drops week-scoped params', () => {
		const href = dayHref(`?week=${MON}&day=${SUN}&other=${SUN}&plan=1`, '2026-11-23', MON, [
			'other'
		]);
		const p = new URLSearchParams(href);
		expect(p.get('week')).toBe('2026-11-23');
		expect(p.get('day')).toBe('2026-11-23');
		expect(p.get('other')).toBeNull();
		expect(p.get('plan')).toBe('1');
	});
	test('the same week keeps week-scoped params, even without ?week=', () => {
		const p = new URLSearchParams(dayHref(`?other=${SUN}`, '2026-11-17', MON, ['other']));
		expect(p.get('other')).toBe(SUN);
		expect(p.get('week')).toBe(MON);
	});
	test('drops a form action param', () => {
		expect(dayHref('?day=x&/add', MON, MON)).toBe(`?day=${MON}&week=${MON}`);
	});
});

describe('dayDirection', () => {
	test('later / earlier / same', () => {
		expect(dayDirection(MON, SUN)).toBe(1);
		expect(dayDirection(SUN, MON)).toBe(-1);
		expect(dayDirection(MON, MON)).toBe(0);
		expect(dayDirection(null, MON)).toBe(0);
	});
});
