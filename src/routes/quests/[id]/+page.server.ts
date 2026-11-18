import { error, fail } from '@sveltejs/kit';
import { isUuid } from '#lib/ids.ts';
import { getQuest } from '#lib/server/quests.ts';
import {
	createTask,
	deleteTask,
	getTask,
	listQuestBacklog,
	listQuestScheduled,
	moveTask,
	setTaskDone
} from '#lib/server/tasks.ts';
import { parseTaskDuration, validateTaskTitle } from '#lib/task-form.ts';
import type { Actions, PageServerLoad } from './$types';

async function loadQuest(id: string) {
	if (!isUuid(id)) error(404, 'Quest not found');
	const quest = await getQuest(id);
	if (!quest) error(404, 'Quest not found');
	return quest;
}

export const load: PageServerLoad = async ({ params }) => {
	const quest = await loadQuest(params.id);
	const [backlog, scheduled] = await Promise.all([
		listQuestBacklog(quest.id),
		listQuestScheduled(quest.id)
	]);
	return { quest, backlog, scheduled };
};

/** Resolve the task for a task action and ensure it belongs to this quest. */
async function loadOwnTask(taskId: string, questId: string) {
	if (!isUuid(taskId)) return undefined;
	const task = await getTask(taskId);
	if (!task || task.questId !== questId) return undefined;
	return task;
}

export const actions = {
	add: async ({ params, request }) => {
		const quest = await loadQuest(params.id);
		const formData = await request.formData();
		const rawTitle = String(formData.get('title') ?? '');
		const rawDuration = String(formData.get('duration') ?? '');
		const echo = { intent: 'add', ok: false as const, title: rawTitle, duration: rawDuration };

		const title = validateTaskTitle(rawTitle);
		const duration = parseTaskDuration(rawDuration);
		if (!title.ok || !duration.ok) {
			return fail(400, {
				...echo,
				errors: {
					title: title.ok ? undefined : title.error,
					duration: duration.ok ? undefined : duration.error
				}
			});
		}

		const task = await createTask(
			{ kind: 'quest', questId: quest.id },
			{ title: title.title, durationMin: duration.minutes }
		);
		return { intent: 'add', ok: true, taskId: task.id };
	},

	toggle: async ({ params, request }) => {
		const questId = params.id;
		const task = await loadOwnTask(String((await request.formData()).get('taskId') ?? ''), questId);
		if (task) await setTaskDone(task.id, task.doneAt === null);
		return { intent: 'toggle', ok: true, taskId: task?.id };
	},

	delete: async ({ params, request }) => {
		const questId = params.id;
		const task = await loadOwnTask(String((await request.formData()).get('taskId') ?? ''), questId);
		if (task) await deleteTask(task.id);
		return { intent: 'delete', ok: true, taskId: task?.id };
	},

	moveUp: async ({ params, request }) => {
		const questId = params.id;
		const task = await loadOwnTask(String((await request.formData()).get('taskId') ?? ''), questId);
		if (task) await moveTask(task.id, 'up');
		return { intent: 'moveUp', ok: true, taskId: task?.id };
	},

	moveDown: async ({ params, request }) => {
		const questId = params.id;
		const task = await loadOwnTask(String((await request.formData()).get('taskId') ?? ''), questId);
		if (task) await moveTask(task.id, 'down');
		return { intent: 'moveDown', ok: true, taskId: task?.id };
	}
} satisfies Actions;
