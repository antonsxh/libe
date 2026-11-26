import { describe, expect, test } from 'bun:test';
import {
	doneLast,
	dropIntoList,
	mergeDayLists,
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

describe('doneLast', () => {
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
});

describe('mergeDayLists', () => {
	const t = (id: string, done = false) => ({ id, doneAt: done ? '2026-11-25T10:00:00Z' : null });
	const view = (rows: ReturnType<typeof mergeDayLists<ReturnType<typeof t>>>) =>
		rows.map((r) => `${r.task.id}${r.first ? '^' : ''}${r.last ? 'v' : ''}`);

	test('empty lists', () => {
		expect(mergeDayLists([], [])).toEqual([]);
	});

	test('open quest work, open Other, done quest work, done Other — each in list order', () => {
		const quest = [t('q1'), t('q2', true), t('q3'), t('q4')];
		const other = [t('o1', true), t('o2'), t('o3', true)];
		expect(view(mergeDayLists(quest, other))).toEqual([
			'q1^',
			'q3',
			'q4v',
			'o2^v',
			'q2^v',
			'o1^',
			'o3v'
		]);
	});

	test('↑/↓ edges never cross a list or the open/done boundary', () => {
		const rows = mergeDayLists([t('q1'), t('q2')], [t('o1'), t('o2')]);
		// o1 is not the merged list's first row, but the first of its own list → ↑ disabled.
		expect(view(rows)).toEqual(['q1^', 'q2v', 'o1^', 'o2v']);
	});
});
