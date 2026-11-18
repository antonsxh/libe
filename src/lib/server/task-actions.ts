/**
 * Form-action helpers shared by the Home (`/`) and Plan (`/plan`) task lists:
 * simple id-based mutations (toggle, ↑/↓, backlog, delete) and a factory for the
 * "add task" actions so both pages validate and echo input the same way.
 */
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { isUuid } from '#lib/ids.ts';
import { db } from '#lib/server/db/index.ts';
import { quests } from '#lib/server/db/schema.ts';
import {
	createTask,
	deleteTask,
	getTask,
	moveTask,
	moveTaskToDay,
	setTaskDone,
	type TaskTarget
} from '#lib/server/tasks.ts';
import { parseTaskDuration, validateTaskTitle } from '#lib/task-form.ts';

export function formStr(form: FormData, name: string): string {
	return String(form.get(name) ?? '');
}

/** Echo the submitted values on failure so the form can re-show them. */
export function taskEcho(action: string, form: FormData) {
	return {
		ok: false as const,
		intent: action,
		title: formStr(form, 'title'),
		duration: formStr(form, 'duration'),
		// Empty string fields become undefined so add-form echoes can match their column.
		day: formStr(form, 'day') || undefined,
		questId: formStr(form, 'questId') || undefined
	};
}

/** Read and UUID-validate the `taskId` field of a request. */
export async function taskIdFrom(request: Request): Promise<string | null> {
	const raw = formStr(await request.formData(), 'taskId');
	return isUuid(raw) ? raw : null;
}

/** `questId` must be a UUID of an existing quest (Home's quest add rows). */
export async function requireQuestTarget(
	questId: string
): Promise<{ ok: true; target: TaskTarget } | { ok: false; error: string }> {
	if (!isUuid(questId)) return { ok: false, error: 'Pick a quest.' };
	const quest = await db.query.quests.findFirst({ where: eq(quests.id, questId) });
	return quest
		? { ok: true, target: { kind: 'quest', questId } }
		: { ok: false, error: 'Quest not found.' };
}

/** Like {@link requireQuestTarget}, but `'other'`/empty selects kind `other` (Plan picker). */
export async function optionalQuestTarget(
	questId: string
): Promise<{ ok: true; target: TaskTarget } | { ok: false; error: string }> {
	if (questId === '' || questId === 'other') return { ok: true, target: { kind: 'other' } };
	return requireQuestTarget(questId);
}

/** Validated add target; `day` null = backlog. Returned by the `resolve` callback. */
export type AddResolution =
	| { ok: true; target: TaskTarget; day: string | null }
	| { ok: false; errors: { title?: string; duration?: string } };

/**
 * Build an "add task" action: validates title/duration and the `pos` field (top|bottom),
 * then delegates target/day resolution (page-specific) and inserts via `createTask`.
 */
export function addTaskAction(
	intent: string,
	resolve: (form: FormData) => AddResolution | Promise<AddResolution>
) {
	return async ({ request }: { request: Request }) => {
		const form = await request.formData();
		const echo = taskEcho(intent, form);
		const title = validateTaskTitle(formStr(form, 'title'));
		const duration = parseTaskDuration(formStr(form, 'duration'));
		if (!title.ok || !duration.ok)
			return fail(400, {
				...echo,
				errors: {
					title: title.ok ? undefined : title.error,
					duration: duration.ok ? undefined : duration.error
				}
			});
		const res = await resolve(form);
		if (!res.ok) return fail(400, { ...echo, errors: res.errors });
		await createTask(
			res.target,
			{ title: title.title, durationMin: duration.minutes, day: res.day },
			form.get('pos') === 'top' ? 'top' : 'bottom'
		);
	};
}

export async function toggleTaskAction({ request }: { request: Request }) {
	const id = await taskIdFrom(request);
	const task = id ? await getTask(id) : undefined;
	if (task) await setTaskDone(task.id, task.doneAt === null);
}

export async function moveUpTaskAction({ request }: { request: Request }) {
	const id = await taskIdFrom(request);
	if (id) await moveTask(id, 'up');
}

export async function moveDownTaskAction({ request }: { request: Request }) {
	const id = await taskIdFrom(request);
	if (id) await moveTask(id, 'down');
}

export async function toBacklogTaskAction({ request }: { request: Request }) {
	const id = await taskIdFrom(request);
	if (id) await moveTaskToDay(id, null);
}

export async function deleteTaskAction({ request }: { request: Request }) {
	const id = await taskIdFrom(request);
	if (id) await deleteTask(id);
}

/** Actions with identical behaviour on every task list page. */
export const sharedTaskActions = {
	toggle: toggleTaskAction,
	moveUp: moveUpTaskAction,
	moveDown: moveDownTaskAction,
	toBacklog: toBacklogTaskAction,
	deleteTask: deleteTaskAction
};
