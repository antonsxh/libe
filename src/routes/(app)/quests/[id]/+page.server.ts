import { error } from '@sveltejs/kit';
import { addDays, todayISO } from '#lib/dates.ts';
import { isUuid } from '#lib/ids.ts';
import { questSummary } from '#lib/quest-detail.ts';
import { getQuest } from '#lib/server/quests.ts';
import { updateQuestAction } from '#lib/server/quest-actions.ts';
import { questDetailTime } from '#lib/server/stats.ts';
import { addTaskAction, formStr } from '#lib/server/task-actions.ts';
import {
	deleteTask,
	getTask,
	listQuestBacklog,
	listQuestScheduled,
	moveTask,
	moveTaskToDay,
	setTaskDone
} from '#lib/server/tasks.ts';
import type { Task } from '#lib/server/db/schema.ts';
import { i18n, type Locale } from '#lib/i18n/index.ts';
import type { Actions, PageServerLoad } from './$types';

async function loadQuest(id: string, locale: Locale) {
	if (!isUuid(id)) error(404, i18n(locale).quests.notFound);
	const quest = await getQuest(id);
	if (!quest) error(404, i18n(locale).quests.notFound);
	return quest;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const quest = await loadQuest(params.id, locals.locale);
	const [backlog, scheduled, time] = await Promise.all([
		listQuestBacklog(quest.id),
		listQuestScheduled(quest.id),
		questDetailTime(quest.id)
	]);
	const summary = questSummary({
		weekH: time.weekH,
		quarterH: time.quarterH,
		weeklyBudgetH: quest.weeklyBudgetH,
		closed: quest.closedAt !== null,
		today: todayISO()
	});
	return { quest, backlog, scheduled, summary, loggedMs: time.byTaskMs };
};

/** The `taskId` of a task action, if it names a task of this quest. */
async function ownTask(request: Request, questId: string): Promise<Task | undefined> {
	const id = formStr(await request.formData(), 'taskId');
	if (!isUuid(id)) return undefined;
	const task = await getTask(id);
	return task?.questId === questId ? task : undefined;
}

type TaskEvent = { params: { id: string }; request: Request };

/** A row action on one of this quest's tasks (other ids are ignored). */
function taskAction(run: (task: Task) => Promise<void>) {
	return async ({ params, request }: TaskEvent) => {
		const task = await ownTask(request, params.id);
		if (task) await run(task);
	};
}

export const actions = {
	/** The backlog's add row: Enter / Add at the bottom, Shift+Enter at the top. */
	add: async (event) => {
		const quest = await loadQuest(event.params.id, event.locals.locale);
		return addTaskAction('add', () => ({
			ok: true,
			target: { kind: 'quest', questId: quest.id },
			day: null
		}))(event);
	},

	/** The quest dialog behind "Edit" (the same action as on Quests). */
	update: updateQuestAction,

	toggle: taskAction((task) => setTaskDone(task.id, task.doneAt === null)),
	delete: taskAction((task) => deleteTask(task.id)),
	moveUp: taskAction((task) => moveTask(task.id, 'up')),
	moveDown: taskAction((task) => moveTask(task.id, 'down')),
	/** ⋯ Today / Tomorrow: a backlog task onto today's or tomorrow's list (server `TZ`). */
	today: taskAction((task) => moveTaskToDay(task.id, todayISO())),
	tomorrow: taskAction((task) => moveTaskToDay(task.id, addDays(todayISO(), 1)))
} satisfies Actions;
