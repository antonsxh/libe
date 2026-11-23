import { describe, expect, test } from 'bun:test';
import {
	calendarWeek,
	gridStartHour,
	layoutDay,
	sessionSpanLabel,
	slotMinute,
	splitSession,
	wallMinutes,
	type CalendarSession
} from './calendar.ts';
import { weekDays } from './dates.ts';

const TZ = 'Europe/Berlin';
const MIN = 60_000;

let n = 0;
/** A completed session from ISO instants; logged = span − pausedMs. */
function s(
	start: string,
	end: string,
	opts: Partial<CalendarSession> & { pausedMs?: number } = {}
): CalendarSession {
	const startedAt = Date.parse(start);
	const endedAt = Date.parse(end);
	const { pausedMs = 0, ...rest } = opts;
	return {
		id: `s${++n}`,
		taskId: 't',
		taskTitle: 'Task',
		taskDone: false,
		questId: 'q1',
		questName: 'Quest',
		questColor: 'purple',
		source: 'focus',
		startedAt,
		endedAt,
		loggedMs: endedAt - startedAt - pausedMs,
		...rest
	};
}

describe('wallMinutes', () => {
	test('server timezone wall clock incl. seconds', () => {
		expect(wallMinutes(Date.parse('2026-11-12T09:58:30Z'), TZ)).toBe(10 * 60 + 58.5);
		expect(wallMinutes(Date.parse('2026-07-01T09:00:00Z'), TZ)).toBe(11 * 60); // CEST
		expect(wallMinutes(Date.parse('2026-11-12T09:58:00Z'), 'UTC')).toBe(9 * 60 + 58);
	});
});

describe('splitSession', () => {
	const week = weekDays('2026-11-09'); // Mon 9 – Sun 15

	test('a session within one day', () => {
		const segs = splitSession(s('2026-11-09T09:58:00Z', '2026-11-09T12:20:00Z'), week, TZ);
		expect(segs).toHaveLength(1);
		expect(segs[0]).toMatchObject({
			day: '2026-11-09',
			startMin: 10 * 60 + 58,
			endMin: 13 * 60 + 20,
			loggedMs: 142 * MIN,
			continuesBefore: false,
			continuesAfter: false
		});
	});

	test('a session crossing midnight is split per day, logged time on each part', () => {
		// Thu 22:56 → Fri 00:08 (CET = UTC+1)
		const segs = splitSession(s('2026-11-12T21:56:00Z', '2026-11-12T23:08:00Z'), week, TZ);
		expect(segs.map((x) => [x.day, x.startMin, x.endMin, x.loggedMs / MIN])).toEqual([
			['2026-11-12', 22 * 60 + 56, 1440, 64],
			['2026-11-13', 0, 8, 8]
		]);
		expect(segs[0].continuesAfter).toBe(true);
		expect(segs[1].continuesBefore).toBe(true);
	});

	test('pauses are spread proportionally over the parts', () => {
		// 23:30 → 00:30, 12 min paused → 48 min logged, 24 on each day
		const segs = splitSession(
			s('2026-11-10T22:30:00Z', '2026-11-10T23:30:00Z', { pausedMs: 12 * MIN }),
			week,
			TZ
		);
		expect(segs.map((x) => x.loggedMs / MIN)).toEqual([24, 24]);
	});

	test('parts outside the shown days are dropped', () => {
		// Sun 15 23:00 → Mon 16 01:00: only the Sunday part is in this week
		const segs = splitSession(s('2026-11-15T22:00:00Z', '2026-11-16T00:00:00Z'), week, TZ);
		expect(segs).toHaveLength(1);
		expect(segs[0]).toMatchObject({ day: '2026-11-15', startMin: 1380, endMin: 1440 });
		expect(segs[0].loggedMs).toBe(60 * MIN);
		expect(splitSession(s('2026-11-20T08:00:00Z', '2026-11-20T09:00:00Z'), week, TZ)).toEqual([]);
	});

	test('empty spans produce nothing', () => {
		expect(splitSession(s('2026-11-10T08:00:00Z', '2026-11-10T08:00:00Z'), week, TZ)).toEqual([]);
	});
});

describe('calendarWeek', () => {
	test('day totals, week total and quest vs other split', () => {
		const week = weekDays('2026-11-09');
		const res = calendarWeek(
			[
				s('2026-11-09T08:00:00Z', '2026-11-09T09:30:00Z'), // Mon 90 min quest
				s('2026-11-09T10:00:00Z', '2026-11-09T10:30:00Z', { questId: null, questColor: null }), // Mon 30 other
				s('2026-11-12T21:56:00Z', '2026-11-12T23:08:00Z'), // Thu 64 + Fri 8
				s('2026-11-02T08:00:00Z', '2026-11-02T09:00:00Z') // previous week → ignored
			],
			week,
			TZ
		);
		expect(res.dayMs.map((ms) => ms / MIN)).toEqual([120, 0, 0, 64, 8, 0, 0]);
		expect(res.totalMs / MIN).toBe(192);
		expect(res.questMs / MIN).toBe(162);
		expect(res.otherMs / MIN).toBe(30);
		expect(res.segments[0].map((x) => x.startMin)).toEqual([540, 660]);
		expect(res.segments[3]).toHaveLength(1);
		expect(res.segments[4]).toHaveLength(1);
	});

	test('DST week (Europe/Berlin, Sun 2026-10-25 has 25 hours)', () => {
		const week = weekDays('2026-10-19');
		// 01:30 CEST (23:30Z Sat) → 04:00 CET (03:00Z) = 3.5 h real time on Sunday
		const across = s('2026-10-24T23:30:00Z', '2026-10-25T03:00:00Z');
		// Sat 23:00 CEST → Sun 00:30 CEST spans midnight before the switch
		const sat = s('2026-10-24T21:00:00Z', '2026-10-24T22:30:00Z');
		// Sun 22:00 → 24:00 CET (21:00Z–23:00Z): the day ends at 23:00Z (CET midnight)
		const late = s('2026-10-25T21:00:00Z', '2026-10-25T23:00:00Z');
		const res = calendarWeek([across, sat, late], week, TZ);
		expect(res.dayMs.map((ms) => ms / MIN)).toEqual([0, 0, 0, 0, 0, 60, 210 + 30 + 120]);
		const sun = res.segments[6];
		expect(sun.map((x) => [x.startMin, x.endMin])).toEqual([
			[0, 30],
			[90, 240], // drawn by wall clock: 01:30 → 04:00
			[1320, 1440]
		]);
		expect(res.totalMs / MIN).toBe(420);
	});

	test('the active session counts with its live elapsed time', () => {
		const week = weekDays('2026-11-16');
		const live = s('2026-11-18T08:00:00Z', '2026-11-18T09:00:00Z', {
			active: true,
			loggedMs: 50 * MIN // 10 min paused
		});
		const res = calendarWeek([live], week, TZ);
		expect(res.dayMs[2] / MIN).toBe(50);
		expect(res.segments[2][0].session.active).toBe(true);
	});
});

describe('layoutDay', () => {
	const seg = (id: string, startMin: number, endMin: number) => ({ id, startMin, endMin });
	const place = (items: ReturnType<typeof seg>[], minMin = 0) =>
		layoutDay(items, minMin).map((p) => [p.item.id, p.column, p.columns]);

	test('a chain of overlaps shares one cluster', () => {
		// a overlaps b, b overlaps c, a and c do not → two lanes, c reuses lane 0
		expect(place([seg('a', 540, 600), seg('b', 590, 650), seg('c', 640, 700)])).toEqual([
			['a', 0, 2],
			['b', 1, 2],
			['c', 0, 2]
		]);
	});

	test('three-way overlap and a separate cluster', () => {
		expect(
			place([seg('a', 600, 720), seg('b', 610, 640), seg('c', 615, 700), seg('d', 800, 830)])
		).toEqual([
			['a', 0, 3],
			['b', 1, 3],
			['c', 2, 3],
			['d', 0, 1]
		]);
	});

	test('short entries are laid out with their drawn minimum height', () => {
		expect(place([seg('a', 600, 605), seg('b', 610, 660)])).toEqual([
			['a', 0, 1],
			['b', 0, 1]
		]);
		expect(place([seg('a', 600, 605), seg('b', 610, 660)], 20)).toEqual([
			['a', 0, 2],
			['b', 1, 2]
		]);
	});

	test('drawn range stays inside the day', () => {
		const [p] = layoutDay([seg('a', 1435, 1440)], 20);
		expect([p.top, p.bottom]).toEqual([1420, 1440]);
	});

	test('midnight split parts lay out in their own days', () => {
		const week = weekDays('2026-11-09');
		const res = calendarWeek(
			[
				s('2026-11-12T21:56:00Z', '2026-11-12T23:08:00Z'),
				s('2026-11-12T22:30:00Z', '2026-11-12T22:50:00Z')
			],
			week,
			TZ
		);
		expect(layoutDay(res.segments[3]).map((p) => [p.column, p.columns])).toEqual([
			[0, 2],
			[1, 2]
		]);
		expect(layoutDay(res.segments[4]).map((p) => [p.column, p.columns, p.top, p.bottom])).toEqual([
			[0, 1, 0, 8]
		]);
	});
});

describe('helpers', () => {
	test('gridStartHour extends before 6:00 only when needed', () => {
		expect(gridStartHour([])).toBe(6);
		expect(gridStartHour([600, 420])).toBe(6);
		expect(gridStartHour([600, 330])).toBe(5);
		expect(gridStartHour([0])).toBe(0);
	});

	test('slotMinute rounds down to 15 minutes', () => {
		expect(slotMinute(0, 50, 6)).toBe(360);
		expect(slotMinute(49, 50, 6)).toBe(405); // 6:58.8 → 6:45
		expect(slotMinute(50 * 4 + 13, 50, 6)).toBe(600 + 15);
		expect(slotMinute(-5, 50, 6)).toBe(360);
		expect(slotMinute(10_000, 50, 6)).toBe(1425);
	});

	test('sessionSpanLabel', () => {
		expect(sessionSpanLabel(s('2026-11-09T09:58:00Z', '2026-11-09T12:20:00Z'), TZ)).toBe(
			'10:58 – 13:20'
		);
		expect(sessionSpanLabel(s('2026-11-12T21:56:00Z', '2026-11-12T23:08:00Z'), TZ)).toBe(
			'Thu 22:56 – Fri 00:08'
		);
		expect(sessionSpanLabel(s('2026-11-12T21:56:00Z', '2026-11-12T23:08:00Z'), TZ, 'de-DE')).toBe(
			'Do 22:56 – Fr 00:08'
		);
		// ending exactly at midnight stays on the start day
		expect(sessionSpanLabel(s('2026-11-12T22:00:00Z', '2026-11-12T23:00:00Z'), TZ)).toBe(
			'23:00 – 00:00'
		);
	});
});
