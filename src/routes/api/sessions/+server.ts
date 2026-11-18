import { error, json } from '@sveltejs/kit';
import { isISODay, todayISO } from '#lib/dates.ts';
import { isUuid } from '#lib/ids.ts';
import { validateManualLog } from '#lib/manual-log.ts';
import { createManualSession, listTaskSessionsOnDay } from '#lib/server/sessions.ts';
import { getTask, setTaskDone } from '#lib/server/tasks.ts';
import { activeSessionSpan } from '#lib/server/timer.ts';
import type { RequestHandler } from './$types';

/** `?taskId=&day=` → that task's completed sessions starting on `day` (server TZ). */
export const GET: RequestHandler = async ({ url }) => {
	const taskId = url.searchParams.get('taskId');
	const day = url.searchParams.get('day') ?? todayISO();
	if (!isUuid(taskId) || !isISODay(day)) error(400, 'taskId and day are required.');
	return json({ sessions: await listTaskSessionsOnDay(taskId, day) });
};

/**
 * Log time afterwards: `{ taskId, day, start: 'HH:MM', durationMin, markDone? }` → a completed
 * `manual` session. 400 `{ ok: false, errors }` on invalid input (see `validateManualLog`).
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		error(400, 'Invalid JSON.');
	}
	const taskId = body?.taskId;
	const task = isUuid(taskId) ? await getTask(taskId) : undefined;
	if (!task) return json({ ok: false, errors: { task: 'Task not found.' } }, { status: 400 });

	const result = validateManualLog(
		{ day: body.day, start: body.start, durationMin: body.durationMin },
		{ now: new Date(), active: await activeSessionSpan() }
	);
	if (!result.ok) return json({ ok: false, errors: result.errors }, { status: 400 });

	const id = await createManualSession({ taskId: task.id, ...result });
	if (body.markDone === true && task.doneAt === null) await setTaskDone(task.id, true);
	return json({ ok: true, id });
};
