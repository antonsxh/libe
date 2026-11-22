import { describe, expect, test } from 'bun:test';
import {
	OVERDUE_MAX_IDS,
	OVERDUE_PREVIEW,
	appendOrders,
	compareOverdue,
	isOverdue,
	overdueAge,
	overdueAgeLabel,
	overdueDays,
	overdueTargetDay,
	parseOverdueSelection,
	parseOverdueTarget,
	previewOverdue
} from './overdue.ts';

const today = '2026-11-22';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('isOverdue', () => {
	const base = { day: '2026-11-21', doneAt: null, kind: 'quest' as const, questClosedAt: null };
	test('open task of an open quest before today', () => {
		expect(isOverdue(base, today)).toBe(true);
		expect(isOverdue({ ...base, day: '2025-01-01' }, today)).toBe(true);
		expect(isOverdue({ ...base, kind: 'other' }, today)).toBe(true);
	});
	test('today, the future and the backlog are not overdue', () => {
		expect(isOverdue({ ...base, day: today }, today)).toBe(false);
		expect(isOverdue({ ...base, day: '2026-11-23' }, today)).toBe(false);
		expect(isOverdue({ ...base, day: null }, today)).toBe(false);
	});
	test('done tasks (Date or serialised string) are not overdue', () => {
		expect(isOverdue({ ...base, doneAt: new Date() }, today)).toBe(false);
		expect(isOverdue({ ...base, doneAt: '2026-11-21T10:00:00Z' }, today)).toBe(false);
	});
	test("a closed quest's tasks stay hidden; other tasks have no quest", () => {
		expect(isOverdue({ ...base, questClosedAt: new Date() }, today)).toBe(false);
		expect(isOverdue({ ...base, kind: 'other', questClosedAt: new Date() }, today)).toBe(true);
	});
});

describe('compareOverdue', () => {
	const t = (id: string, day: string, order: number, created = '2026-11-01T00:00:00Z') => ({
		id,
		day,
		order,
		createdAt: new Date(created)
	});
	test('most recent day first, then list order, then creation', () => {
		const list = [
			t('old', '2026-11-18', 0),
			t('y2', '2026-11-21', 1),
			t('y1b', '2026-11-21', 0, '2026-11-02T00:00:00Z'),
			t('y1a', '2026-11-21', 0),
			t('mid', '2026-11-20', -3)
		];
		expect(list.sort(compareOverdue).map((x) => x.id)).toEqual(['y1a', 'y1b', 'y2', 'mid', 'old']);
	});
	test('serialised createdAt strings compare like dates', () => {
		const a = { day: '2026-11-21', order: 0, createdAt: '2026-11-01T00:00:00Z' };
		const b = { day: '2026-11-21', order: 0, createdAt: '2026-11-01T00:00:01Z' };
		expect(compareOverdue(a, b)).toBeLessThan(0);
	});
});

describe('overdueAge', () => {
	test('yesterday, an older day, another year', () => {
		expect(overdueAge('2026-11-21', today)).toEqual({ kind: 'yesterday' });
		expect(overdueAge('2026-11-18', today)).toEqual({ kind: 'since', withYear: false });
		expect(overdueAge('2025-12-31', '2026-01-01')).toEqual({ kind: 'yesterday' });
		expect(overdueAge('2025-12-30', '2026-01-01')).toEqual({ kind: 'since', withYear: true });
	});
	test('labels via Intl', () => {
		const en = { yesterday: 'yesterday', since: (d: string) => `since ${d}` };
		const de = { yesterday: 'gestern', since: (d: string) => `seit ${d}` };
		expect(overdueAgeLabel('2026-11-21', today, en)).toBe('yesterday');
		expect(overdueAgeLabel('2026-11-18', today, en, 'en-US')).toBe('since Wed, Nov 18');
		expect(overdueAgeLabel('2026-11-18', today, de, 'de-DE')).toBe('seit Mi., 18. Nov.');
		expect(overdueAgeLabel('2025-11-18', today, en, 'en-US')).toBe('since Tue, Nov 18, 2025');
	});
});

describe('previewOverdue', () => {
	const list = Array.from({ length: 7 }, (_, i) => i);
	test('first rows only until expanded', () => {
		expect(previewOverdue(list, false)).toEqual({
			shown: list.slice(0, OVERDUE_PREVIEW),
			hidden: 7 - OVERDUE_PREVIEW
		});
		expect(previewOverdue(list, true)).toEqual({ shown: list, hidden: 0 });
		expect(previewOverdue([1, 2], false)).toEqual({ shown: [1, 2], hidden: 0 });
		expect(previewOverdue(list, false, 3)).toEqual({ shown: [0, 1, 2], hidden: 4 });
	});
});

describe('targets and selections', () => {
	test('only today and tomorrow are targets', () => {
		expect(parseOverdueTarget('today')).toBe('today');
		expect(parseOverdueTarget('tomorrow')).toBe('tomorrow');
		expect(parseOverdueTarget('yesterday')).toBeNull();
		expect(parseOverdueTarget(null)).toBeNull();
		expect(overdueTargetDay('today', today)).toBe(today);
		expect(overdueTargetDay('tomorrow', '2026-12-31')).toBe('2027-01-01');
	});
	test('all, or distinct valid UUIDs', () => {
		expect(parseOverdueSelection(true, [])).toBe('all');
		expect(parseOverdueSelection(true, [uuid(1)])).toBeNull();
		expect(parseOverdueSelection(false, [])).toBeNull();
		expect(parseOverdueSelection(false, [uuid(1), uuid(2), uuid(1)])).toEqual([uuid(1), uuid(2)]);
		expect(parseOverdueSelection(false, [uuid(1), 'nope'])).toBeNull();
		expect(parseOverdueSelection(false, [uuid(1), 7])).toBeNull();
		const many = Array.from({ length: OVERDUE_MAX_IDS + 1 }, (_, i) => uuid(i));
		expect(parseOverdueSelection(false, many)).toBeNull();
		expect(parseOverdueSelection(false, many.slice(1))).toHaveLength(OVERDUE_MAX_IDS);
	});
});

describe('appendOrders', () => {
	test('each kind continues after its own list, in the given order', () => {
		const orders = appendOrders(
			[
				{ id: 'a', kind: 'quest' },
				{ id: 'x', kind: 'other' },
				{ id: 'b', kind: 'quest' }
			],
			{ quest: 4, other: null }
		);
		expect([...orders]).toEqual([
			['a', 5],
			['x', 0],
			['b', 6]
		]);
	});
	test('empty target lists start at 0', () => {
		expect([...appendOrders([{ id: 'a', kind: 'quest' }], {})]).toEqual([['a', 0]]);
	});
});

test('overdueDays: the distinct planned days', () => {
	expect([
		...overdueDays([
			{ day: '2026-11-20' },
			{ day: '2026-11-20' },
			{ day: '2026-11-18' },
			{ day: null }
		])
	]).toEqual(['2026-11-20', '2026-11-18']);
});
