import { describe, expect, test } from 'bun:test';
import {
	addDays,
	daysBetween,
	endOfQuarter,
	formatDayLabel,
	formatDuration,
	formatHours,
	formatMinutes,
	isISODay,
	minuteOfDay,
	startOfQuarter,
	startOfWeek,
	todayISO,
	weekDays,
	weekMonthLabel,
	weekRangeLabel,
	weekdayIndex
} from './dates.ts';

describe('dates', () => {
	test('addDays crosses month/year and DST boundaries', () => {
		expect(addDays('2026-10-24', 2)).toBe('2026-10-26'); // EU DST end
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});

	test('weeks start on Monday', () => {
		expect(weekdayIndex('2026-11-16')).toBe(0); // Monday
		expect(weekdayIndex('2026-11-22')).toBe(6); // Sunday
		expect(startOfWeek('2026-11-22')).toBe('2026-11-16');
		expect(weekDays('2026-11-18')).toEqual([
			'2026-11-16',
			'2026-11-17',
			'2026-11-18',
			'2026-11-19',
			'2026-11-20',
			'2026-11-21',
			'2026-11-22'
		]);
	});

	test('startOfQuarter', () => {
		expect(startOfQuarter('2026-11-18')).toBe('2026-10-01');
		expect(startOfQuarter('2026-03-31')).toBe('2026-01-01');
	});

	test('endOfQuarter', () => {
		expect(endOfQuarter('2026-11-18')).toBe('2026-12-31');
		expect(endOfQuarter('2026-01-01')).toBe('2026-03-31');
		expect(endOfQuarter('2028-05-02')).toBe('2028-06-30');
		expect(endOfQuarter('2026-09-30')).toBe('2026-09-30');
	});

	test('daysBetween counts calendar days (DST-safe)', () => {
		expect(daysBetween('2026-10-01', '2026-11-18')).toBe(48);
		expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
		expect(daysBetween('2026-11-18', '2026-11-16')).toBe(-2);
	});

	test('todayISO respects the timezone', () => {
		const instant = new Date('2026-11-18T23:30:00Z');
		expect(todayISO('UTC', instant)).toBe('2026-11-18');
		expect(todayISO('Europe/Berlin', instant)).toBe('2026-11-19');
	});

	test('isISODay', () => {
		expect(isISODay('2026-02-28')).toBe(true);
		expect(isISODay('2026-02-30')).toBe(false);
		expect(isISODay('26-2-1')).toBe(false);
	});

	test('formatting', () => {
		expect(formatMinutes(570)).toBe('09:30');
		expect(formatDuration(36 * 60_000)).toBe('36:00');
		expect(formatDuration(3_600_000)).toBe('1:00:00');
		expect(formatHours(10.46)).toBe('10.5h');
		expect(formatHours(3)).toBe('3h');
	});

	test('minuteOfDay is timezone-aware and never exceeds 1439', () => {
		const instant = new Date('2026-11-18T13:45:00Z');
		expect(minuteOfDay(instant, 'UTC')).toBe(13 * 60 + 45);
		expect(minuteOfDay(instant, 'America/New_York')).toBe(8 * 60 + 45); // UTC−5
		expect(minuteOfDay(new Date('2026-11-19T04:59:00Z'), 'UTC')).toBe(4 * 60 + 59);
	});

	test('weekRangeLabel: same month, spanning months and a year end', () => {
		expect(weekRangeLabel('2026-11-09')).toBe('Nov 9 – 15');
		expect(weekRangeLabel('2026-10-26')).toBe('Oct 26 – Nov 1');
		expect(weekRangeLabel('2026-12-28')).toBe('Dec 28 – Jan 3');
	});

	test('weekMonthLabel names the month, or both months when a week spans two', () => {
		expect(weekMonthLabel('2026-10-12')).toBe('October 2026'); // Mon 12 – Sun 18
		expect(weekMonthLabel('2026-11-16')).toBe('November 2026');
		expect(weekMonthLabel('2026-10-26')).toBe('Oct – Nov 2026'); // Mon 26 – Sun 1 Nov
		// A week spanning a year end names both years.
		expect(weekMonthLabel('2026-12-28')).toBe('Dec 2026 – Jan 2027');
	});

	test('German labels: own range pattern, decimal comma, unit after a narrow space', () => {
		expect(weekRangeLabel('2026-11-09', 'de-DE')).toBe('9.–15. Nov.');
		expect(weekRangeLabel('2026-10-26', 'de-DE')).toBe('26. Okt. – 1. Nov.');
		expect(weekMonthLabel('2026-11-16', 'de-DE')).toBe('November 2026');
		expect(weekMonthLabel('2026-12-28', 'de-DE')).toBe('Dez. 2026 – Jan. 2027');
		expect(formatDayLabel('2026-11-16', { weekday: 'short' }, 'de-DE')).toBe('Mo');
		expect(formatHours(10.46, 'de-DE')).toBe('10,5\u202fh');
		expect(formatHours(3, 'de-DE')).toBe('3\u202fh');
	});
});
