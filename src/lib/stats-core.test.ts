import { describe, expect, test } from 'bun:test';
import {
	aggregateQuestStats,
	dayWeekMinutes,
	loggedMsByTask,
	sessionMinutes,
	type SessionRow
} from './stats-core.ts';

const d = (iso: string) => new Date(iso);

function row(partial: Partial<SessionRow> & Pick<SessionRow, 'startedAt'>): SessionRow {
	return {
		questId: 'q1',
		endedAt: null,
		pausedMs: 0,
		durationMin: null,
		...partial
	};
}

/** Reference "today": Wed 2026-11-18 → week Mon 11-16 … Sun 11-22, quarter starts 2026-10-01. */
const TODAY = '2026-11-18';

describe('sessionMinutes', () => {
	test('uses wall time minus pauses when ended_at is set', () => {
		expect(
			sessionMinutes(
				row({
					startedAt: d('2026-11-18T09:00:00Z'),
					endedAt: d('2026-11-18T10:30:00Z'),
					pausedMs: 5 * 60_000
				})
			)
		).toBe(85);
	});

	test('falls back to duration_min when ended_at is missing', () => {
		expect(sessionMinutes(row({ startedAt: d('2026-11-18T09:00:00Z'), durationMin: 25 }))).toBe(25);
	});

	test('falls back to duration_min when wall time is not positive', () => {
		expect(
			sessionMinutes(
				row({
					startedAt: d('2026-11-18T10:00:00Z'),
					endedAt: d('2026-11-18T10:00:00Z'),
					durationMin: 10
				})
			)
		).toBe(10);
	});

	test('is 0 when nothing is known', () => {
		expect(sessionMinutes(row({ startedAt: d('2026-11-18T10:00:00Z') }))).toBe(0);
	});
});

describe('aggregateQuestStats', () => {
	test('buckets the current week and sparkline weeks (oldest → newest)', () => {
		const rows = [
			// Current week (Mon 11-16): 2h on Mon + 1h on Wed.
			row({ startedAt: d('2026-11-16T08:00:00Z'), endedAt: d('2026-11-16T10:00:00Z') }),
			row({ startedAt: d('2026-11-18T09:00:00Z'), endedAt: d('2026-11-18T10:00:00Z') }),
			// Last week: 3h (sparkline slot weeks-2).
			row({ startedAt: d('2026-11-11T09:00:00Z'), endedAt: d('2026-11-11T12:00:00Z') }),
			// 8 weeks ago (Mon 09-28): first sparkline slot.
			row({ startedAt: d('2026-09-28T09:00:00Z'), endedAt: d('2026-09-28T10:00:00Z') }),
			// 9 weeks ago (Mon 09-21): outside the 8-week window.
			row({ startedAt: d('2026-09-21T09:00:00Z'), endedAt: d('2026-09-21T12:00:00Z') })
		];
		const { byQuest, quarterTotalH } = aggregateQuestStats(rows, { today: TODAY, timeZone: 'UTC' });
		const q1 = byQuest.get('q1')!;
		expect(q1.weekH).toBeCloseTo(3);
		expect(q1.weeklyH).toHaveLength(8);
		expect(q1.weeklyH[0]).toBeCloseTo(1); // 09-28
		expect(q1.weeklyH[6]).toBeCloseTo(3); // 11-09 week
		expect(q1.weeklyH[7]).toBeCloseTo(3); // current week
		// 09-21 and 09-28 are in Q3 → excluded from quarter sums.
		expect(quarterTotalH).toBeCloseTo(6);
		expect(q1.quarterH).toBeCloseTo(6);
	});

	test('quarter boundary (Oct 1) is respected, session day comes from started_at', () => {
		const rows = [
			// Starts Sun 23:50, ends after midnight → still attributed to 09-30 (Q3).
			row({ startedAt: d('2026-09-30T23:50:00Z'), endedAt: d('2026-10-01T01:00:00Z') }),
			row({ startedAt: d('2026-10-01T00:10:00Z'), endedAt: d('2026-10-01T02:10:00Z') })
		];
		const { quarterTotalH } = aggregateQuestStats(rows, { today: TODAY, timeZone: 'UTC' });
		expect(quarterTotalH).toBeCloseTo(2);
	});

	test('sessions of "other" tasks only count towards the quarter total', () => {
		const rows = [
			row({
				questId: null,
				startedAt: d('2026-11-17T09:00:00Z'),
				endedAt: d('2026-11-17T10:00:00Z')
			})
		];
		const { byQuest, quarterTotalH } = aggregateQuestStats(rows, { today: TODAY, timeZone: 'UTC' });
		expect(byQuest.size).toBe(0);
		expect(quarterTotalH).toBeCloseTo(1);
	});

	test('several quests are bucketed separately; zero-minute sessions are ignored', () => {
		const rows = [
			row({
				questId: 'a',
				startedAt: d('2026-11-18T09:00:00Z'),
				endedAt: d('2026-11-18T09:30:00Z')
			}),
			row({ questId: 'b', startedAt: d('2026-11-18T09:00:00Z'), durationMin: 45 }),
			row({ questId: 'c', startedAt: d('2026-11-18T09:00:00Z') })
		];
		const { byQuest } = aggregateQuestStats(rows, { today: TODAY, timeZone: 'UTC' });
		expect([...byQuest.keys()]).toEqual(['a', 'b']);
		expect(byQuest.get('a')!.weekH).toBeCloseTo(0.5);
		expect(byQuest.get('b')!.weekH).toBeCloseTo(0.75);
	});

	test('empty rows produce no quests and a zero total', () => {
		const { byQuest, quarterTotalH } = aggregateQuestStats([], { today: TODAY, timeZone: 'UTC' });
		expect(byQuest.size).toBe(0);
		expect(quarterTotalH).toBe(0);
	});
});

describe('dayWeekMinutes', () => {
	const row = (
		startedAt: Date,
		endedAt: Date | null = null,
		durationMin: number | null = null
	) => ({
		startedAt,
		endedAt,
		pausedMs: 0,
		durationMin
	});

	test('totals today and the Mon–Sun week around it', () => {
		const rows = [
			// Today: 90 min wall time.
			row(d('2026-11-18T09:00:00Z'), d('2026-11-18T10:30:00Z'), null),
			// Earlier this week (Mon): 2h, plus a fallback-duration session: 30 min.
			row(d('2026-11-16T08:00:00Z'), d('2026-11-16T10:00:00Z')),
			row(d('2026-11-17T18:00:00Z'), null, 30),
			// Last Sunday (previous week) and next Monday: outside the week.
			row(d('2026-11-15T09:00:00Z'), d('2026-11-15T11:00:00Z')),
			row(d('2026-11-23T09:00:00Z'), d('2026-11-23T11:00:00Z'))
		];
		const { todayMin, weekMin } = dayWeekMinutes(rows, { today: TODAY, timeZone: 'UTC' });
		expect(todayMin).toBeCloseTo(90);
		expect(weekMin).toBeCloseTo(90 + 120 + 30);
	});

	test('session day follows started_at in the given timezone', () => {
		// 00:30Z on the 19th is still the 18th in New York (UTC-5).
		const rows = [row(d('2026-11-19T00:30:00Z'), d('2026-11-19T01:30:00Z'))];
		const ny = dayWeekMinutes(rows, { today: '2026-11-18', timeZone: 'America/New_York' });
		expect(ny.todayMin).toBeCloseTo(60);
		const utc = dayWeekMinutes(rows, { today: '2026-11-18', timeZone: 'UTC' });
		expect(utc.todayMin).toBe(0);
	});

	test('empty rows give zeroes', () => {
		expect(dayWeekMinutes([], { today: TODAY, timeZone: 'UTC' })).toEqual({
			todayMin: 0,
			weekMin: 0
		});
	});
});

describe('loggedMsByTask', () => {
	test('sums completed sessions per task across days; zero-minute sessions are ignored', () => {
		const ms = loggedMsByTask([
			{
				taskId: 't1',
				startedAt: d('2026-11-18T09:00:00Z'),
				endedAt: d('2026-11-18T09:45:00Z'),
				pausedMs: 0,
				durationMin: null
			},
			{
				taskId: 't1',
				startedAt: d('2026-11-16T09:00:00Z'),
				endedAt: null,
				pausedMs: 0,
				durationMin: 15
			},
			{
				taskId: 't2',
				startedAt: d('2026-11-18T10:00:00Z'),
				endedAt: d('2026-11-18T12:00:00Z'),
				pausedMs: 0,
				durationMin: null
			},
			{
				taskId: 't3',
				startedAt: d('2026-11-18T10:00:00Z'),
				endedAt: null,
				pausedMs: 0,
				durationMin: null
			}
		]);
		expect(ms.get('t1')).toBeCloseTo(60 * 60_000);
		expect(ms.get('t2')).toBeCloseTo(2 * 3_600_000);
		expect(ms.has('t3')).toBe(false);
	});
});
