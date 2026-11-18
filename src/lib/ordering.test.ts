import { describe, expect, test } from 'bun:test';
import {
	doneLast,
	dropIntoList,
	groupEdges,
	moveWithinGroup,
	orderAtBottom,
	orderAtTop
} from './ordering.ts';

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

describe('dropIntoList', () => {
	const ids = (xs: { id: string }[]) => xs.map((x) => x.id).join('');

	test('same-list reorder moves before the target card', () => {
		const list = items();
		expect(ids(dropIntoList(list, list[3], 'b'))).toBe('adbc');
		expect(ids(dropIntoList(list, list[0], 'd'))).toBe('bcad');
		// Result indexes are the new order values: 0..n-1 with no gaps.
		expect(dropIntoList(items(), items()[0], 'c')).toHaveLength(4);
	});

	test('null or unknown before id appends at the end', () => {
		const list = items();
		expect(ids(dropIntoList(list, list[0], null))).toBe('bcda');
		expect(ids(dropIntoList(list, list[1], 'nope'))).toBe('acdb');
	});

	test('cross-list move inserts into the foreign list', () => {
		const target = [{ id: 'x' }, { id: 'y' }];
		const moved = { id: 'z' };
		expect(ids(dropIntoList(target, moved, 'x'))).toBe('zxy');
		expect(ids(dropIntoList(target, moved, null))).toBe('xyz');
		// Dropping relative to its own id without being in the list → end.
		expect(ids(dropIntoList(target, moved, 'z'))).toBe('xyz');
	});

	test('dropping before itself keeps the position (no-op)', () => {
		const list = items();
		expect(ids(dropIntoList(list, list[2], 'c'))).toBe('abcd');
	});

	function items() {
		return [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
	}
});

describe('doneLast / groupEdges', () => {
	const d = new Date('2026-11-18T10:00:00Z');
	const list = [
		{ id: 'a', doneAt: null },
		{ id: 'b', doneAt: d },
		{ id: 'c', doneAt: null },
		{ id: 'd', doneAt: d }
	];

	test('doneLast sinks finished tasks, preserving order', () => {
		const { open, done } = doneLast(list);
		expect(open.map((t) => t.id)).toEqual(['a', 'c']);
		expect(done.map((t) => t.id)).toEqual(['b', 'd']);
	});

	test('groupEdges marks the edges of each open/done group', () => {
		const rendered = doneLast(list).open.concat(doneLast(list).done); // a c b d
		expect(groupEdges(rendered, 0)).toEqual({ first: true, last: false });
		expect(groupEdges(rendered, 1)).toEqual({ first: false, last: true }); // a|c
		expect(groupEdges(rendered, 2)).toEqual({ first: true, last: false }); // b|d
		expect(groupEdges(rendered, 3)).toEqual({ first: false, last: true });
	});
});
