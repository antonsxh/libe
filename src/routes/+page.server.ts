import { fail } from '@sveltejs/kit';
import { isUuid } from '#lib/ids.ts';
import { listOpenQuests } from '#lib/server/quests.ts';
import { getTask, listDayTasks, listOpenBacklog, moveTaskToDay } from '#lib/server/tasks.ts';
import {
	addTaskAction,
	formStr,
	requireQuestTarget,
	sharedTaskActions
} from '#lib/server/task-actions.ts';
import {
	getBlock,
	listDayBlocks,
	createBlock,
	updateBlock,
	deleteBlock
} from '#lib/server/blocks.ts';
import { homeTime } from '#lib/server/stats.ts';
import { doneLast } from '#lib/ordering.ts';
import { addDays, todayISO, formatDayLabel, minuteOfDay } from '#lib/dates.ts';
import { parseClock, validateBlockSpan, type BlockFormResult } from '#lib/timeline.ts';
import type { Actions, PageServerLoad } from './$types';

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

export const actions = {
	...sharedTaskActions,

	/** Add a task to a quest on today's list; `pos` = top|bottom. */
	addQuest: addTaskAction('addQuest', async (form) => {
		const res = await requireQuestTarget(String(form.get('questId') ?? ''));
		return res.ok
			? { ok: true, target: res.target, day: todayISO() }
			: { ok: false, errors: { title: res.error } };
	}),

	/** Add a task to a quest's backlog (no day). */
	addBacklog: addTaskAction('addBacklog', async (form) => {
		const res = await requireQuestTarget(String(form.get('questId') ?? ''));
		return res.ok
			? { ok: true, target: res.target, day: null }
			: { ok: false, errors: { title: res.error } };
	}),

	/** Add a plain "Other" task to today; `pos` = top|bottom. */
	addOther: addTaskAction('addOther', () => ({
		ok: true,
		target: { kind: 'other' },
		day: todayISO()
	})),

	/** Backlog button on "→ Today": schedule a backlog task onto today. */
	today: async ({ request }) => {
		const raw = formStr(await request.formData(), 'taskId');
		if (isUuid(raw)) await moveTaskToDay(raw, todayISO());
	},

	/** Move a scheduled task of today to tomorrow. */
	toTomorrow: async ({ request }) => {
		const raw = formStr(await request.formData(), 'taskId');
		if (isUuid(raw)) await moveTaskToDay(raw, addDays(todayISO(), 1));
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
