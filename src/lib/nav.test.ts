import { describe, expect, test } from 'bun:test';
import { NAV_ITEMS, TAB_ITEMS, activeTab, isActive } from './nav.ts';

describe('isActive', () => {
	test('home matches only the root', () => {
		expect(isActive('/', '/')).toBe(true);
		expect(isActive('/plan', '/')).toBe(false);
	});
	test('sections match themselves and sub-paths, not prefixes of other words', () => {
		expect(isActive('/quests', '/quests')).toBe(true);
		expect(isActive('/quests/abc', '/quests')).toBe(true);
		expect(isActive('/questsx', '/quests')).toBe(false);
	});
});

describe('phone tab bar', () => {
	test('lists every section except Focus, in top-bar order', () => {
		expect(TAB_ITEMS.map((i) => i.key)).toEqual(['home', 'plan', 'calendar', 'quests', 'review']);
		expect(NAV_ITEMS.some((i) => i.key === 'focus')).toBe(true);
	});
	test('activeTab: index among the tabs (Focus skipped)', () => {
		expect(activeTab('/')).toBe(0);
		expect(activeTab('/calendar')).toBe(2);
		expect(activeTab('/quests')).toBe(3);
		expect(activeTab('/quests/some-id')).toBe(3);
		expect(activeTab('/review')).toBe(4);
	});
	test('activeTab: account pages rest on the avatar slot, others have none', () => {
		expect(activeTab('/settings')).toBe(TAB_ITEMS.length);
		expect(activeTab('/styleguide')).toBe(-1);
		expect(activeTab('/focus')).toBe(-1);
	});
});
