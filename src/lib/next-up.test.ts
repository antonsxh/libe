import { describe, expect, test } from 'bun:test';
import { nextUp } from './next-up.ts';

const task = (id: string, done = false) => ({ id, doneAt: done ? new Date(0) : null });

describe('nextUp', () => {
	test('first open quest task in list order', () => {
		const res = nextUp([task('a', true), task('b'), task('c')], [task('x')]);
		expect(res).toEqual({ kind: 'task', task: task('b') });
	});
	test('falls back to the first open other task', () => {
		const res = nextUp([task('a', true)], [task('x', true), task('y')]);
		expect(res).toEqual({ kind: 'task', task: task('y') });
	});
	test('nothing planned vs. all done', () => {
		expect(nextUp([], [])).toEqual({ kind: 'empty', allDone: false });
		expect(nextUp([task('a', true)], [task('x', true)])).toEqual({ kind: 'empty', allDone: true });
	});
	test('ISO strings count as done too (serialised page data)', () => {
		const res = nextUp([{ id: 'a', doneAt: '2026-11-22T10:00:00Z' }], []);
		expect(res).toEqual({ kind: 'empty', allDone: true });
	});
});
