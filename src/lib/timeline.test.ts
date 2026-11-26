import { describe, expect, test } from 'bun:test';
import {
	dayWindow,
	layoutBlocks,
	nextHalfHourMinutes,
	nowWindow,
	parseClock,
	planSummary,
	validateBlockSpan
} from './timeline.ts';

describe('layoutBlocks', () => {
	const b = (id: string, startMin: number, endMin: number) => ({ id, startMin, endMin });
	const place = (...blocks: ReturnType<typeof b>[]) =>
		layoutBlocks(blocks).map((p) => ({ id: p.block.id, column: p.column, columns: p.columns }));

	test('empty input', () => {
		expect(layoutBlocks([])).toEqual([]);
	});

	test('non-overlapping blocks share one column', () => {
		expect(place(b('a', 540, 600), b('b', 600, 660), b('c', 700, 750))).toEqual([
			{ id: 'a', column: 0, columns: 1 },
			{ id: 'b', column: 0, columns: 1 },
			{ id: 'c', column: 0, columns: 1 }
		]);
	});

	test('touching blocks (end === start) do not overlap', () => {
		expect(place(b('a', 540, 600), b('b', 600, 660))).toEqual([
			{ id: 'a', column: 0, columns: 1 },
			{ id: 'b', column: 0, columns: 1 }
		]);
	});

	test('two overlapping blocks get side-by-side columns', () => {
		expect(place(b('a', 540, 630), b('b', 600, 660))).toEqual([
			{ id: 'a', column: 0, columns: 2 },
			{ id: 'b', column: 1, columns: 2 }
		]);
	});

	test('separate clusters are laid out independently', () => {
		// a/b overlap each other; c is alone → its own cluster with a single column.
		expect(place(b('a', 0, 10), b('b', 5, 15), b('c', 20, 30))).toEqual([
			{ id: 'a', column: 0, columns: 2 },
			{ id: 'b', column: 1, columns: 2 },
			{ id: 'c', column: 0, columns: 1 }
		]);
	});

	test('clusters chain over transitive overlaps and reuse freed lanes', () => {
		// a∩b, b∩c → one cluster of three; c fits back into lane 0 because a ended first.
		expect(place(b('a', 0, 10), b('b', 5, 15), b('c', 12, 20))).toEqual([
			{ id: 'a', column: 0, columns: 2 },
			{ id: 'b', column: 1, columns: 2 },
			{ id: 'c', column: 0, columns: 2 }
		]);
	});

	test('three simultaneous blocks occupy three lanes', () => {
		expect(place(b('a', 540, 600), b('b', 545, 600), b('c', 550, 600))).toEqual([
			{ id: 'a', column: 0, columns: 3 },
			{ id: 'b', column: 1, columns: 3 },
			{ id: 'c', column: 2, columns: 3 }
		]);
	});

	test('result preserves input order even when input is unsorted', () => {
		expect(place(b('late', 900, 960), b('early', 540, 600), b('mid', 570, 630))).toEqual([
			{ id: 'late', column: 0, columns: 1 },
			{ id: 'early', column: 0, columns: 2 },
			{ id: 'mid', column: 1, columns: 2 }
		]);
	});
});

describe('parseClock', () => {
	test('parses valid HH:MM values', () => {
		expect(parseClock('00:00')).toBe(0);
		expect(parseClock('09:30')).toBe(570);
		expect(parseClock('23:59')).toBe(1439);
	});

	test('rejects anything else', () => {
		expect(parseClock('')).toBeNull();
		expect(parseClock('9:30')).toBeNull();
		expect(parseClock('24:00')).toBeNull();
		expect(parseClock('12:60')).toBeNull();
		expect(parseClock('12-30')).toBeNull();
		expect(parseClock('12:30:15')).toBeNull();
		expect(parseClock(null)).toBeNull();
	});
});

describe('nextHalfHourMinutes', () => {
	const at = (h: number, m: number) => new Date(2026, 10, 18, h, m, 5); // local time, seconds ignored

	test('rounds up to the next full half hour', () => {
		expect(nextHalfHourMinutes(at(9, 30))).toBe(600); // 09:30:05 → 10:00
		expect(nextHalfHourMinutes(at(9, 5))).toBe(570); // 09:05 → 09:30
		expect(nextHalfHourMinutes(at(0, 1))).toBe(30); // 00:01 → 00:30
	});

	test('caps so a 30-minute block still ends by midnight', () => {
		expect(nextHalfHourMinutes(at(23, 45))).toBe(1410); // 23:45 → 23:30, not 24:00
		expect(nextHalfHourMinutes(at(23, 35))).toBe(1410);
	});
});

describe('validateBlockSpan', () => {
	test('valid spans return the end minute', () => {
		expect(validateBlockSpan(540, 90)).toEqual({ ok: true, endMin: 630 });
		expect(validateBlockSpan(0, 1440)).toEqual({ ok: true, endMin: 1440 });
		expect(validateBlockSpan(1439, 1)).toEqual({ ok: true, endMin: 1440 });
	});

	test('rejects out-of-range starts, non-positive durations and post-midnight ends', () => {
		expect(validateBlockSpan(1440, 30).ok).toBe(false);
		expect(validateBlockSpan(-10, 30).ok).toBe(false);
		expect(validateBlockSpan(540, 0).ok).toBe(false);
		expect(validateBlockSpan(540, -15).ok).toBe(false);
		expect(validateBlockSpan(1380, 90).ok).toBe(false); // ends 25:30
		expect(validateBlockSpan(540.5, 30).ok).toBe(false);
	});
});

describe('dayWindow', () => {
	test('06:00–24:00, earlier when a block starts before 6', () => {
		expect(dayWindow([])).toEqual({ startHour: 6, endHour: 24 });
		expect(dayWindow([{ startMin: 600, endMin: 660 }])).toEqual({ startHour: 6, endHour: 24 });
		expect(dayWindow([{ startMin: 330, endMin: 400 }])).toEqual({ startHour: 5, endHour: 24 });
		expect(dayWindow([{ startMin: 0, endMin: 30 }])).toEqual({ startHour: 0, endHour: 24 });
	});
});

describe('nowWindow', () => {
	const b = (startMin: number, endMin: number) => ({ startMin, endMin });

	test('one hour back, four ahead, whole hours', () => {
		expect(nowWindow([], 10 * 60 + 20)).toEqual({ startHour: 9, endHour: 15 });
		expect(nowWindow([], 10 * 60)).toEqual({ startHour: 9, endHour: 14 });
	});

	test('stretches to every block still ahead, also one running since before the window', () => {
		expect(nowWindow([b(20 * 60, 21 * 60 + 30)], 10 * 60)).toEqual({ startHour: 9, endHour: 22 });
		expect(nowWindow([b(6 * 60, 11 * 60)], 10 * 60)).toEqual({ startHour: 6, endHour: 14 });
	});

	test('blocks that ended before the window are left to the whole-day view', () => {
		expect(nowWindow([b(7 * 60, 8 * 60), b(8 * 60, 9 * 60)], 10 * 60)).toEqual({
			startHour: 9,
			endHour: 14
		});
	});

	test('stays inside the day and keeps at least five hours', () => {
		expect(nowWindow([], 23 * 60 + 30)).toEqual({ startHour: 19, endHour: 24 });
		expect(nowWindow([], 20)).toEqual({ startHour: 0, endHour: 5 });
		expect(nowWindow([b(0, 1440)], 12 * 60)).toEqual({ startHour: 0, endHour: 24 });
	});
});

describe('planSummary', () => {
	const b = (id: string, startMin: number, endMin: number) => ({ id, startMin, endMin });

	test('nothing planned', () => {
		expect(planSummary([], 600)).toEqual({ kind: 'empty' });
	});

	test('the running block wins, else the next one by start', () => {
		const blocks = [b('late', 900, 960), b('soon', 660, 720), b('now', 570, 630)];
		expect(planSummary(blocks, 600)).toEqual({ kind: 'now', block: blocks[2] });
		expect(planSummary(blocks, 630)).toEqual({ kind: 'next', block: blocks[1] });
	});

	test('everything behind: how many blocks there were', () => {
		expect(planSummary([b('a', 60, 120), b('b', 120, 180)], 600)).toEqual({
			kind: 'past',
			count: 2
		});
	});
});
