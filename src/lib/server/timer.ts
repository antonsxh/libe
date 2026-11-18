/**
 * Server-side focus timer — the single source of truth.
 *
 * State lives in the DB: the active session (`sessions.state` running|paused, at most one —
 * enforced by a partial unique index) and, in pomodoro mode, the active `pomodoro_runs` row.
 * Every operation runs in a transaction that locks those rows, first rolls a pomodoro run
 * forward to `now` (lazily, from timestamps — see `rolloverPomodoro`), then validates the
 * transition against the current state using server timestamps. After each change the fresh
 * snapshot is published to all SSE subscribers (`timer-hub.ts`).
 */
import { and, eq, isNull, ne } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import {
	pomodoroRuns,
	quests,
	sessions,
	tasks,
	type PomodoroRun,
	type Session
} from '#lib/server/db/schema.ts';
import { getPomodoroSettings, savePomodoroSettings } from '#lib/server/settings.ts';
import { publishTimer } from '#lib/server/timer-hub.ts';
import {
	defaultPlannedMin,
	finishClock,
	pauseClock,
	resumeClock,
	rolloverPomodoro,
	skipBreak,
	startPendingPhase,
	type ActiveTimer,
	type PomodoroSettings,
	type Result,
	type RunClock,
	type SessionClock,
	type TimerMode,
	type TimerSnapshot
} from '#lib/timer.ts';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type TimerErrorCode = 'conflict' | 'invalid' | 'not_found';

/** A rejected timer operation; `code` maps to the HTTP status of `/api/timer`. */
export class TimerError extends Error {
	constructor(
		readonly code: TimerErrorCode,
		message: string
	) {
		super(message);
	}
}

interface ActiveRows {
	run: PomodoroRun | null;
	session: Session | null;
}

const ms = (d: Date | null) => (d ? d.getTime() : null);

function clockOf(s: Session): SessionClock {
	return {
		state: s.state === 'paused' ? 'paused' : 'running',
		startedAt: s.startedAt.getTime(),
		pausedMs: s.pausedMs,
		pausedAt: ms(s.pausedAt),
		durationMin: s.durationMin
	};
}

function runClockOf(run: PomodoroRun, session: Session | null): RunClock {
	return {
		phase: run.phase,
		round: run.round,
		phaseStartedAt: ms(run.phaseStartedAt),
		phaseMin: run.phaseMin,
		session: run.phase === 'focus' && run.phaseStartedAt && session ? clockOf(session) : null
	};
}

async function lockActive(tx: Tx): Promise<ActiveRows> {
	const [run] = await tx
		.select()
		.from(pomodoroRuns)
		.where(isNull(pomodoroRuns.endedAt))
		.for('update');
	const [session] = await tx
		.select()
		.from(sessions)
		.where(ne(sessions.state, 'completed'))
		.for('update');
	return { run: run ?? null, session: session ?? null };
}

/** Persist a pomodoro run's (new) clock: run row + its focus session. */
async function writeRun(
	tx: Tx,
	run: PomodoroRun,
	current: Session | null,
	next: RunClock,
	newSession: boolean
): Promise<void> {
	if (newSession && next.session) {
		await tx.insert(sessions).values({
			taskId: run.taskId,
			state: 'running',
			startedAt: new Date(next.session.startedAt),
			durationMin: next.session.durationMin,
			source: 'pomodoro'
		});
	} else if (current && next.session) {
		await tx
			.update(sessions)
			.set({
				state: next.session.state,
				pausedMs: next.session.pausedMs,
				pausedAt: next.session.pausedAt === null ? null : new Date(next.session.pausedAt)
			})
			.where(eq(sessions.id, current.id));
	}
	await tx
		.update(pomodoroRuns)
		.set({
			phase: next.phase,
			round: next.round,
			phaseStartedAt: next.phaseStartedAt === null ? null : new Date(next.phaseStartedAt),
			phaseMin: next.phaseMin
		})
		.where(eq(pomodoroRuns.id, run.id));
}

/**
 * Lock the active rows and roll an active pomodoro run forward to `now`: completes the focus
 * round's session at its exact end, inserts auto-started rounds and moves the run's phase.
 */
async function materialize(
	tx: Tx,
	now: number,
	settings: PomodoroSettings
): Promise<ActiveRows & { changed: boolean }> {
	const rows = await lockActive(tx);
	if (!rows.run) return { ...rows, changed: false };
	const result = rolloverPomodoro(runClockOf(rows.run, rows.session), settings, now);
	if (!result.changed) return { ...rows, changed: false };

	if (result.completedCurrentAt !== null && rows.session) {
		const end = result.completedCurrentAt;
		await tx
			.update(sessions)
			.set({ state: 'completed', endedAt: new Date(end), pausedAt: null })
			.where(eq(sessions.id, rows.session.id));
	}
	for (const round of result.started) {
		await tx.insert(sessions).values({
			taskId: rows.run.taskId,
			state: round.endedAt === null ? 'running' : 'completed',
			startedAt: new Date(round.startedAt),
			endedAt: round.endedAt === null ? null : new Date(round.endedAt),
			durationMin: round.durationMin,
			source: 'pomodoro'
		});
	}
	await writeRun(tx, rows.run, null, { ...result.run, session: null }, false);
	return { ...(await lockActive(tx)), changed: true };
}

async function buildTimer(tx: Tx, rows: ActiveRows): Promise<ActiveTimer | null> {
	const taskId = rows.run?.taskId ?? rows.session?.taskId;
	if (!taskId) return null;
	const [row] = await tx
		.select({ task: tasks, questName: quests.name, questColor: quests.color })
		.from(tasks)
		.leftJoin(quests, eq(quests.id, tasks.questId))
		.where(eq(tasks.id, taskId));
	if (!row) return null;
	const mode: TimerMode = rows.run ? 'pomodoro' : 'focus';
	const s = rows.session;
	return {
		mode,
		task: {
			id: row.task.id,
			title: row.task.title,
			kind: row.task.kind,
			questId: row.task.questId,
			questName: row.questName,
			questColor: row.questColor,
			durationMin: row.task.durationMin
		},
		session: s ? { ...clockOf(s), id: s.id, source: s.source } : null,
		run: rows.run
			? {
					id: rows.run.id,
					phase: rows.run.phase,
					round: rows.run.round,
					phaseStartedAt: ms(rows.run.phaseStartedAt),
					phaseMin: rows.run.phaseMin
				}
			: null
	};
}

/**
 * The current timer, rolled forward to now. Publishes to SSE subscribers when the read
 * itself changed state (a pomodoro phase ended since the last read).
 */
export async function getTimerSnapshot(): Promise<TimerSnapshot> {
	const now = Date.now();
	const { snapshot, changed } = await db.transaction(async (tx) => {
		const settings = await getPomodoroSettings(tx);
		const rows = await materialize(tx, now, settings);
		return {
			snapshot: { now, timer: await buildTimer(tx, rows), settings },
			changed: rows.changed
		};
	});
	if (changed) publishTimer(snapshot);
	return snapshot;
}

/** Read the fresh snapshot after a mutation and push it to every subscriber. */
export async function broadcastTimer(): Promise<TimerSnapshot> {
	const snapshot = await getTimerSnapshot();
	publishTimer(snapshot);
	return snapshot;
}

/** Run a timer mutation against the locked, rolled-forward state, then broadcast. */
async function mutate(
	fn: (tx: Tx, ctx: { rows: ActiveRows; now: number; settings: PomodoroSettings }) => Promise<void>
): Promise<TimerSnapshot> {
	try {
		await db.transaction(async (tx) => {
			const now = Date.now();
			const settings = await getPomodoroSettings(tx);
			const rows = await materialize(tx, now, settings);
			await fn(tx, { rows, now, settings });
		});
	} catch (err) {
		// Two concurrent starts: the partial unique index rejects the second one.
		const e = err as { message?: string; cause?: { message?: string } } | null;
		if (!(err instanceof TimerError) && /one_active_idx/.test(`${e?.message} ${e?.cause?.message}`))
			throw new TimerError('conflict', 'Another timer is already active.');
		throw err;
	}
	return broadcastTimer();
}

function must<T>(r: Result<T>): T {
	if (!r.ok) throw new TimerError('invalid', r.error);
	return r.value;
}

/** End whatever is active: the session is logged as completed (or deleted), the run ends. */
async function endActive(
	tx: Tx,
	rows: ActiveRows,
	now: number,
	how: 'keep' | 'discard'
): Promise<string | null> {
	const taskId = rows.run?.taskId ?? rows.session?.taskId ?? null;
	if (rows.session) {
		if (how === 'discard') {
			await tx.delete(sessions).where(eq(sessions.id, rows.session.id));
		} else {
			const fin = must(finishClock(clockOf(rows.session), now));
			await tx
				.update(sessions)
				.set({
					state: 'completed',
					endedAt: new Date(fin.endedAt),
					pausedMs: fin.pausedMs,
					pausedAt: null
				})
				.where(eq(sessions.id, rows.session.id));
		}
	}
	if (rows.run) {
		await tx
			.update(pomodoroRuns)
			.set({ endedAt: new Date(now) })
			.where(eq(pomodoroRuns.id, rows.run.id));
	}
	return taskId;
}

export interface StartInput {
	taskId: string;
	mode: TimerMode;
	/** undefined = the task's planned duration (else 25); null = open-ended stopwatch. */
	plannedMin?: number | null;
	/** Stop the active timer (keeping its time) instead of rejecting with `conflict`. */
	replace?: boolean;
}

export async function startTimer(input: StartInput): Promise<TimerSnapshot> {
	return mutate(async (tx, { rows, now, settings }) => {
		const [task] = await tx.select().from(tasks).where(eq(tasks.id, input.taskId));
		if (!task) throw new TimerError('not_found', 'Task not found.');
		if (rows.run || rows.session) {
			if (!input.replace) throw new TimerError('conflict', 'Another timer is already active.');
			await endActive(tx, rows, now, 'keep');
		}
		const startedAt = new Date(now);
		if (input.mode === 'pomodoro') {
			await tx.insert(pomodoroRuns).values({
				taskId: task.id,
				phase: 'focus',
				round: 1,
				phaseStartedAt: startedAt,
				phaseMin: settings.focusMin
			});
			await tx.insert(sessions).values({
				taskId: task.id,
				state: 'running',
				startedAt,
				durationMin: settings.focusMin,
				source: 'pomodoro'
			});
		} else {
			await tx.insert(sessions).values({
				taskId: task.id,
				state: 'running',
				startedAt,
				durationMin: input.plannedMin === undefined ? defaultPlannedMin(task) : input.plannedMin,
				source: 'focus'
			});
		}
	});
}

export async function pauseTimer(): Promise<TimerSnapshot> {
	return mutate(async (tx, { rows, now }) => {
		if (!rows.session) throw new TimerError('invalid', 'Nothing to pause.');
		const next = must(pauseClock(clockOf(rows.session), now));
		await tx
			.update(sessions)
			.set({ state: 'paused', pausedAt: new Date(next.pausedAt ?? now) })
			.where(eq(sessions.id, rows.session.id));
	});
}

export async function resumeTimer(): Promise<TimerSnapshot> {
	return mutate(async (tx, { rows, now }) => {
		if (!rows.session) throw new TimerError('invalid', 'Nothing to resume.');
		const next = must(resumeClock(clockOf(rows.session), now));
		await tx
			.update(sessions)
			.set({ state: 'running', pausedAt: null, pausedMs: next.pausedMs })
			.where(eq(sessions.id, rows.session.id));
	});
}

/** End the session (logged) and mark the task done. */
export async function completeTimer(): Promise<TimerSnapshot> {
	return mutate(async (tx, { rows, now }) => {
		if (!rows.run && !rows.session) throw new TimerError('invalid', 'No active timer.');
		const taskId = await endActive(tx, rows, now, 'keep');
		if (taskId)
			await tx
				.update(tasks)
				.set({ doneAt: new Date(now) })
				.where(and(eq(tasks.id, taskId), isNull(tasks.doneAt)));
	});
}

/** End the session (logged); the task stays open. */
export async function stopTimer(): Promise<TimerSnapshot> {
	return mutate(async (tx, { rows, now }) => {
		if (!rows.run && !rows.session) throw new TimerError('invalid', 'No active timer.');
		await endActive(tx, rows, now, 'keep');
	});
}

/** Throw the active session away (nothing logged); a pomodoro run ends. */
export async function discardTimer(): Promise<TimerSnapshot> {
	return mutate(async (tx, { rows, now }) => {
		if (!rows.run && !rows.session) throw new TimerError('invalid', 'No active timer.');
		await endActive(tx, rows, now, 'discard');
	});
}

/** Pomodoro: start the waiting phase (break or next focus round) now. */
export async function startPhase(): Promise<TimerSnapshot> {
	return mutate(async (tx, { rows, now, settings }) => {
		if (!rows.run) throw new TimerError('invalid', 'No pomodoro is running.');
		const next = must(startPendingPhase(runClockOf(rows.run, rows.session), settings, now));
		await writeRun(tx, rows.run, rows.session, next, next.phase === 'focus');
	});
}

/** Pomodoro: skip the current/waiting break — the next focus round starts now. */
export async function skipPhase(): Promise<TimerSnapshot> {
	return mutate(async (tx, { rows, now, settings }) => {
		if (!rows.run) throw new TimerError('invalid', 'No pomodoro is running.');
		const next = must(skipBreak(runClockOf(rows.run, rows.session), settings, now));
		await writeRun(tx, rows.run, null, next, true);
	});
}

/**
 * Save pomodoro settings. The active run is rolled forward with the *old* intervals first;
 * the new ones apply from its next phase (the current phase keeps its length).
 */
export async function updatePomodoroSettings(value: PomodoroSettings): Promise<TimerSnapshot> {
	return mutate(async (tx) => {
		await savePomodoroSettings(value, tx);
	});
}

/** The active session's span `[startedAt, now)` (for manual-log overlap checks). */
export async function activeSessionSpan(): Promise<{ start: Date; end: Date } | null> {
	const snap = await getTimerSnapshot();
	const s = snap.timer?.session;
	return s ? { start: new Date(s.startedAt), end: new Date(snap.now) } : null;
}
