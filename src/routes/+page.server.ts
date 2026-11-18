import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { isUuid } from '#lib/ids.ts';
import { db } from '#lib/server/db/index.ts';
import { quests } from '#lib/server/db/schema.ts';
import { listOpenQuests } from '#lib/server/quests.ts';
import {
	listDayTasks,
	listOpenBacklog,
	getTask,
	createTask,
	moveTask,
	moveTaskToDay,
	setTaskDone,
	deleteTask
} from '#lib/server/tasks.ts';
import {
	getBlock,
	listDayBlocks,
	createBlock,
	updateBlock,
	deleteBlock
} from '#lib/server/blocks.ts';
import { homeTime } from '#lib/server/stats.ts';
import { addDays, todayISO, formatDayLabel, minuteOfDay } from '#lib/dates.ts';
import { parseClock, validateBlockSpan, type BlockFormResult } from '#lib/timeline.ts';
import { parseTaskDuration, validateTaskTitle } from '#lib/task-form.ts';
import type { Actions, PageServerLoad } from './$types';

/** Split a task list so finished tasks sink below the open ones (order preserved). */
function doneLast<T extends { doneAt: Date | null }>(list: T[]): { open: T[]; done: T[] } {
	const open: T[] = [];
	const done: T[] = [];
	for (const item of list) (item.doneAt ? done : open).push(item);
	return { open, done };
}

export const load = (async ({ url }) => {
	const day = todayISO();

	const [quests_, questTasksAll, otherTasksAll, backlog, blocks, time] = await Promise.all([
		listOpenQuests(),
		listDayTasks(day, 'quest'),
		listDayTasks(day, 'other'),
		listOpenBacklog(),
		listDayBlocks(day),
		homeTime()
	]);

	// `?q=<id>,<id>` — a *proper subset* of the open quest ids filters the quest
	// column; none or all checked means "no filter" (the client removes the param).
	const allIds = new Set(quests_.map((q) => q.id));
	let questFilter: Set<string> | null = null;
	const q = url.searchParams.get('q');
	if (q !== null) {
		const ids = q.split(',').filter((id) => id.length > 0);
		if (ids.length > 0 && ids.length < allIds.size && ids.every((id) => allIds.has(id))) {
			questFilter = new Set(ids);
		}
	}
	const hideDone = url.searchParams.get('hideDone') === '1';
	const filter = questFilter; // keep TS happy inside closures

	const questSplit = doneLast(
		filter
			? questTasksAll.filter((t) => t.questId !== null && filter.has(t.questId))
			: questTasksAll
	);
	const otherSplit = doneLast(otherTasksAll);
	const weekBudgetMin = quests_.reduce((sum, quest) => sum + (quest.weeklyBudgetH ?? 0) * 60, 0);

	return {
		title: formatDayLabel(day, { weekday: 'long', month: 'long', day: 'numeric' }),
		dayLabel: formatDayLabel(day, { month: 'short', day: 'numeric' }),
		day,
		/** Server's minutes-of-day for the timeline "now" line (client refreshes it). */
		now: minuteOfDay(),
		todayMin: Math.round(time.todayH * 60),
		weekMin: Math.round(time.weekH * 60),
		weekBudgetMin,
		byTaskMs: time.byTaskMs,
		quests: quests_,
		/** Quests matching `?q=` — picker for the add rows. */
		visibleQuests: filter ? quests_.filter((quest) => filter.has(quest.id)) : quests_,
		questFilter: filter ? [...filter] : null,
		questTasks: questSplit.open.concat(questSplit.done),
		otherTasks: otherSplit.open.concat(hideDone ? [] : otherSplit.done),
		hideDone,
		backlog,
		blocks
	};
}) satisfies PageServerLoad;

const formStr = (form: FormData, name: string): string => String(form.get(name) ?? '');

/** Task form actions: validate like the quest page and echo input on failure. */
function taskEcho(action: string, form: FormData) {
	return {
		ok: false as const,
		intent: action,
		title: formStr(form, 'title'),
		duration: formStr(form, 'duration')
	};
}

async function taskIdFrom(request: Request): Promise<string | null> {
	const raw = formStr(await request.formData(), 'taskId');
	return isUuid(raw) ? raw : null;
}

export const actions = {
	/** Add a task to a quest on today's list; `pos` = top|bottom. */
	addQuest: async ({ request }) => {
		const form = await request.formData();
		const title = validateTaskTitle(formStr(form, 'title'));
		const duration = parseTaskDuration(formStr(form, 'duration'));
		const questId = formStr(form, 'questId');
		if (!title.ok || !duration.ok)
			return fail(400, {
				...taskEcho('addQuest', form),
				errors: {
					title: title.ok ? undefined : title.error,
					duration: duration.ok ? undefined : duration.error
				}
			});
		if (!isUuid(questId))
			return fail(400, { ...taskEcho('addQuest', form), errors: { title: 'Pick a quest.' } });
		const quest = await db.query.quests.findFirst({ where: eq(quests.id, questId) });
		if (!quest)
			return fail(400, { ...taskEcho('addQuest', form), errors: { title: 'Quest not found.' } });
		await createTask(
			{ kind: 'quest', questId },
			{ title: title.title, durationMin: duration.minutes, day: todayISO() },
			form.get('pos') === 'top' ? 'top' : 'bottom'
		);
	},

	/** Add a task to a quest's backlog (no day). */
	addBacklog: async ({ request }) => {
		const form = await request.formData();
		const title = validateTaskTitle(formStr(form, 'title'));
		const questId = formStr(form, 'questId');
		if (!title.ok)
			return fail(400, { ...taskEcho('addBacklog', form), errors: { title: title.error } });
		if (!isUuid(questId))
			return fail(400, { ...taskEcho('addBacklog', form), errors: { title: 'Pick a quest.' } });
		const quest = await db.query.quests.findFirst({ where: eq(quests.id, questId) });
		if (!quest)
			return fail(400, { ...taskEcho('addBacklog', form), errors: { title: 'Quest not found.' } });
		await createTask({ kind: 'quest', questId }, { title: title.title, day: null }, 'bottom');
	},

	/** Add a plain "Other" task to today; `pos` = top|bottom. */
	addOther: async ({ request }) => {
		const form = await request.formData();
		const title = validateTaskTitle(formStr(form, 'title'));
		if (!title.ok)
			return fail(400, { ...taskEcho('addOther', form), errors: { title: title.error } });
		await createTask(
			{ kind: 'other' },
			{ title: title.title, day: todayISO() },
			form.get('pos') === 'top' ? 'top' : 'bottom'
		);
	},

	toggle: async ({ request }) => {
		const id = await taskIdFrom(request);
		const task = id ? await getTask(id) : undefined;
		if (task) await setTaskDone(task.id, task.doneAt === null);
	},

	moveUp: async ({ request }) => {
		const id = await taskIdFrom(request);
		if (id) await moveTask(id, 'up');
	},

	moveDown: async ({ request }) => {
		const id = await taskIdFrom(request);
		if (id) await moveTask(id, 'down');
	},

	/** Backlog button on "→ Today": schedule a backlog task onto today. */
	today: async ({ request }) => {
		const id = await taskIdFrom(request);
		if (id) await moveTaskToDay(id, todayISO());
	},

	toBacklog: async ({ request }) => {
		const id = await taskIdFrom(request);
		if (id) await moveTaskToDay(id, null);
	},

	toTomorrow: async ({ request }) => {
		const id = await taskIdFrom(request);
		if (id) await moveTaskToDay(id, addDays(todayISO(), 1));
	},

	deleteTask: async ({ request }) => {
		const id = await taskIdFrom(request);
		if (id) await deleteTask(id);
	},

	/** Create a time block for a task (dialog). */
	block: async ({ request }) => {
		const form = await request.formData();
		const echo = {
			ok: false as const,
			intent: 'block',
			taskId: formStr(form, 'taskId'),
			start: formStr(form, 'time'),
			duration: formStr(form, 'duration')
		} satisfies BlockFormResult;
		const taskId = echo.taskId;
		if (!isUuid(taskId)) return fail(400, { ...echo, errors: { time: 'Task no longer exists.' } });
		const task = await getTask(taskId);
		if (!task) return fail(400, { ...echo, errors: { time: 'Task no longer exists.' } });
		const start = parseClock(form.get('time'));
		if (start === null)
			return fail(400, { ...echo, errors: { time: 'Pick a start time between 00:00 and 23:59.' } });
		const durationMin = Math.round(Number(form.get('duration')));
		const span = validateBlockSpan(start, Number.isFinite(durationMin) ? durationMin : NaN);
		if (!span.ok) return fail(400, { ...echo, errors: { time: span.error } });
		await createBlock({ taskId, day: todayISO(), startMin: start, endMin: span.endMin });
	},

	/** Edit an existing block (dialog). */
	blockUpdate: async ({ request }) => {
		const form = await request.formData();
		const echo = {
			ok: false as const,
			intent: 'blockUpdate',
			blockId: formStr(form, 'blockId'),
			start: formStr(form, 'time'),
			duration: formStr(form, 'duration')
		} satisfies BlockFormResult;
		const blockId = echo.blockId;
		if (!isUuid(blockId) || !(await getBlock(blockId)))
			return fail(400, { ...echo, errors: { time: 'This block no longer exists.' } });
		const start = parseClock(form.get('time'));
		if (start === null)
			return fail(400, { ...echo, errors: { time: 'Pick a start time between 00:00 and 23:59.' } });
		const durationMin = Math.round(Number(form.get('duration')));
		const span = validateBlockSpan(start, Number.isFinite(durationMin) ? durationMin : NaN);
		if (!span.ok) return fail(400, { ...echo, errors: { time: span.error } });
		await updateBlock(blockId, start, span.endMin);
	},

	blockDelete: async ({ request }) => {
		const blockId = formStr(await request.formData(), 'blockId');
		if (isUuid(blockId)) await deleteBlock(blockId);
	}
} satisfies Actions;
