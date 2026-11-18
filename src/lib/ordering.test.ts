import { describe, expect, test } from 'bun:test';
import { moveWithinGroup, orderAtBottom, orderAtTop } from './ordering.ts';

describe('ordering', () => {
	test('empty lists: first item gets 0 at the bottom, -1 at the top', () => {
		expect(orderAtBottom(null)).toBe(0);
		expect(orderAtBottom(undefined)).toBe(0);
		expect(orderAtTop(null)).toBe(-1);
		expect(orderAtTop(undefined)).toBe(-1);
	});

	test('inserts relative to the current list bounds', () => {
		expect(orderAtBottom(7)).toBe(8);
		expect(orderAtTop(3)).toBe(2);
		// Negative orders happen after repeated top-inserts; math keeps working.
		expect(orderAtTop(-2)).toBe(-3);
		expect(orderAtBottom(-2)).toBe(-1);
	});

	test('repeated inserts extend the list in both directions', () => {
		let min = 0;
		let max = 0;
		for (let i = 0; i < 3; i++) min = orderAtTop(min);
		for (let i = 0; i < 3; i++) max = orderAtBottom(max);
		expect([min, max]).toEqual([-3, 3]);
	});
});

describe('moveWithinGroup', () => {
	const list = [
		{ id: 'a', done: false },
		{ id: 'b', done: true },
		{ id: 'c', done: false },
		{ id: 'd', done: false }
	];
	const sameDone = (x: { done: boolean }, y: { done: boolean }) => x.done === y.done;
	const ids = (xs: { id: string }[] | null) => xs?.map((x) => x.id).join('') ?? null;

	test('swaps with the direct neighbour', () => {
		expect(ids(moveWithinGroup(list, 'd', 'up'))).toBe('abdc');
		expect(ids(moveWithinGroup(list, 'a', 'down'))).toBe('bacd');
	});

	test('skips neighbours of another group', () => {
		expect(ids(moveWithinGroup(list, 'c', 'up', sameDone))).toBe('cbad');
		expect(ids(moveWithinGroup(list, 'a', 'down', sameDone))).toBe('cbad');
	});

	test('returns null at the edges or for unknown ids', () => {
		expect(moveWithinGroup(list, 'a', 'up')).toBeNull();
		expect(moveWithinGroup(list, 'd', 'down', sameDone)).toBeNull();
		expect(moveWithinGroup(list, 'b', 'down', sameDone)).toBeNull();
		expect(moveWithinGroup(list, 'x', 'up')).toBeNull();
	});
});
