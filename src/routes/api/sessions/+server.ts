import { error, json } from '@sveltejs/kit';
import { isISODay, todayISO } from '#lib/dates.ts';
import { isUuid } from '#lib/ids.ts';
import { validateManualLog, validateSessionSpan } from '#lib/manual-log.ts';
import { createManualSession, listTaskSessionsOnDay } from '#lib/server/sessions.ts';
import { getTask, setTaskDone } from '#lib/server/tasks.ts';
import { activeSessionSpan } from '#lib/server/timer.ts';
import { i18n } from '#lib/i18n/index.ts';
import { translateErrors } from '#lib/server/errors.ts';
import type { RequestHandler } from './$types';

/** `?taskId=&day=` → that task's completed sessions starting on `day` (server TZ). */
export const GET: RequestHandler = async ({ url, locals }) => {
	const taskId = url.searchParams.get('taskId');
	const day = url.searchParams.get('day') ?? todayISO();
	if (!isUuid(taskId) || !isISODay(day)) error(400, i18n(locals.locale).errors.taskAndDayRequired);
	return json({ sessions: await listTaskSessionsOnDay(taskId, day) });
};

/**
 * Log time afterwards → a completed `manual` session. Two body shapes:
 * - `{ taskId, day, start: 'HH:MM', durationMin, markDone? }` (Log-time dialog, `validateManualLog`)
 * - `{ taskId, day, start, endDay, end: 'HH:MM' }` (calendar, explicit end, `validateSessionSpan`)
 * 400 `{ ok: false, errors }` on invalid input.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const t = i18n(locals.locale);
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		error(400, t.errors.invalidJson);
	}
	const taskId = body?.taskId;
	const task = isUuid(taskId) ? await getTask(taskId) : undefined;
	if (!task) return json({ ok: false, errors: { task: t.errors.taskNotFound } }, { status: 400 });

	const ctx = { now: new Date(), active: await activeSessionSpan() };
	const result =
		body.end !== undefined
			? validateSessionSpan(
					{ day: body.day, start: body.start, endDay: body.endDay, end: body.end },
					ctx
				)
			: validateManualLog({ day: body.day, start: body.start, durationMin: body.durationMin }, ctx);
	if (!result.ok)
		return json({ ok: false, errors: translateErrors(result.errors, t) }, { status: 400 });

	const id = await createManualSession({ taskId: task.id, ...result });
	if (body.markDone === true && task.doneAt === null) await setTaskDone(task.id, true);
	return json({ ok: true, id });
};
