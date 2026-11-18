import { error, json } from '@sveltejs/kit';
import { isUuid } from '#lib/ids.ts';
import { deleteLoggedSession } from '#lib/server/sessions.ts';
import type { RequestHandler } from './$types';

/** Delete a completed (logged) session; active ones are ended through `/api/timer`. */
export const DELETE: RequestHandler = async ({ params }) => {
	if (!isUuid(params.id)) error(400, 'Invalid id.');
	if (!(await deleteLoggedSession(params.id))) error(404, 'Session not found.');
	return json({ ok: true });
};
