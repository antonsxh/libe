/**
 * Pure focus-timer model (client-safe, no DB imports).
 *
 * The server is the single source of truth: it stores the active session (`sessions` row in
 * state running/paused) and, in pomodoro mode, the active run (`pomodoro_runs`). Everything
 * here works on plain millisecond timestamps so the same code
 *   - validates transitions on the server (pause/resume/finish),
 *   - rolls a pomodoro run forward lazily from its timestamps (`rolloverPomodoro`),
 *   - renders the live timer on clients from a server snapshot plus a clock offset (`timerView`).
 */
import { isUuid } from '#lib/ids.ts';
import type { ErrorCode, I18n } from '#lib/i18n/index.ts';

export type TimerMode = 'focus' | 'pomodoro';
export type PomodoroPhase = 'focus' | 'short_break' | 'long_break';
export type ActiveState = 'running' | 'paused';

/** Default countdown target when a task has no planned duration. */
export const DEFAULT_FOCUS_MIN = 25;
/** Countdown targets / manual logs are 1‥1440 minutes. */
export const MAX_TIMER_MIN = 1440;

export interface PomodoroSettings {
	focusMin: number;
	shortBreakMin: number;
	longBreakMin: number;
	/** A long break follows every N-th focus round. */
	longBreakEvery: number;
	/** Start the next phase automatically when one ends. */
	autoStart: boolean;
}

export const DEFAULT_POMODORO: PomodoroSettings = {
	focusMin: 25,
	shortBreakMin: 5,
	longBreakMin: 15,
	longBreakEvery: 4,
	autoStart: true
};

// ─── Session clock ──────────────────────────────────────────────────────────

/** Timing of an active session in epoch ms (JSON-friendly mirror of the `sessions` row). */
export interface SessionClock {
	state: ActiveState;
	startedAt: number;
	/** Sum of finished pauses. */
	pausedMs: number;
	/** Start of the current pause while paused. */
	pausedAt: number | null;
	/** Countdown target in minutes; null = open-ended stopwatch. */
	durationMin: number | null;
}

/** `error` is a code for `t.errors[code]`. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: ErrorCode };

/** Running time so far: wall time minus finished pauses minus the live pause. Never negative. */
export function clockElapsedMs(s: SessionClock, now: number): number {
	const live = s.state === 'paused' && s.pausedAt !== null ? Math.max(0, now - s.pausedAt) : 0;
	return Math.max(0, now - s.startedAt - s.pausedMs - live);
}

export function pauseClock(s: SessionClock, now: number): Result<SessionClock> {
	if (s.state !== 'running') return { ok: false, error: 'timerNotRunning' };
	return { ok: true, value: { ...s, state: 'paused', pausedAt: Math.max(now, s.startedAt) } };
}

export function resumeClock(s: SessionClock, now: number): Result<SessionClock> {
	if (s.state !== 'paused') return { ok: false, error: 'timerNotPaused' };
	const pause = s.pausedAt !== null ? Math.max(0, now - s.pausedAt) : 0;
	return {
		ok: true,
		value: { ...s, state: 'running', pausedAt: null, pausedMs: s.pausedMs + pause }
	};
}

/**
 * End an active session at `now` (complete or stop). A live pause is folded into `pausedMs`,
 * so `endedAt − startedAt − pausedMs` is exactly the running time.
 */
export function finishClock(
	s: SessionClock,
	now: number
): Result<{ endedAt: number; pausedMs: number }> {
	const endedAt = Math.max(now, s.startedAt);
	const live = s.state === 'paused' && s.pausedAt !== null ? Math.max(0, endedAt - s.pausedAt) : 0;
	return { ok: true, value: { endedAt, pausedMs: s.pausedMs + live } };
}

/** When a running countdown reaches its target (ms epoch); null for stopwatches/paused. */
export function clockTargetAt(s: SessionClock): number | null {
	if (s.durationMin === null || s.state !== 'running') return null;
	return s.startedAt + s.durationMin * 60_000 + s.pausedMs;
}

// ─── Pomodoro rollover ──────────────────────────────────────────────────────

/** The pomodoro part of the timer state (mirror of the `pomodoro_runs` row + its focus session). */
export interface RunClock {
	phase: PomodoroPhase;
	/** 1-based focus round number (keeps counting across cycles). */
	round: number;
	/** null = the phase waits for the user (auto-start off). */
	phaseStartedAt: number | null;
	phaseMin: number;
	/** The focus round's session while a focus phase has started; null otherwise. */
	session: SessionClock | null;
}

export interface FocusRound {
	startedAt: number;
	/** null = still running at `now`. */
	endedAt: number | null;
	durationMin: number;
}

export interface RolloverResult {
	run: RunClock;
	/** The pre-existing focus session finished at this instant (null = untouched). */
	completedCurrentAt: number | null;
	/** Focus rounds auto-started during the rollover (the last one may still be running). */
	started: FocusRound[];
	changed: boolean;
}

/** Break that follows focus round `round`. */
export function breakAfter(round: number, every: number): 'short_break' | 'long_break' {
	return every > 0 && round % every === 0 ? 'long_break' : 'short_break';
}

/** Hard cap on derived phases per rollover (bounds pathological inputs). */
const MAX_STEPS = 500;

/**
 * Roll a pomodoro run forward to `now`, purely from timestamps (no server timers):
 * - a running focus round ends exactly at `start + focus + pauses`; its session is completed
 *   at that instant and the break begins — immediately with auto-start, else it waits;
 * - a break ends at `start + length`; the next focus round starts at that instant with
 *   auto-start, else it waits. **After a long break the run always waits**, so an
 *   unattended run logs at most one cycle of focus rounds.
 * Paused focus rounds and waiting phases never advance.
 */
export function rolloverPomodoro(
	run: RunClock,
	settings: PomodoroSettings,
	now: number
): RolloverResult {
	let state: RunClock = { ...run };
	let completedCurrentAt: number | null = null;
	const started: FocusRound[] = [];
	let changed = false;

	for (let step = 0; step < MAX_STEPS; step++) {
		if (state.phaseStartedAt === null) break;
		if (state.phase === 'focus') {
			const s = state.session;
			if (!s || s.state !== 'running') break;
			const end = s.startedAt + (s.durationMin ?? state.phaseMin) * 60_000 + s.pausedMs;
			if (end > now) break;
			if (started.length > 0) started[started.length - 1].endedAt = end;
			else completedCurrentAt = end;
			const next = breakAfter(state.round, settings.longBreakEvery);
			state = {
				phase: next,
				round: state.round,
				phaseMin: next === 'long_break' ? settings.longBreakMin : settings.shortBreakMin,
				phaseStartedAt: settings.autoStart ? end : null,
				session: null
			};
		} else {
			const end = state.phaseStartedAt + state.phaseMin * 60_000;
			if (end > now) break;
			const auto = settings.autoStart && state.phase !== 'long_break';
			state = {
				phase: 'focus',
				round: state.round + 1,
				phaseMin: settings.focusMin,
				phaseStartedAt: auto ? end : null,
				session: auto
					? {
							state: 'running',
							startedAt: end,
							pausedMs: 0,
							pausedAt: null,
							durationMin: settings.focusMin
						}
					: null
			};
			if (auto) started.push({ startedAt: end, endedAt: null, durationMin: settings.focusMin });
		}
		changed = true;
	}
	return { run: state, completedCurrentAt, started, changed };
}

/** Start the waiting phase now (pending → started). A focus phase gets a fresh session. */
export function startPendingPhase(
	run: RunClock,
	settings: PomodoroSettings,
	now: number
): Result<RunClock> {
	if (run.phaseStartedAt !== null) return { ok: false, error: 'phaseRunning' };
	if (run.phase === 'focus') {
		const durationMin = settings.focusMin;
		return {
			ok: true,
			value: {
				...run,
				phaseMin: durationMin,
				phaseStartedAt: now,
				session: { state: 'running', startedAt: now, pausedMs: 0, pausedAt: null, durationMin }
			}
		};
	}
	return { ok: true, value: { ...run, phaseStartedAt: now } };
}

/** Skip the (running or waiting) break: the next focus round starts now. */
export function skipBreak(
	run: RunClock,
	settings: PomodoroSettings,
	now: number
): Result<RunClock> {
	if (run.phase === 'focus') return { ok: false, error: 'noBreakToSkip' };
	const durationMin = settings.focusMin;
	return {
		ok: true,
		value: {
			phase: 'focus',
			round: run.round + 1,
			phaseMin: durationMin,
			phaseStartedAt: now,
			session: { state: 'running', startedAt: now, pausedMs: 0, pausedAt: null, durationMin }
		}
	};
}

// ─── Snapshot (server → clients) ────────────────────────────────────────────

export interface TimerTask {
	id: string;
	title: string;
	kind: 'quest' | 'other';
	questId: string | null;
	questName: string | null;
	questColor: string | null;
	durationMin: number | null;
}

export interface TimerSession extends SessionClock {
	id: string;
	source: 'focus' | 'pomodoro' | 'manual';
}

export interface TimerRun {
	id: string;
	phase: PomodoroPhase;
	round: number;
	phaseStartedAt: number | null;
	phaseMin: number;
}

export interface ActiveTimer {
	mode: TimerMode;
	task: TimerTask;
	/** The active session (null during a pomodoro break or a waiting focus phase). */
	session: TimerSession | null;
	/** The active pomodoro run (mode `pomodoro` only). */
	run: TimerRun | null;
}

/** Everything a client needs to render the timer. `now` = server clock when generated. */
export interface TimerSnapshot {
	now: number;
	timer: ActiveTimer | null;
	settings: PomodoroSettings;
}

// ─── View (what to render at a given server time) ───────────────────────────

export type DotState = 'done' | 'current' | 'todo';

export type TimerLabelState = keyof I18n['timer']['states'];
/** Language-neutral state line of a timer view; `round` = position in the pomodoro cycle. */
export interface TimerLabel {
	state: TimerLabelState;
	round?: { n: number; of: number };
}

/** `RUNNING`, `FOCUS · ROUND 2/4`, … in `t`'s language. */
export function timerLabelText(label: TimerLabel, t: I18n): string {
	const state = t.timer.states[label.state];
	return label.round ? `${state} · ${t.timer.round(label.round.n, label.round.of)}` : state;
}

export interface TimerView {
	taskId: string;
	mode: TimerMode;
	/** Pomodoro phase after projecting to `now` (null in focus mode). */
	phase: PomodoroPhase | null;
	/** running = the clock ticks; paused = focus round paused; waiting = pomodoro phase not started. */
	status: 'running' | 'paused' | 'waiting';
	/** Big timer text: remaining (countdown), elapsed (stopwatch) or `+mm:ss` overtime. */
	display: string;
	/** State line: RUNNING, PAUSED, OVERTIME, FOCUS · ROUND 2/4, SHORT BREAK, … (`timerLabelText`). */
	label: TimerLabel;
	overtime: boolean;
	/** 0‥1 share of the current target / phase (0 for a stopwatch). */
	progress: number;
	/** Running time of the focus session (0 in breaks). */
	elapsedMs: number;
	/** In a focus phase / focus mode (pause & resume apply). */
	isFocus: boolean;
	/** Pomodoro cycle dots (empty in focus mode). */
	dots: DotState[];
	/** Server instant when the pomodoro phase rolls over (null = never on its own). */
	nextChangeAt: number | null;
	/**
	 * The shown pomodoro phase was projected past the snapshot's phase — the server hasn't
	 * persisted that rollover yet (clients then ask it to, see the timer store).
	 */
	stale: boolean;
}

/** Seconds → `H:MM:SS` / `MM:SS`. */
export function formatClock(totalSeconds: number): string {
	const t = Math.max(0, Math.floor(totalSeconds));
	const h = Math.floor(t / 3600);
	const m = Math.floor((t % 3600) / 60);
	const s = t % 60;
	const ss = String(s).padStart(2, '0');
	return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}

/** Remaining time shown as a countdown rounds *up* (a fresh 25-min timer shows 25:00). */
const ceilSec = (ms: number) => Math.ceil(Math.max(0, ms) / 1000);
const floorSec = (ms: number) => Math.floor(Math.max(0, ms) / 1000);

/** Convert a snapshot's run + session into the pure {@link RunClock}. */
export function runClockOf(timer: ActiveTimer): RunClock | null {
	if (!timer.run) return null;
	return {
		phase: timer.run.phase,
		round: timer.run.round,
		phaseStartedAt: timer.run.phaseStartedAt,
		phaseMin: timer.run.phaseMin,
		session: timer.session
	};
}

function cycleDots(round: number, every: number, phase: PomodoroPhase): DotState[] {
	const n = Math.max(1, every);
	const inCycle = ((round - 1) % n) + 1;
	return Array.from({ length: n }, (_, i) => {
		const k = i + 1;
		if (k < inCycle) return 'done';
		if (k > inCycle) return 'todo';
		return phase === 'focus' ? 'current' : 'done';
	});
}

/** What to render for `timer` at server time `now` (pomodoro runs are projected forward). */
export function timerView(timer: ActiveTimer, settings: PomodoroSettings, now: number): TimerView {
	const base = { taskId: timer.task.id, mode: timer.mode };
	const run = runClockOf(timer);

	if (!run) {
		const s = timer.session;
		if (!s) {
			return {
				...base,
				phase: null,
				status: 'waiting',
				display: formatClock(0),
				label: { state: 'ready' },
				overtime: false,
				progress: 0,
				elapsedMs: 0,
				isFocus: true,
				dots: [],
				nextChangeAt: null,
				stale: false
			};
		}
		const elapsed = clockElapsedMs(s, now);
		const target = s.durationMin !== null ? s.durationMin * 60_000 : null;
		const overtime = target !== null && elapsed >= target && elapsed - target >= 1000;
		const display =
			target === null
				? formatClock(floorSec(elapsed))
				: overtime
					? `+${formatClock(floorSec(elapsed - target))}`
					: formatClock(ceilSec(target - elapsed));
		return {
			...base,
			phase: null,
			status: s.state,
			display,
			label: { state: s.state === 'paused' ? 'paused' : overtime ? 'overtime' : 'running' },
			overtime,
			progress: target ? Math.min(1, elapsed / target) : 0,
			elapsedMs: elapsed,
			isFocus: true,
			dots: [],
			nextChangeAt: null,
			stale: false
		};
	}

	const rolled = rolloverPomodoro(run, settings, now);
	const projected = rolled.run;
	const every = Math.max(1, settings.longBreakEvery);
	const round = { n: ((projected.round - 1) % every) + 1, of: every };
	const dots = cycleDots(projected.round, every, projected.phase);
	const lengthMs = projected.phaseMin * 60_000;
	const common = { ...base, phase: projected.phase, overtime: false, dots, stale: rolled.changed };

	if (projected.phaseStartedAt === null) {
		return {
			...common,
			status: 'waiting',
			display: formatClock(projected.phaseMin * 60),
			label: projected.phase === 'focus' ? { state: 'ready', round } : { state: 'breakTime' },
			progress: 0,
			elapsedMs: 0,
			isFocus: projected.phase === 'focus',
			nextChangeAt: null
		};
	}
	if (projected.phase === 'focus' && projected.session) {
		const s = projected.session;
		const elapsed = clockElapsedMs(s, now);
		const target = (s.durationMin ?? projected.phaseMin) * 60_000;
		return {
			...common,
			status: s.state,
			display: formatClock(ceilSec(target - elapsed)),
			label: { state: s.state === 'paused' ? 'paused' : 'focus', round },
			progress: Math.min(1, elapsed / target),
			elapsedMs: elapsed,
			isFocus: true,
			nextChangeAt: clockTargetAt(s)
		};
	}
	const elapsed = Math.max(0, now - projected.phaseStartedAt);
	return {
		...common,
		status: 'running',
		display: formatClock(ceilSec(lengthMs - elapsed)),
		label: { state: projected.phase === 'long_break' ? 'longBreak' : 'shortBreak' },
		progress: Math.min(1, elapsed / lengthMs),
		elapsedMs: 0,
		isFocus: false,
		nextChangeAt: projected.phaseStartedAt + lengthMs
	};
}

// ─── Input validation (shared by the JSON API and forms) ────────────────────

/** Planned minutes: '' / null → null (stopwatch); else an integer 1‥1440. */
export function parsePlannedMin(raw: unknown): Result<number | null> {
	if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
	const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
	if (!Number.isInteger(n) || n < 1 || n > MAX_TIMER_MIN)
		return { ok: false, error: 'plannedMinInvalid' };
	return { ok: true, value: n };
}

/** Default countdown for a task: its planned duration, else {@link DEFAULT_FOCUS_MIN}. */
export function defaultPlannedMin(task: { durationMin: number | null }): number {
	return task.durationMin && task.durationMin > 0
		? Math.min(task.durationMin, MAX_TIMER_MIN)
		: DEFAULT_FOCUS_MIN;
}

/** `[min, max]` of each pomodoro setting and its error code. */
export const POMODORO_LIMITS = {
	focusMin: [1, 180, 'pomodoroFocusMin'],
	shortBreakMin: [1, 60, 'pomodoroShortBreakMin'],
	longBreakMin: [1, 120, 'pomodoroLongBreakMin'],
	longBreakEvery: [1, 12, 'pomodoroLongBreakEvery']
} as const;

/** Error codes per field (`parsePomodoroSettings`). */
export type SettingsErrorCodes = Partial<Record<keyof PomodoroSettings, ErrorCode>>;
/** Translated errors per field (form action result). */
export type SettingsErrors = Partial<Record<keyof PomodoroSettings, string>>;

/** Validate pomodoro settings from form/JSON values (`autoStart`: 'on' | '1' | 'true' | true). */
export function parsePomodoroSettings(
	raw: Record<string, unknown>
): { ok: true; value: PomodoroSettings } | { ok: false; errors: SettingsErrorCodes } {
	const errors: SettingsErrorCodes = {};
	const nums: Record<string, number> = {};
	for (const [key, [min, max, code]] of Object.entries(POMODORO_LIMITS)) {
		const v = raw[key];
		const n = typeof v === 'number' ? v : Number(String(v ?? '').trim() || NaN);
		if (!Number.isInteger(n) || n < min || n > max) errors[key as keyof PomodoroSettings] = code;
		else nums[key] = n;
	}
	if (Object.keys(errors).length > 0) return { ok: false, errors };
	const a = raw.autoStart;
	return {
		ok: true,
		value: {
			focusMin: nums.focusMin,
			shortBreakMin: nums.shortBreakMin,
			longBreakMin: nums.longBreakMin,
			longBreakEvery: nums.longBreakEvery,
			autoStart: a === true || a === 'on' || a === '1' || a === 'true'
		}
	};
}

// ─── API commands (`POST /api/timer`) ───────────────────────────────────────

export const SIMPLE_ACTIONS = [
	'pause',
	'resume',
	'complete',
	'stop',
	'discard',
	'startPhase',
	'skip'
] as const;
export type SimpleAction = (typeof SIMPLE_ACTIONS)[number];

export type TimerCommand =
	| {
			action: 'start';
			taskId: string;
			mode: TimerMode;
			/** undefined = task default; null = stopwatch. */
			plannedMin?: number | null;
			replace: boolean;
	  }
	| { action: SimpleAction }
	| { action: 'settings'; settings: PomodoroSettings };

/**
 * Validate a timer command from JSON or form fields. `plannedMin` missing → task default,
 * `''`/null → stopwatch. `replace` accepts true / '1' / 'true' / 'on'.
 */
export function parseTimerCommand(
	raw: Record<string, unknown>
): { ok: true; command: TimerCommand } | { ok: false; error: ErrorCode } {
	const action = raw.action;
	if (action === 'start') {
		const taskId = raw.taskId;
		if (!isUuid(taskId)) return { ok: false, error: 'pickTask' };
		const mode = raw.mode ?? 'focus';
		if (mode !== 'focus' && mode !== 'pomodoro') return { ok: false, error: 'unknownMode' };
		let plannedMin: number | null | undefined;
		if ('plannedMin' in raw && mode === 'focus') {
			const p = parsePlannedMin(raw.plannedMin);
			if (!p.ok) return { ok: false, error: p.error };
			plannedMin = p.value;
		}
		const r = raw.replace;
		return {
			ok: true,
			command: {
				action,
				taskId,
				mode,
				plannedMin,
				replace: r === true || r === '1' || r === 'true' || r === 'on'
			}
		};
	}
	if (action === 'settings') {
		const s = parsePomodoroSettings(
			typeof raw.settings === 'object' && raw.settings !== null
				? (raw.settings as Record<string, unknown>)
				: raw
		);
		if (!s.ok) return { ok: false, error: Object.values(s.errors)[0] ?? 'invalidBody' };
		return { ok: true, command: { action, settings: s.value } };
	}
	if (typeof action === 'string' && (SIMPLE_ACTIONS as readonly string[]).includes(action))
		return { ok: true, command: { action: action as SimpleAction } };
	return { ok: false, error: 'unknownTimerAction' };
}
