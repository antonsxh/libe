import { describe, expect, test } from 'bun:test';
import {
	hasQuestExtras,
	parseQuestForm,
	validateQuestForm,
	type QuestFormFields
} from './quest-form.ts';

const fields = (partial: Partial<QuestFormFields> = {}): QuestFormFields => ({
	name: 'Launch my idea',
	description: '',
	icon: '🚀',
	color: 'red',
	weeklyBudgetH: '',
	...partial
});

describe('validateQuestForm', () => {
	test('accepts a minimal quest and applies defaults', () => {
		const result = validateQuestForm(fields({ icon: '' }));
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.draft).toEqual({
				name: 'Launch my idea',
				description: '',
				icon: '✨', // default icon
				color: 'red',
				weeklyBudgetH: null
			});
		}
	});

	test('parses the weekly budget', () => {
		const result = validateQuestForm(fields({ weeklyBudgetH: '7.5' }));
		expect(result.ok && result.draft.weeklyBudgetH).toBe(7.5);
	});

	test('rejects an empty or too-long name', () => {
		expect(validateQuestForm(fields({ name: '   ' })).ok).toBe(false);
		expect(validateQuestForm(fields({ name: 'x'.repeat(81) })).ok).toBe(false);
	});

	test('rejects a too-long description', () => {
		const result = validateQuestForm(fields({ description: 'x'.repeat(281) }));
		expect(!result.ok && result.errors.description).toBeDefined();
	});

	test('rejects a non-emoji icon', () => {
		const result = validateQuestForm(fields({ icon: 'ab' }));
		expect(!result.ok && result.errors.icon).toBeDefined();
	});

	test('rejects an unknown colour', () => {
		const result = validateQuestForm(fields({ color: 'neon' }));
		expect(!result.ok && result.errors.color).toBeDefined();
	});

	test('budget must be > 0 and ≤ 168', () => {
		for (const bad of ['0', '-3', '168.5', 'abc', 'Infinity']) {
			const result = validateQuestForm(fields({ weeklyBudgetH: bad }));
			expect(!result.ok && result.errors.weeklyBudgetH).toBeDefined();
		}
		expect(validateQuestForm(fields({ weeklyBudgetH: '168' })).ok).toBe(true);
	});

	test('trims name and description', () => {
		const result = validateQuestForm(fields({ name: '  Launch  ', description: '  hi  ' }));
		expect(result.ok && result.draft.name).toBe('Launch');
		expect(result.ok && result.draft.description).toBe('hi');
	});
});

describe('parseQuestForm', () => {
	test('reads all fields as strings, missing ones as empty', () => {
		const fd = new FormData();
		fd.set('name', 'X');
		fd.set('color', 'teal');
		expect(parseQuestForm(fd)).toEqual({
			name: 'X',
			description: '',
			icon: '',
			color: 'teal',
			weeklyBudgetH: ''
		});
	});
});

describe('hasQuestExtras', () => {
	test('a new quest (nothing given) starts collapsed', () => {
		expect(hasQuestExtras(null)).toBe(false);
		expect(hasQuestExtras(undefined)).toBe(false);
		expect(hasQuestExtras({})).toBe(false);
	});

	test('the default icon, blank description and no budget are not "set"', () => {
		expect(hasQuestExtras({ icon: '✨', description: '  ', weeklyBudgetH: null })).toBe(false);
		expect(hasQuestExtras({ icon: '', description: '', weeklyBudgetH: '' })).toBe(false);
	});

	test('any of icon, description or budget opens "More options"', () => {
		expect(hasQuestExtras({ icon: '🚀' })).toBe(true);
		expect(hasQuestExtras({ icon: '✨', description: 'Why it matters' })).toBe(true);
		expect(hasQuestExtras({ icon: '✨', weeklyBudgetH: 3 })).toBe(true);
		// Echoed form input after a failed submit (strings).
		expect(hasQuestExtras({ icon: '', description: '', weeklyBudgetH: '0' })).toBe(true);
	});
});
