import { describe, expect, test } from 'bun:test';
import {
	SEARCH_MAX_LEN,
	dayBucket,
	escapeLike,
	filterByText,
	flattenGroups,
	isApplePlatform,
	isPaletteShortcut,
	matchRank,
	normalizeQuery,
	rankQuests,
	rankTasks,
	stepIndex,
	taskHref
} from './palette.ts';

describe('normalizeQuery', () => {
	test('trims, collapses whitespace, rejects non-strings', () => {
		expect(normalizeQuery('  deep\t  work \n')).toBe('deep work');
		expect(normalizeQuery('   ')).toBe('');
		expect(normalizeQuery(null)).toBe('');
		expect(normalizeQuery(42)).toBe('');
	});

	test('cuts to the maximum length without a trailing space', () => {
		expect(normalizeQuery('x'.repeat(500))).toHaveLength(SEARCH_MAX_LEN);
		const q = normalizeQuery(`${'a'.repeat(SEARCH_MAX_LEN - 1)} b`);
		expect(q).toBe('a'.repeat(SEARCH_MAX_LEN - 1));
	});
});

describe('escapeLike', () => {
	test('escapes the LIKE wildcards and the escape character', () => {
		expect(escapeLike('50%_off\\now')).toBe('50\\%\\_off\\\\now');
		expect(escapeLike('plain text')).toBe('plain text');
		expect(escapeLike('%%')).toBe('\\%\\%');
	});
});

describe('matchRank / filterByText', () => {
	test('prefix < word start < substring < no match, case-insensitive', () => {
		expect(matchRank('Calendar', 'cal')).toBe(0);
		expect(matchRank('Log time…', 'TIME')).toBe(1);
		expect(matchRank('Pause timer', 'imer')).toBe(2);
		expect(matchRank('Plan', 'xyz')).toBe(-1);
		expect(matchRank('Anything', '')).toBe(0);
	});

	test('a later word start beats an earlier substring hit', () => {
		expect(matchRank('restart start', 'start')).toBe(1);
	});

	test('filters and sorts by rank, ties keep their order', () => {
		const items = ['Review', 'Home', 'Resume timer', 'Pause timer', 'Stop timer'];
		expect(filterByText(items, 'ti', (s) => s)).toEqual([
			'Resume timer',
			'Pause timer',
			'Stop timer'
		]);
		expect(filterByText(items, 're', (s) => s)).toEqual(['Review', 'Resume timer']);
		expect(filterByText(items, '', (s) => s)).toEqual(items);
	});
});

describe('rankTasks', () => {
	const today = '2026-11-20';
	const task = (title: string, day: string | null) => ({ title, day });

	test('title prefix first, then title substring, then quest-name-only matches', () => {
		const ranked = rankTasks(
			[task('Write the report', today), task('Quest only', today), task('Report draft', today)],
			'report',
			today
		);
		expect(ranked.map((t) => t.title)).toEqual(['Report draft', 'Write the report', 'Quest only']);
	});

	test('today/upcoming before past and backlog, then by title', () => {
		const ranked = rankTasks(
			[
				task('Read b', null),
				task('Read a', '2026-11-01'),
				task('Read d', '2026-12-01'),
				task('Read c', today)
			],
			'read',
			today
		);
		expect(ranked.map((t) => t.title)).toEqual(['Read c', 'Read d', 'Read a', 'Read b']);
	});

	test('limits the result', () => {
		const many = Array.from({ length: 20 }, (_, i) => task(`T ${i}`, today));
		expect(rankTasks(many, 't', today, 8)).toHaveLength(8);
	});

	test('day buckets', () => {
		expect(dayBucket(today, today)).toBe(0);
		expect(dayBucket('2026-11-21', today)).toBe(0);
		expect(dayBucket('2026-11-19', today)).toBe(1);
		expect(dayBucket(null, today)).toBe(2);
	});
});

describe('rankQuests', () => {
	test('prefix matches first, grid order otherwise', () => {
		const quests = [{ name: 'Learn Rust' }, { name: 'Rust side project' }, { name: 'Trust' }];
		expect(rankQuests(quests, 'rust').map((q) => q.name)).toEqual([
			'Rust side project',
			'Learn Rust',
			'Trust'
		]);
		expect(rankQuests(quests, 'rust', 1)).toHaveLength(1);
	});
});

describe('taskHref', () => {
	const today = '2026-11-20'; // a Friday
	test('today → Home, backlog → Home with the Backlog sheet', () => {
		expect(taskHref({ day: today, kind: 'quest' }, today)).toBe('/');
		expect(taskHref({ day: null, kind: 'quest' }, today)).toBe('/?backlog=1');
		expect(taskHref({ day: null, kind: 'other' }, today)).toBe('/?backlog=1');
	});

	test('another day → that week on the Plan board, Other zone expanded for other tasks', () => {
		expect(taskHref({ day: '2026-11-25', kind: 'quest' }, today)).toBe('/plan?week=2026-11-23');
		expect(taskHref({ day: '2026-11-16', kind: 'quest' }, today)).toBe('/plan?week=2026-11-16');
		expect(taskHref({ day: '2026-11-29', kind: 'other' }, today)).toBe(
			'/plan?week=2026-11-23&other=2026-11-29'
		);
	});
});

describe('keyboard navigation', () => {
	test('flattens groups in order', () => {
		expect(
			flattenGroups([
				{ key: 'a', label: 'A', items: [1, 2] },
				{ key: 'b', label: 'B', items: [] },
				{ key: 'c', label: 'C', items: [3] }
			])
		).toEqual([1, 2, 3]);
	});

	test('↑/↓ wrap around; nothing to select → -1', () => {
		expect(stepIndex(0, 1, 3)).toBe(1);
		expect(stepIndex(2, 1, 3)).toBe(0);
		expect(stepIndex(0, -1, 3)).toBe(2);
		expect(stepIndex(-1, 1, 3)).toBe(0);
		expect(stepIndex(-1, -1, 3)).toBe(2);
		expect(stepIndex(7, 1, 3)).toBe(0);
		expect(stepIndex(0, 1, 0)).toBe(-1);
	});
});

describe('shortcut', () => {
	const key = (k: Partial<Parameters<typeof isPaletteShortcut>[0]>) => ({
		key: 'k',
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		...k
	});

	test('⌘K on Apple, Ctrl+K elsewhere', () => {
		expect(isPaletteShortcut(key({ metaKey: true }), true)).toBe(true);
		expect(isPaletteShortcut(key({ ctrlKey: true }), true)).toBe(false);
		expect(isPaletteShortcut(key({ ctrlKey: true }), false)).toBe(true);
		expect(isPaletteShortcut(key({ metaKey: true }), false)).toBe(false);
		expect(isPaletteShortcut(key({ key: 'K', ctrlKey: true }), false)).toBe(true);
	});

	test('other modifiers, other keys and other layouts', () => {
		expect(isPaletteShortcut(key({ ctrlKey: true, shiftKey: true }), false)).toBe(false);
		expect(isPaletteShortcut(key({ ctrlKey: true, altKey: true }), false)).toBe(false);
		expect(isPaletteShortcut(key({ key: 'j', ctrlKey: true }), false)).toBe(false);
		expect(isPaletteShortcut(key({ key: 'л', code: 'KeyK', ctrlKey: true }), false)).toBe(true);
		expect(isPaletteShortcut(key({}), false)).toBe(false);
	});

	test('Apple platform detection prefers client hints', () => {
		expect(isApplePlatform({ userAgentData: { platform: 'macOS' }, platform: 'Linux' })).toBe(true);
		expect(isApplePlatform({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' })).toBe(
			false
		);
		expect(isApplePlatform({ userAgentData: { platform: '' }, platform: 'iPhone' })).toBe(true);
		expect(isApplePlatform({ platform: 'Win32' })).toBe(false);
		expect(isApplePlatform({ platform: '', userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0)' })).toBe(
			true
		);
		expect(isApplePlatform(undefined)).toBe(false);
	});
});
