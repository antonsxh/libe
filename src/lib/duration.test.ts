import { describe, expect, test } from 'bun:test';
import { formatDurationMin, formatDurationMs } from './duration.ts';
import { de } from './i18n/de.ts';
import { en } from './i18n/en.ts';

const NB = ' ';
const NNB = '\u202f';

describe('formatDurationMin', () => {
	test('matches the i18n goal durations', () => {
		expect(en.goal.duration(2, 10)).toBe(formatDurationMin(130));
		expect(de.goal.duration(0, 45)).toBe(formatDurationMin(45, 'de-DE'));
	});

	test('English', () => {
		expect(formatDurationMin(0)).toBe(`0${NB}min`);
		expect(formatDurationMin(1)).toBe(`1${NB}min`);
		expect(formatDurationMin(25)).toBe(`25${NB}min`);
		expect(formatDurationMin(59)).toBe(`59${NB}min`);
		expect(formatDurationMin(60)).toBe(`1${NB}h`);
		expect(formatDurationMin(90)).toBe(`1${NB}h 30${NB}min`);
		expect(formatDurationMin(1050)).toBe(`17${NB}h 30${NB}min`);
	});

	test('German: same units, a narrow no-break space before them', () => {
		expect(formatDurationMin(0, 'de-DE')).toBe(`0${NNB}min`);
		expect(formatDurationMin(25, 'de-DE')).toBe(`25${NNB}min`);
		expect(formatDurationMin(60, 'de-DE')).toBe(`1${NNB}h`);
		expect(formatDurationMin(90, 'de-DE')).toBe(`1${NNB}h 30${NNB}min`);
	});

	test('a day or more stays in hours', () => {
		expect(formatDurationMin(24 * 60)).toBe(`24${NB}h`);
		expect(formatDurationMin(26 * 60 + 5)).toBe(`26${NB}h 5${NB}min`);
	});

	test('rounds to whole minutes; never negative or NaN', () => {
		expect(formatDurationMin(59.6)).toBe(`1${NB}h`);
		expect(formatDurationMin(89.4)).toBe(`1${NB}h 29${NB}min`);
		expect(formatDurationMin(0.4)).toBe(`0${NB}min`);
		expect(formatDurationMin(-5)).toBe(`0${NB}min`);
		expect(formatDurationMin(Number.NaN)).toBe(`0${NB}min`);
	});
});

describe('formatDurationMs', () => {
	test('rounds to the nearest minute', () => {
		expect(formatDurationMs(29_000)).toBe(`0${NB}min`);
		expect(formatDurationMs(31_000)).toBe(`1${NB}min`);
		expect(formatDurationMs(75 * 60_000)).toBe(`1${NB}h 15${NB}min`);
		expect(formatDurationMs(539 * 60_000, 'de-DE')).toBe(`8${NNB}h 59${NNB}min`);
	});
});
