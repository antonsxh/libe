import { error, json, redirect } from '@sveltejs/kit';
import {
	completeTimer,
	discardTimer,
	getTimerSnapshot,
	pauseTimer,
	resumeTimer,
	skipPhase,
	startPhase,
	startTimer,
	stopTimer,
	TimerError,
	updatePomodoroSettings
} from '#lib/server/timer.ts';
import { parseTimerCommand, type TimerCommand, type TimerSnapshot } from '#lib/timer.ts';
import type { RequestHandler } from './$types';

/** The current timer snapshot (rolled forward to now — also publishes a phase change). */
export const GET: RequestHandler = async () => json(await getTimerSnapshot());

function run(command: TimerCommand): Promise<TimerSnapshot> {
	switch (command.action) {
		case 'start':
			return startTimer(command);
		case 'pause':
			return pauseTimer();
		case 'resume':
			return resumeTimer();
		case 'complete':
			return completeTimer();
		case 'stop':
			return stopTimer();
		case 'discard':
			return discardTimer();
		case 'startPhase':
			return startPhase();
		case 'skip':
			return skipPhase();
		case 'settings':
			return updatePomodoroSettings(command.settings);
	}
}

const STATUS = { conflict: 409, invalid: 400, not_found: 404 } as const;

/** Local path to land on after a no-JS form post (`redirectTo` field), default `/focus`. */
function landing(raw: unknown): string {
	return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/focus';
}

/**
 * Timer mutations: JSON `{ action, … }` (web client, future Tauri shell) → `{ ok, snapshot }`
 * or `{ ok: false, code, error }` with 400/404/409. Plain HTML form posts (no JS) are
 * accepted too and answered with a 303 back to `redirectTo` (errors in `?timerError=`).
 */
export const POST: RequestHandler = async ({ request }) => {
	const type = request.headers.get('content-type') ?? '';
	const isForm =
		type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data');
	let raw: Record<string, unknown>;
	try {
		raw = isForm
			? Object.fromEntries(await request.formData())
			: ((await request.json()) as Record<string, unknown>);
	} catch {
		error(400, 'Invalid request body.');
	}
	if (typeof raw !== 'object' || raw === null) error(400, 'Invalid request body.');

	const parsed = parseTimerCommand(raw);
	let failure: { status: number; code: string; error: string } | null = null;
	let snapshot: TimerSnapshot | null = null;
	if (!parsed.ok) {
		failure = { status: 400, code: 'invalid', error: parsed.error };
	} else {
		try {
			snapshot = await run(parsed.command);
		} catch (err) {
			if (!(err instanceof TimerError)) throw err;
			failure = { status: STATUS[err.code], code: err.code, error: err.message };
		}
	}

	if (isForm) {
		const to = landing(raw.redirectTo);
		if (!failure) redirect(303, to);
		const sep = to.includes('?') ? '&' : '?';
		redirect(303, `${to}${sep}timerError=${encodeURIComponent(failure.error)}`);
	}
	if (failure) return json({ ok: false, ...failure }, { status: failure.status });
	return json({ ok: true, snapshot });
};
