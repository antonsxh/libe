import { describe, expect, test } from 'bun:test';
import { orderAtBottom, orderAtTop } from './ordering.ts';

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
