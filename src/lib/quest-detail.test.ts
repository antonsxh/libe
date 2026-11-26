import { describe, expect, test } from 'bun:test';
import { questSummary } from './quest-detail.ts';

describe('questSummary', () => {
	const base = { weekH: 9.3, quarterH: 71.7, closed: false };
	test('with a budget: bar fill and % of the quarter target so far', () => {
		// 2026-11-26: day 57 of Q4 (Oct 1 = day 1) → 57/7 weeks × 10 h = 81.43 h target.
		expect(questSummary({ ...base, weeklyBudgetH: 10, today: '2026-11-26' })).toEqual({
			weekH: 9.3,
			quarterH: 71.7,
			budgetH: 10,
			weekFill: 0.93,
			quarterPct: 88
		});
	});
	test('the first day of a quarter counts as one day', () => {
		const s = questSummary({
			weekH: 1,
			quarterH: 1,
			closed: false,
			weeklyBudgetH: 7,
			today: '2026-10-01'
		});
		expect(s.quarterPct).toBe(100);
	});
	test('over budget: the bar is full, the percentage goes past 100', () => {
		const s = questSummary({ ...base, weekH: 12, weeklyBudgetH: 10, today: '2026-10-07' });
		expect(s.weekFill).toBe(1);
		expect(s.quarterPct).toBe(717);
	});
	test('no budget, a zero budget or a closed quest: no budget parts', () => {
		const none = { budgetH: null, weekFill: null, quarterPct: null };
		expect(questSummary({ ...base, weeklyBudgetH: null, today: '2026-11-26' })).toMatchObject(none);
		expect(questSummary({ ...base, weeklyBudgetH: 0, today: '2026-11-26' })).toMatchObject(none);
		expect(
			questSummary({ ...base, closed: true, weeklyBudgetH: 10, today: '2026-11-26' })
		).toMatchObject({ ...none, weekH: 9.3, quarterH: 71.7 });
	});
});
