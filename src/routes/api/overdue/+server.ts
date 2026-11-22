import { error, json } from '@sveltejs/kit';
import { todayISO } from '#lib/dates.ts';
import { overdueTargetDay, parseOverdueSelection, parseOverdueTarget } from '#lib/overdue.ts';
import { rescheduleOverdue } from '#lib/server/tasks.ts';
import { i18n } from '#lib/i18n/index.ts';
import type { RequestHandler } from './$types';

/**
 * Reschedule overdue tasks — the command palette's "Move overdue tasks to today" (pages use the
 * shared `overdueTo` form action; both end in `rescheduleOverdue`). Body:
 * `{ to: 'today' | 'tomorrow', all: true }` or `{ to, taskIds: [uuid, …] }` → `{ moved }`.
 * 400 on anything else.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const t = i18n(locals.locale);
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		error(400, t.errors.invalidJson);
	}
	const to = parseOverdueTarget(body?.to);
	const ids = body?.taskIds ?? [];
	const selection = Array.isArray(ids) ? parseOverdueSelection(body.all === true, ids) : null;
	if (!to || !selection) error(400, t.errors.invalidBody);
	const today = todayISO();
	const moved = await rescheduleOverdue(selection, overdueTargetDay(to, today), today);
	return json({ moved });
};
