import { describe, expect, test } from 'bun:test';
import { sessionElapsedMs, type SessionTiming } from './sessions.ts';

const t = (iso: string) => new Date(iso);

function session(partial: Partial<SessionTiming>): SessionTiming {
	return {
		state: 'running',
		startedAt: t('2026-11-18T10:00:00Z'),
		pausedMs: 0,
		pausedAt: null,
		endedAt: null,
		...partial
	};
}

describe('sessionElapsedMs', () => {
	test('running session: now − started_at', () => {
		const s = session({ state: 'running' });
		expect(sessionElapsedMs(s, t('2026-11-18T10:12:34Z'))).toBe(12 * 60_000 + 34_000);
	});

	test('completed session: ended_at − started_at', () => {
		const s = session({ state: 'completed', endedAt: t('2026-11-18T11:30:00Z') });
		expect(sessionElapsedMs(s, t('2026-11-18T20:00:00Z'))).toBe(90 * 60_000);
	});

	test('finished pauses are subtracted', () => {
		const s = session({
			state: 'completed',
			startedAt: t('2026-11-18T10:00:00Z'),
			endedAt: t('2026-11-18T11:00:00Z'),
			pausedMs: 90_000
		});
		expect(sessionElapsedMs(s)).toBe(58 * 60_000 + 30_000);
	});

	test('current pause (paused_at) is subtracted up to now', () => {
		const s = session({
			state: 'paused',
			startedAt: t('2026-11-18T10:00:00Z'),
			pausedMs: 60_000, // a finished pause
			pausedAt: t('2026-11-18T10:20:00Z') // current pause started
		});
		// 30 min elapsed − 1 min finished pause − 10 min current pause
		expect(sessionElapsedMs(s, t('2026-11-18T10:30:00Z'))).toBe(19 * 60_000);
	});

	test('a completed session does not subtract its stale paused_at', () => {
		const s = session({
			state: 'completed',
			startedAt: t('2026-11-18T10:00:00Z'),
			endedAt: t('2026-11-18T11:00:00Z'),
			pausedAt: t('2026-11-18T10:50:00Z')
		});
		expect(sessionElapsedMs(s)).toBe(60 * 60_000);
	});

	test('never negative (now before started_at)', () => {
		const s = session({});
		expect(sessionElapsedMs(s, t('2026-11-18T09:00:00Z'))).toBe(0);
	});

	test('defaults to the current time', () => {
		const s = session({ startedAt: new Date(Date.now() - 5_000) });
		const ms = sessionElapsedMs(s);
		expect(ms).toBeGreaterThanOrEqual(4_900);
		expect(ms).toBeLessThan(60_000);
	});
});
