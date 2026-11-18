import { error, json } from '@sveltejs/kit';
import { isUuid } from '#lib/ids.ts';
import { validateSessionSpan } from '#lib/manual-log.ts';
import {
	deleteLoggedSession,
	getLoggedSession,
	updateLoggedSession
} from '#lib/server/sessions.ts';
import { getTask } from '#lib/server/tasks.ts';
import { activeSessionSpan } from '#lib/server/timer.ts';
import type { RequestHandler } from './$types';

/**
 * Edit a completed session (calendar): `{ taskId, day, start: 'HH:MM', endDay, end: 'HH:MM' }`
 * in server `TZ`. Same rules as a manual log (`validateSessionSpan`): end after start, ≤ 24 h,
 * not in the future, ≤ 365 days back, no overlap with the active session; the task must exist.
 * 400 `{ ok: false, errors }`, 404 when the session is unknown or active.
 */
export const PATCH: RequestHandler = async ({ params, request }) => {
	if (!isUuid(params.id)) error(400, 'Invalid id.');
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		error(400, 'Invalid JSON.');
	}
	const session = await getLoggedSession(params.id);
	if (!session) error(404, 'Session not found.');

	const taskId = body?.taskId;
	const task = isUuid(taskId) ? await getTask(taskId) : undefined;
	if (!task) return json({ ok: false, errors: { task: 'Task not found.' } }, { status: 400 });

	const result = validateSessionSpan(
		{ day: body.day, start: body.start, endDay: body.endDay, end: body.end },
		{ now: new Date(), active: await activeSessionSpan(), original: session }
	);
	if (!result.ok) return json({ ok: false, errors: result.errors }, { status: 400 });

	if (!(await updateLoggedSession(session.id, { taskId: task.id, ...result })))
		error(404, 'Session not found.');
	return json({ ok: true });
};

/** Delete a completed (logged) session; active ones are ended through `/api/timer`. */
export const DELETE: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) error(400, 'Invalid id.');
	if (!(await deleteLoggedSession(params.id))) error(404, 'Session not found.');
	return json({ ok: true });
};
