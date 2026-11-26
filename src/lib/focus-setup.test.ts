import { describe, expect, test } from 'bun:test';
import {
	DURATION_CHOICES,
	initialDuration,
	isDurationChoice,
	plannedMinFor,
	withPlannedChoice
} from './focus-setup.ts';
import { parseTimerCommand } from './timer.ts';

const id = '00000000-0000-4000-8000-000000000001';

describe('initialDuration', () => {
	test('a preset plan preselects that segment', () => {
		expect(initialDuration(45)).toEqual({ choice: '45', customMin: 45 });
		expect(initialDuration(90)).toEqual({ choice: '90', customMin: 90 });
	});
	test('no plan → the default 25', () => {
		expect(initialDuration(null)).toEqual({ choice: '25', customMin: 25 });
		expect(initialDuration(undefined)).toEqual({ choice: '25', customMin: 25 });
		expect(initialDuration(0)).toEqual({ choice: '25', customMin: 25 });
	});
	test('any other plan → "Other…" with those minutes (capped like the server)', () => {
		expect(initialDuration(15)).toEqual({ choice: 'other', customMin: 15 });
		expect(initialDuration(120)).toEqual({ choice: 'other', customMin: 120 });
		expect(initialDuration(5000)).toEqual({ choice: 'other', customMin: 1440 });
	});
});

describe('plannedMinFor', () => {
	test('presets, Open and Other…', () => {
		expect(plannedMinFor('60', 12)).toBe(60);
		expect(plannedMinFor('open', 12)).toBe('');
		expect(plannedMinFor('other', 37)).toBe(37);
		expect(plannedMinFor('other', ' 37 ')).toBe('37');
		expect(plannedMinFor('other', null)).toBe('');
	});
});

describe('isDurationChoice', () => {
	test('only the six choices', () => {
		expect(DURATION_CHOICES).toEqual(['25', '45', '60', '90', 'open', 'other']);
		expect(isDurationChoice('45')).toBe(true);
		expect(isDurationChoice('30')).toBe(false);
		expect(isDurationChoice(45)).toBe(false);
	});
});

describe('withPlannedChoice (plain form posts)', () => {
	const start = { action: 'start', taskId: id, mode: 'focus' };
	const planned = (raw: Record<string, unknown>) => {
		const parsed = parseTimerCommand(withPlannedChoice(raw));
		return parsed.ok && parsed.command.action === 'start' ? parsed.command.plannedMin : parsed;
	};
	test('a preset, Open (stopwatch) and Other… reach the usual rules', () => {
		expect(planned({ ...start, duration: '45', customMin: '7' })).toBe(45);
		expect(planned({ ...start, duration: 'open', customMin: '7' })).toBeNull();
		expect(planned({ ...start, duration: 'other', customMin: '37' })).toBe(37);
	});
	test('invalid custom minutes or an unknown choice are rejected by the server rule', () => {
		expect(planned({ ...start, duration: 'other', customMin: '2000' })).toEqual({
			ok: false,
			error: 'plannedMinInvalid'
		});
		expect(planned({ ...start, duration: 'other', customMin: '0' })).toEqual({
			ok: false,
			error: 'plannedMinInvalid'
		});
		expect(planned({ ...start, duration: '30' })).toEqual({
			ok: false,
			error: 'plannedMinInvalid'
		});
	});
	test('bodies without `duration` (or with an explicit plannedMin) pass through', () => {
		const raw = { ...start, plannedMin: '12', duration: '45' };
		expect(withPlannedChoice(raw)).toBe(raw);
		const plain = { action: 'pause' };
		expect(withPlannedChoice(plain)).toBe(plain);
	});
	test('pomodoro ignores the duration like it ignores plannedMin', () => {
		const parsed = parseTimerCommand(
			withPlannedChoice({ ...start, mode: 'pomodoro', duration: 'other', customMin: 'x' })
		);
		expect(parsed.ok && parsed.command).toMatchObject({ mode: 'pomodoro', plannedMin: undefined });
	});
});
