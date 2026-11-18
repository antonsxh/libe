import { describe, expect, test } from 'bun:test';
import { parseTaskDuration, validateTaskTitle } from './task-form.ts';

describe('validateTaskTitle', () => {
	test('trims and accepts', () => {
		const result = validateTaskTitle('  Design the next chapter  ');
		expect(result.ok && result.title).toBe('Design the next chapter');
	});

	test('rejects empty and over-long titles', () => {
		expect(validateTaskTitle('   ').ok).toBe(false);
		expect(validateTaskTitle('x'.repeat(201)).ok).toBe(false);
	});
});

describe('parseTaskDuration', () => {
	test('empty means unset', () => {
		expect(parseTaskDuration('')).toEqual({ ok: true, minutes: null });
		expect(parseTaskDuration('  ')).toEqual({ ok: true, minutes: null });
	});

	test('accepts whole minutes up to a day', () => {
		expect(parseTaskDuration('30')).toEqual({ ok: true, minutes: 30 });
		expect(parseTaskDuration('1440')).toEqual({ ok: true, minutes: 1440 });
	});

	test('rejects 0, negatives, fractions and > 1440', () => {
		for (const bad of ['0', '-5', '30.5', '1441', 'abc']) {
			expect(parseTaskDuration(bad).ok).toBe(false);
		}
	});
});
