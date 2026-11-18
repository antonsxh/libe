import { describe, expect, test } from 'bun:test';
import {
	breakAfter,
	clockElapsedMs,
	clockTargetAt,
	defaultPlannedMin,
	finishClock,
	formatClock,
	parsePlannedMin,
	parseTimerCommand,
	parsePomodoroSettings,
	pauseClock,
	resumeClock,
	rolloverPomodoro,
	skipBreak,
	startPendingPhase,
	timerView,
	type ActiveTimer,
	type PomodoroSettings,
	type RunClock,
	type SessionClock
} from './timer.ts';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 18, 9, 0, 0);
const at = (min: number, sec = 0) => T0 + min * MIN + sec * 1000;

const running = (over: Partial<SessionClock> = {}): SessionClock => ({
	state: 'running',
	startedAt: T0,
	pausedMs: 0,
	pausedAt: null,
	durationMin: 25,
	...over
});

const settings = (over: Partial<PomodoroSettings> = {}): PomodoroSettings => ({
	focusMin: 25,
	shortBreakMin: 5,
	longBreakMin: 15,
	longBreakEvery: 4,
	autoStart: true,
	...over
});

const focusRun = (over: Partial<RunClock> = {}): RunClock => ({
	phase: 'focus',
	round: 1,
	phaseStartedAt: T0,
	phaseMin: 25,
	session: running(),
	...over
});

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
	if (!r.ok) throw new Error(r.error);
	return r.value;
}

describe('session clock transitions', () => {
	test('elapsed excludes finished and live pauses', () => {
		let s = running();
		expect(clockElapsedMs(s, at(10))).toBe(10 * MIN);
		s = unwrap(pauseClock(s, at(10)));
		expect(s.state).toBe('paused');
		expect(clockElapsedMs(s, at(13))).toBe(10 * MIN); // frozen while paused
		s = unwrap(resumeClock(s, at(15)));
		expect(s.pausedMs).toBe(5 * MIN);
		expect(s.pausedAt).toBeNull();
		expect(clockElapsedMs(s, at(20))).toBe(15 * MIN);
		// second pause accumulates
		s = unwrap(pauseClock(s, at(20)));
		s = unwrap(resumeClock(s, at(22)));
		expect(s.pausedMs).toBe(7 * MIN);
		expect(clockElapsedMs(s, at(30))).toBe(23 * MIN);
	});

	test('invalid transitions are rejected', () => {
		expect(pauseClock(running({ state: 'paused', pausedAt: at(1) }), at(2)).ok).toBe(false);
		expect(resumeClock(running(), at(2)).ok).toBe(false);
	});

	test('finishing while paused folds the live pause into pausedMs', () => {
		const s = unwrap(pauseClock(running(), at(10)));
		const fin = unwrap(finishClock(s, at(14)));
		expect(fin.endedAt).toBe(at(14));
		expect(fin.pausedMs).toBe(4 * MIN);
		expect(fin.endedAt - T0 - fin.pausedMs).toBe(10 * MIN);
	});

	test('finish never ends before the start (clock skew)', () => {
		const fin = unwrap(finishClock(running(), T0 - 5000));
		expect(fin.endedAt).toBe(T0);
	});

	test('target instant shifts with pauses; none for stopwatch/paused', () => {
		expect(clockTargetAt(running())).toBe(at(25));
		expect(clockTargetAt(running({ pausedMs: 3 * MIN }))).toBe(at(28));
		expect(clockTargetAt(running({ durationMin: null }))).toBeNull();
		expect(clockTargetAt(running({ state: 'paused', pausedAt: at(1) }))).toBeNull();
	});
});

describe('formatClock', () => {
	test('MM:SS and H:MM:SS', () => {
		expect(formatClock(0)).toBe('00:00');
		expect(formatClock(36 * 60)).toBe('36:00');
		expect(formatClock(3600 + 62)).toBe('1:01:02');
		expect(formatClock(-5)).toBe('00:00');
	});
});

describe('focus-mode view', () => {
	const timer = (s: SessionClock): ActiveTimer => ({
		mode: 'focus',
		task: {
			id: 't1',
			title: 'Design',
			kind: 'quest',
			questId: 'q',
			questName: 'Q',
			questColor: 'red',
			durationMin: 25
		},
		session: { ...s, id: 's1', source: 'focus' },
		run: null
	});

	test('countdown rounds remaining up, then overtime with +', () => {
		const v0 = timerView(timer(running()), settings(), T0 + 400);
		expect(v0.display).toBe('25:00');
		expect(v0.label).toBe('RUNNING');
		const v1 = timerView(timer(running()), settings(), at(10, 30));
		expect(v1.display).toBe('14:30');
		expect(v1.progress).toBeCloseTo(10.5 / 25);
		const v2 = timerView(timer(running()), settings(), at(27, 13));
		expect(v2.overtime).toBe(true);
		expect(v2.display).toBe('+02:13');
		expect(v2.label).toBe('OVERTIME');
		expect(v2.progress).toBe(1);
	});

	test('paused shows PAUSED and the frozen remaining time', () => {
		const s = unwrap(pauseClock(running(), at(5)));
		const v = timerView(timer(s), settings(), at(9));
		expect(v.label).toBe('PAUSED');
		expect(v.status).toBe('paused');
		expect(v.display).toBe('20:00');
	});

	test('stopwatch counts up without progress', () => {
		const v = timerView(timer(running({ durationMin: null })), settings(), at(61, 5));
		expect(v.display).toBe('1:01:05');
		expect(v.progress).toBe(0);
		expect(v.overtime).toBe(false);
	});
});

describe('pomodoro rollover', () => {
	test('nothing changes before the focus round ends', () => {
		const r = rolloverPomodoro(focusRun(), settings(), at(24, 59));
		expect(r.changed).toBe(false);
		expect(r.completedCurrentAt).toBeNull();
	});

	test('focus round completes at its exact end and the break auto-starts', () => {
		const r = rolloverPomodoro(focusRun(), settings(), at(27));
		expect(r.completedCurrentAt).toBe(at(25));
		expect(r.run.phase).toBe('short_break');
		expect(r.run.phaseStartedAt).toBe(at(25));
		expect(r.run.phaseMin).toBe(5);
		expect(r.run.session).toBeNull();
		expect(r.started).toEqual([]);
	});

	test('pauses push the end of the focus round', () => {
		const run = focusRun({ session: running({ pausedMs: 4 * MIN }) });
		expect(rolloverPomodoro(run, settings(), at(28)).changed).toBe(false);
		expect(rolloverPomodoro(run, settings(), at(29)).completedCurrentAt).toBe(at(29));
	});

	test('a paused focus round never rolls over', () => {
		const run = focusRun({ session: running({ state: 'paused', pausedAt: at(10) }) });
		expect(rolloverPomodoro(run, settings(), at(500)).changed).toBe(false);
	});

	test('auto-start chains focus → break → focus and records each round', () => {
		// 25 focus, 5 break, 25 focus (running at 50 min)
		const r = rolloverPomodoro(focusRun(), settings(), at(50));
		expect(r.completedCurrentAt).toBe(at(25));
		expect(r.started).toEqual([{ startedAt: at(30), endedAt: null, durationMin: 25 }]);
		expect(r.run.phase).toBe('focus');
		expect(r.run.round).toBe(2);
		expect(r.run.session?.startedAt).toBe(at(30));
	});

	test('the 4th round is followed by a long break, after which the run waits', () => {
		const s = settings({ focusMin: 1, shortBreakMin: 1, longBreakMin: 2, longBreakEvery: 2 });
		const run = focusRun({ phaseMin: 1, session: running({ durationMin: 1 }) });
		// f1 0-1, sb 1-2, f2 2-3, lb 3-5, then waiting focus round 3
		const r = rolloverPomodoro(run, s, at(100));
		expect(r.completedCurrentAt).toBe(at(1));
		expect(r.started).toEqual([{ startedAt: at(2), endedAt: at(3), durationMin: 1 }]);
		expect(r.run).toEqual({
			phase: 'focus',
			round: 3,
			phaseStartedAt: null,
			phaseMin: 1,
			session: null
		});
		// mid long break
		const mid = rolloverPomodoro(run, s, at(4));
		expect(mid.run.phase).toBe('long_break');
		expect(mid.run.phaseStartedAt).toBe(at(3));
	});

	test('without auto-start the break waits for the user', () => {
		const r = rolloverPomodoro(focusRun(), settings({ autoStart: false }), at(40));
		expect(r.completedCurrentAt).toBe(at(25));
		expect(r.run.phase).toBe('short_break');
		expect(r.run.phaseStartedAt).toBeNull();
		// still waiting much later
		const later = rolloverPomodoro(r.run, settings({ autoStart: false }), at(400));
		expect(later.changed).toBe(false);
	});

	test('a started break ends into a waiting focus round without auto-start', () => {
		const brk: RunClock = {
			phase: 'short_break',
			round: 1,
			phaseStartedAt: at(25),
			phaseMin: 5,
			session: null
		};
		const r = rolloverPomodoro(brk, settings({ autoStart: false }), at(31));
		expect(r.run).toMatchObject({ phase: 'focus', round: 2, phaseStartedAt: null });
		expect(r.started).toEqual([]);
	});

	test('breakAfter', () => {
		expect(breakAfter(1, 4)).toBe('short_break');
		expect(breakAfter(4, 4)).toBe('long_break');
		expect(breakAfter(8, 4)).toBe('long_break');
		expect(breakAfter(3, 1)).toBe('long_break');
	});

	test('start a waiting phase / skip a break', () => {
		const waitingBreak: RunClock = {
			phase: 'short_break',
			round: 2,
			phaseStartedAt: null,
			phaseMin: 5,
			session: null
		};
		const started = unwrap(startPendingPhase(waitingBreak, settings(), at(50)));
		expect(started.phaseStartedAt).toBe(at(50));
		expect(startPendingPhase(started, settings(), at(51)).ok).toBe(false);

		const waitingFocus: RunClock = { ...waitingBreak, phase: 'focus', round: 3, phaseMin: 25 };
		const f = unwrap(startPendingPhase(waitingFocus, settings({ focusMin: 30 }), at(60)));
		expect(f.session).toMatchObject({ state: 'running', startedAt: at(60), durationMin: 30 });
		expect(f.phaseMin).toBe(30);

		const skipped = unwrap(skipBreak(started, settings(), at(52)));
		expect(skipped).toMatchObject({ phase: 'focus', round: 3, phaseStartedAt: at(52) });
		expect(skipped.session?.startedAt).toBe(at(52));
		expect(skipBreak(focusRun(), settings(), at(1)).ok).toBe(false);
	});
});

describe('pomodoro view', () => {
	const timer = (run: RunClock): ActiveTimer => ({
		mode: 'pomodoro',
		task: {
			id: 't1',
			title: 'Design',
			kind: 'other',
			questId: null,
			questName: null,
			questColor: null,
			durationMin: null
		},
		session: run.session ? { ...run.session, id: 's1', source: 'pomodoro' } : null,
		run: {
			id: 'r1',
			phase: run.phase,
			round: run.round,
			phaseStartedAt: run.phaseStartedAt,
			phaseMin: run.phaseMin
		}
	});

	test('focus round label, dots and next change', () => {
		const v = timerView(timer(focusRun({ round: 2 })), settings(), at(5));
		expect(v.label).toBe('FOCUS · ROUND 2/4');
		expect(v.display).toBe('20:00');
		expect(v.dots).toEqual(['done', 'current', 'todo', 'todo']);
		expect(v.nextChangeAt).toBe(at(25));
	});

	test('projects into the break locally before the server rolls over', () => {
		const v = timerView(timer(focusRun()), settings(), at(26));
		expect(v.phase).toBe('short_break');
		expect(v.label).toBe('SHORT BREAK');
		expect(v.display).toBe('04:00');
		expect(v.dots).toEqual(['done', 'todo', 'todo', 'todo']);
		expect(v.isFocus).toBe(false);
		expect(v.stale).toBe(true);
		expect(timerView(timer(focusRun()), settings(), at(5)).stale).toBe(false);
	});

	test('waiting break and round numbers wrap per cycle', () => {
		const v = timerView(timer(focusRun()), settings({ autoStart: false }), at(26));
		expect(v.status).toBe('waiting');
		expect(v.label).toBe('BREAK TIME');
		expect(v.display).toBe('05:00');
		const r5 = timerView(timer(focusRun({ round: 5 })), settings(), at(1));
		expect(r5.label).toBe('FOCUS · ROUND 1/4');
	});
});

describe('input validation', () => {
	test('planned minutes', () => {
		expect(parsePlannedMin('')).toEqual({ ok: true, value: null });
		expect(parsePlannedMin('45')).toEqual({ ok: true, value: 45 });
		expect(parsePlannedMin(1440).ok).toBe(true);
		expect(parsePlannedMin('0').ok).toBe(false);
		expect(parsePlannedMin('1.5').ok).toBe(false);
		expect(parsePlannedMin('1441').ok).toBe(false);
		expect(parsePlannedMin('abc').ok).toBe(false);
	});

	test('default planned minutes', () => {
		expect(defaultPlannedMin({ durationMin: 45 })).toBe(45);
		expect(defaultPlannedMin({ durationMin: null })).toBe(25);
	});

	test('pomodoro settings', () => {
		const ok = parsePomodoroSettings({
			focusMin: '50',
			shortBreakMin: '10',
			longBreakMin: '20',
			longBreakEvery: '3',
			autoStart: 'on'
		});
		expect(ok).toEqual({
			ok: true,
			value: {
				focusMin: 50,
				shortBreakMin: 10,
				longBreakMin: 20,
				longBreakEvery: 3,
				autoStart: true
			}
		});
		const off = parsePomodoroSettings({
			focusMin: 1,
			shortBreakMin: 1,
			longBreakMin: 1,
			longBreakEvery: 1
		});
		expect(off.ok && off.value.autoStart).toBe(false);
		const bad = parsePomodoroSettings({
			focusMin: '0',
			shortBreakMin: 'x',
			longBreakMin: '121',
			longBreakEvery: '13'
		});
		expect(bad.ok).toBe(false);
		if (!bad.ok)
			expect(Object.keys(bad.errors).sort()).toEqual([
				'focusMin',
				'longBreakEvery',
				'longBreakMin',
				'shortBreakMin'
			]);
	});
});

describe('parseTimerCommand', () => {
	const id = '3f1e9a3c-5b2d-4c8e-9f00-1234567890ab';
	test('start: defaults, stopwatch, replace', () => {
		expect(parseTimerCommand({ action: 'start', taskId: id })).toEqual({
			ok: true,
			command: { action: 'start', taskId: id, mode: 'focus', plannedMin: undefined, replace: false }
		});
		const sw = parseTimerCommand({ action: 'start', taskId: id, plannedMin: '', replace: '1' });
		expect(sw.ok && sw.command).toMatchObject({ plannedMin: null, replace: true });
		const p = parseTimerCommand({ action: 'start', taskId: id, mode: 'pomodoro', plannedMin: 'x' });
		expect(p.ok && p.command).toMatchObject({ mode: 'pomodoro', plannedMin: undefined });
	});
	test('rejects bad input', () => {
		expect(parseTimerCommand({ action: 'start', taskId: 'nope' }).ok).toBe(false);
		expect(parseTimerCommand({ action: 'start', taskId: id, mode: 'x' }).ok).toBe(false);
		expect(parseTimerCommand({ action: 'start', taskId: id, plannedMin: '0' }).ok).toBe(false);
		expect(parseTimerCommand({ action: 'explode' }).ok).toBe(false);
		expect(parseTimerCommand({}).ok).toBe(false);
	});
	test('simple actions and settings', () => {
		expect(parseTimerCommand({ action: 'pause' })).toEqual({
			ok: true,
			command: { action: 'pause' }
		});
		const s = parseTimerCommand({
			action: 'settings',
			settings: {
				focusMin: 1,
				shortBreakMin: 1,
				longBreakMin: 2,
				longBreakEvery: 2,
				autoStart: false
			}
		});
		expect(s.ok && s.command.action === 'settings' && s.command.settings.longBreakMin).toBe(2);
		expect(parseTimerCommand({ action: 'settings', focusMin: 0 }).ok).toBe(false);
	});
});
