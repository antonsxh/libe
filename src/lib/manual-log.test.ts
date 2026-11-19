import { describe, expect, test } from 'bun:test';
import {
	dayBounds,
	durationBetween,
	endClock,
	keepSameMinute,
	overlaps,
	validateManualLog,
	validateSessionSpan,
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
		if (!r.ok) expect(r.errors.start).toBe('logInFuture');
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
		if (!r.ok) expect(r.errors.day).toBe('logTooOld');
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

describe('validateSessionSpan', () => {
	const ctx = { now, timeZone: 'UTC' };
	const span = (day: string, start: string, endDay: string, end: string) => ({
		day,
		start,
		endDay,
		end
	});

	test('valid span, also across midnight', () => {
		const r = validateSessionSpan(span('2026-11-17', '09:00', '2026-11-17', '10:30'), ctx);
		expect(r.ok && [r.startedAt.toISOString(), r.endedAt.toISOString(), r.durationMin]).toEqual([
			'2026-11-17T09:00:00.000Z',
			'2026-11-17T10:30:00.000Z',
			90
		]);
		const night = validateSessionSpan(span('2026-11-16', '22:56', '2026-11-17', '00:08'), ctx);
		expect(night.ok && night.durationMin).toBe(72);
	});

	test('end must be after start, at most 24 hours', () => {
		const same = validateSessionSpan(span('2026-11-17', '09:00', '2026-11-17', '09:00'), ctx);
		expect(!same.ok && same.errors.end).toBe('endBeforeStart');
		const before = validateSessionSpan(span('2026-11-17', '09:00', '2026-11-17', '08:00'), ctx);
		expect(!before.ok && before.errors.end).toBe('endBeforeStart');
		const long = validateSessionSpan(span('2026-11-16', '09:00', '2026-11-17', '09:01'), ctx);
		expect(!long.ok && long.errors.end).toBe('sessionTooLong');
		expect(validateSessionSpan(span('2026-11-16', '09:00', '2026-11-17', '09:00'), ctx).ok).toBe(
			true
		);
	});

	test('field errors', () => {
		const r = validateSessionSpan(span('nope', '09:00', '2026-11-17', '7pm'), ctx);
		expect(!r.ok && Object.keys(r.errors).sort()).toEqual(['day', 'end']);
		const t = validateSessionSpan(span('2026-11-17', '', '2026-11-17', '10:00'), ctx);
		expect(!t.ok && Object.keys(t.errors)).toEqual(['start']);
	});

	test('future, too old, overlapping the active session', () => {
		const future = validateSessionSpan(span('2026-11-18', '14:30', '2026-11-18', '15:30'), ctx);
		expect(!future.ok && future.errors.end).toBe('logInFuture');
		const old = validateSessionSpan(span('2025-11-01', '09:00', '2025-11-01', '10:00'), ctx);
		expect(!old.ok && old.errors.day).toBe('logTooOld');
		const active = { start: new Date('2026-11-18T14:00:00Z'), end: now };
		const clash = validateSessionSpan(span('2026-11-18', '13:30', '2026-11-18', '14:15'), {
			...ctx,
			active
		});
		expect(!clash.ok && clash.errors.start).toBe('logOverlapsTimer');
		expect(
			validateSessionSpan(span('2026-11-18', '13:00', '2026-11-18', '14:00'), { ...ctx, active }).ok
		).toBe(true);
	});

	test('timezone and DST (Europe/Berlin, 2026-10-25 has 25 hours)', () => {
		const r = validateSessionSpan(span('2026-10-25', '01:30', '2026-10-25', '04:00'), {
			now,
			timeZone: 'Europe/Berlin'
		});
		expect(r.ok && [r.startedAt.toISOString(), r.durationMin]).toEqual([
			'2026-10-24T23:30:00.000Z',
			210
		]);
	});

	test('unchanged minutes keep the original seconds', () => {
		const original = {
			startedAt: new Date('2026-11-17T09:58:23Z'),
			endedAt: new Date('2026-11-17T12:20:41Z')
		};
		const r = validateSessionSpan(span('2026-11-17', '09:58', '2026-11-17', '12:30'), {
			...ctx,
			original
		});
		expect(r.ok && [r.startedAt.toISOString(), r.endedAt.toISOString()]).toEqual([
			'2026-11-17T09:58:23.000Z',
			'2026-11-17T12:30:00.000Z'
		]);
		expect(keepSameMinute(new Date('2026-11-17T09:59:00Z'), original.startedAt).toISOString()).toBe(
			'2026-11-17T09:59:00.000Z'
		);
		expect(keepSameMinute(new Date('2026-11-17T09:59:00Z'), null).toISOString()).toBe(
			'2026-11-17T09:59:00.000Z'
		);
	});
});
