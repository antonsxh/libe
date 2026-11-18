import { describe, expect, test } from 'bun:test';
import {
	dayBounds,
	durationBetween,
	endClock,
	overlaps,
	validateManualLog,
	wallTimeToDate
} from './manual-log.ts';

const now = new Date('2026-11-18T15:00:00Z');

describe('wallTimeToDate', () => {
	test('UTC', () => {
		expect(wallTimeToDate('2026-11-18', 570, 'UTC').toISOString()).toBe('2026-11-18T09:30:00.000Z');
	});
	test('Europe/Berlin winter and summer', () => {
		expect(wallTimeToDate('2026-11-18', 570, 'Europe/Berlin').toISOString()).toBe(
			'2026-11-18T08:30:00.000Z'
		);
		expect(wallTimeToDate('2026-07-01', 570, 'Europe/Berlin').toISOString()).toBe(
			'2026-07-01T07:30:00.000Z'
		);
	});
	test('America/New_York', () => {
		expect(wallTimeToDate('2026-11-18', 0, 'America/New_York').toISOString()).toBe(
			'2026-11-18T05:00:00.000Z'
		);
	});
	test('day bounds span 23h on a DST day', () => {
		const b = dayBounds('2026-03-29', 'Europe/Berlin');
		expect(b.end.getTime() - b.start.getTime()).toBe(23 * 3_600_000);
	});
});

describe('validateManualLog', () => {
	const ctx = { now, timeZone: 'UTC' };

	test('valid entry', () => {
		const r = validateManualLog({ day: '2026-11-18', start: '09:00', durationMin: '90' }, ctx);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.startedAt.toISOString()).toBe('2026-11-18T09:00:00.000Z');
			expect(r.endedAt.toISOString()).toBe('2026-11-18T10:30:00.000Z');
			expect(r.durationMin).toBe(90);
		}
	});

	test('field errors', () => {
		const r = validateManualLog({ day: '2026-13-01', start: '25:00', durationMin: '0' }, ctx);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['day', 'duration', 'start']);
		expect(
			validateManualLog({ day: '2026-11-18', start: '09:00', durationMin: 1441 }, ctx).ok
		).toBe(false);
		expect(
			validateManualLog({ day: '2026-11-18', start: '09:00', durationMin: '2.5' }, ctx).ok
		).toBe(false);
	});

	test('not in the future', () => {
		const r = validateManualLog({ day: '2026-11-18', start: '14:30', durationMin: 60 }, ctx);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.errors.start).toMatch(/future/);
		// ending right now is fine
		expect(validateManualLog({ day: '2026-11-18', start: '14:00', durationMin: 60 }, ctx).ok).toBe(
			true
		);
	});

	test('at most 365 days back', () => {
		expect(validateManualLog({ day: '2025-11-20', start: '09:00', durationMin: 30 }, ctx).ok).toBe(
			true
		);
		const r = validateManualLog({ day: '2025-11-17', start: '09:00', durationMin: 30 }, ctx);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.errors.day).toMatch(/365/);
	});

	test('rejects overlap with the active session', () => {
		const active = { start: new Date('2026-11-18T14:00:00Z'), end: now };
		const bad = validateManualLog(
			{ day: '2026-11-18', start: '13:30', durationMin: 45 },
			{ ...ctx, active }
		);
		expect(bad.ok).toBe(false);
		const touching = validateManualLog(
			{ day: '2026-11-18', start: '13:00', durationMin: 60 },
			{ ...ctx, active }
		);
		expect(touching.ok).toBe(true);
	});
});

describe('helpers', () => {
	test('overlaps is half-open', () => {
		expect(overlaps(0, 10, 10, 20)).toBe(false);
		expect(overlaps(0, 11, 10, 20)).toBe(true);
		expect(overlaps(5, 6, 0, 20)).toBe(true);
	});
	test('end clock and duration sync', () => {
		expect(endClock(570, 90)).toBe('11:00');
		expect(endClock(1410, 60)).toBe('00:30');
		expect(durationBetween(570, 660)).toBe(90);
		expect(durationBetween(1410, 30)).toBe(60);
		expect(durationBetween(600, 600)).toBe(1440);
	});
});
