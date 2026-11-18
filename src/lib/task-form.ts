/**
 * Task form contract shared by task inputs (client) and form actions (server).
 * Plain validation, no library. Generic enough for backlog, day and "other" lists.
 */

export const TASK_TITLE_MAX = 200;
/** A task's planned duration may not exceed a day. */
export const TASK_DURATION_MAX_MIN = 1440;

/** Shape returned by task form actions (merged into `data.form`). */
export interface TaskFormResult {
	ok?: boolean;
	intent?: string;
	taskId?: string;
	errors?: { title?: string; duration?: string };
	title?: string;
	duration?: string;
}

export function validateTaskTitle(
	raw: string
): { ok: true; title: string } | { ok: false; error: string } {
	const title = raw.trim();
	if (!title) return { ok: false, error: 'Write what needs to be done.' };
	if (title.length > TASK_TITLE_MAX)
		return { ok: false, error: `Keep the title to at most ${TASK_TITLE_MAX} characters.` };
	return { ok: true, title };
}

/** Empty → null; otherwise a whole number of minutes, `0 < x ≤ 1440`. */
export function parseTaskDuration(
	raw: string
): { ok: true; minutes: number | null } | { ok: false; error: string } {
	const s = raw.trim();
	if (s === '') return { ok: true, minutes: null };
	const n = Number(s);
	if (!Number.isInteger(n) || n <= 0 || n > TASK_DURATION_MAX_MIN)
		return {
			ok: false,
			error: `Duration must be a whole number of minutes between 1 and ${TASK_DURATION_MAX_MIN}.`
		};
	return { ok: true, minutes: n };
}
