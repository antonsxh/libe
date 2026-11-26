import { fail } from '@sveltejs/kit';
import { isUuid } from '#lib/ids.ts';
import { listOpenQuests } from '#lib/server/quests.ts';
import {
	getTask,
	listDayTasks,
	listOpenBacklog,
	listOtherBacklog,
	listOverdue,
	moveTaskToDay
} from '#lib/server/tasks.ts';
import {
	addTaskAction,
	formStr,
	optionalQuestTarget,
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
import { createQuestAction } from '#lib/server/quest-actions.ts';
import { doneLast } from '#lib/ordering.ts';
import { addDays, todayISO, formatDayLabel, minuteOfDay } from '#lib/dates.ts';
import { parseClock, validateBlockSpan, type BlockFormResult } from '#lib/timeline.ts';
import { i18n, intlLocale } from '#lib/i18n/index.ts';
import { greetingPart } from '#lib/profile.ts';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ url, locals }) => {
	const day = todayISO();
	const intl = intlLocale(locals.locale);

	const [quests_, questTasksAll, otherTasksAll, backlog, otherBacklog, blocks, time, overdue] =
		await Promise.all([
			listOpenQuests(),
			listDayTasks(day, 'quest'),
			listDayTasks(day, 'other'),
			listOpenBacklog(),
			listOtherBacklog(),
			listDayBlocks(day),
			homeTime(),
			listOverdue(day)
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
	/** `?hideDone=1` hides the done rows of the whole "Today" list. */
	const withDone = <T>(split: { open: T[]; done: T[] }) =>
		hideDone ? split.open : split.open.concat(split.done);
	const weekBudgetMin = quests_.reduce((sum, quest) => sum + (quest.weeklyBudgetH ?? 0) * 60, 0);

	return {
		title: formatDayLabel(day, { weekday: 'long', month: 'long', day: 'numeric' }, intl),
		dayLabel: formatDayLabel(day, { month: 'short', day: 'numeric' }, intl),
		day,
		/** Server's minutes-of-day for the timeline "now" line (client refreshes it). */
		now: minuteOfDay(),
		/** Part of the day for the greeting — server clock and `TZ`, like "today". */
		greeting: greetingPart(Math.floor(minuteOfDay() / 60)),
		weekMin: Math.round(time.weekH * 60),
		weekBudgetMin,
		byTaskMs: time.byTaskMs,
		quests: quests_,
		/** Quests matching `?q=` — the add row's picker (plus Other). */
		visibleQuests: filter ? quests_.filter((quest) => filter.has(quest.id)) : quests_,
		questFilter: filter ? [...filter] : null,
		/** Today's tasks, unfiltered — the "All done" rule (`isAllDone`) ignores `?q=` / `?hideDone=`. */
		dayCounts: {
			total: questTasksAll.length + otherTasksAll.length,
			open: [...questTasksAll, ...otherTasksAll].filter((t) => !t.doneAt).length
		},
		/** Today's two stored lists (open first); the page merges them into one (`mergeDayLists`). */
		questTasks: withDone(questSplit),
		otherTasks: withDone(otherSplit),
		hideDone,
		backlog,
		/** "Other" tasks without a day (shown as their own group in the backlog card). */
		otherBacklog,
		/** Open tasks planned before today (`#lib/overdue.ts`), most recent day first. */
		overdue,
		blocks
	};
}) satisfies PageServerLoad;

export const actions = {
	...sharedTaskActions,

	/** "Create your first quest" (Home without open quests) — the same action as on Quests. */
	create: createQuestAction,

	/**
	 * Home's one add row: a task on today's list — quest work for the picked quest, or Other
	 * (`questId = 'other'`, also the only choice without open quests); `pos` = top|bottom.
	 */
	add: addTaskAction('add', async (form) => {
		const res = await optionalQuestTarget(String(form.get('questId') ?? ''));
		return res.ok
			? { ok: true, target: res.target, day: todayISO() }
			: { ok: false, errors: { title: res.error } };
	}),

	/** Add a task to the backlog (no day): a quest's, or `other` (also without any quest). */
	addBacklog: addTaskAction('addBacklog', async (form) => {
		const res = await optionalQuestTarget(String(form.get('questId') ?? ''));
		return res.ok
			? { ok: true, target: res.target, day: null }
			: { ok: false, errors: { title: res.error } };
	}),

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
	block: async ({ request, locals }) => {
		const form = await request.formData();
		const t = i18n(locals.locale);
		const echo = {
			ok: false as const,
			intent: 'block',
			taskId: formStr(form, 'taskId'),
			start: formStr(form, 'time'),
			duration: formStr(form, 'duration')
		} satisfies BlockFormResult;
		const taskId = echo.taskId;
		if (!isUuid(taskId)) return fail(400, { ...echo, errors: { time: t.errors.taskGone } });
		const task = await getTask(taskId);
		if (!task) return fail(400, { ...echo, errors: { time: t.errors.taskGone } });
		const start = parseClock(form.get('time'));
		if (start === null) return fail(400, { ...echo, errors: { time: t.errors.blockStartInvalid } });
		const durationMin = Math.round(Number(form.get('duration')));
		const span = validateBlockSpan(start, Number.isFinite(durationMin) ? durationMin : NaN);
		if (!span.ok) return fail(400, { ...echo, errors: { time: t.errors[span.error] } });
		await createBlock({ taskId, day: todayISO(), startMin: start, endMin: span.endMin });
	},

	/** Edit an existing block (dialog). */
	blockUpdate: async ({ request, locals }) => {
		const form = await request.formData();
		const t = i18n(locals.locale);
		const echo = {
			ok: false as const,
			intent: 'blockUpdate',
			blockId: formStr(form, 'blockId'),
			start: formStr(form, 'time'),
			duration: formStr(form, 'duration')
		} satisfies BlockFormResult;
		const blockId = echo.blockId;
		if (!isUuid(blockId) || !(await getBlock(blockId)))
			return fail(400, { ...echo, errors: { time: t.errors.blockGone } });
		const start = parseClock(form.get('time'));
		if (start === null) return fail(400, { ...echo, errors: { time: t.errors.blockStartInvalid } });
		const durationMin = Math.round(Number(form.get('duration')));
		const span = validateBlockSpan(start, Number.isFinite(durationMin) ? durationMin : NaN);
		if (!span.ok) return fail(400, { ...echo, errors: { time: t.errors[span.error] } });
		await updateBlock(blockId, start, span.endMin);
	},

	blockDelete: async ({ request }) => {
		const blockId = formStr(await request.formData(), 'blockId');
		if (isUuid(blockId)) await deleteBlock(blockId);
	}
} satisfies Actions;
