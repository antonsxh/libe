import {
	isISODay,
	weekDays,
	addDays,
	startOfWeek,
	todayISO,
	formatDayLabel,
	weekMonthLabel
} from '#lib/dates.ts';
import { isUuid } from '#lib/ids.ts';
import { listOpenQuests } from '#lib/server/quests.ts';
import {
	getTask,
	listOpenBacklog,
	listOtherBacklog,
	listWeekTasks,
	moveTaskTo,
	moveTaskToDay
} from '#lib/server/tasks.ts';
import {
	addTaskAction,
	formStr,
	optionalQuestTarget,
	requireQuestTarget,
	sharedTaskActions
} from '#lib/server/task-actions.ts';
import { doneLast } from '#lib/ordering.ts';
import { i18n } from '#lib/i18n/index.ts';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ url, locals }) => {
	const t = i18n(locals.locale);
	// `?week=YYYY-MM-DD` — any day of the desired week (normalised to its Monday);
	// invalid or missing → the current week.
	const weekParam = url.searchParams.get('week');
	const today = todayISO();
	const weekMonday = isISODay(weekParam) ? startOfWeek(weekParam) : startOfWeek(today);
	const days = weekDays(weekMonday);

	const [quests_, weekTasks, questBacklog, otherBacklog] = await Promise.all([
		listOpenQuests(),
		listWeekTasks(weekMonday),
		listOpenBacklog(),
		listOtherBacklog()
	]);

	// `?q=` — same semantics as Home: a proper subset of open quest ids filters the
	// quest cards of every column and the backlog's quest groups.
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

	// `?other=2026-11-16,2026-11-18` — days whose "Other" zone is expanded. Kept in the
	// URL so it survives reloads and works without JS.
	const otherDays = new Set(
		(url.searchParams.get('other') ?? '').split(',').filter((d) => isISODay(d))
	);

	const visibleQuests = questFilter
		? quests_.filter((quest) => questFilter!.has(quest.id))
		: quests_;

	const columns = days.map((day) => {
		const dayTasks = weekTasks.filter((t) => t.day === day);
		const questSplit = doneLast(
			dayTasks.filter(
				(t) =>
					t.kind === 'quest' && (!questFilter || (t.questId !== null && questFilter.has(t.questId)))
			)
		);
		const otherSplit = doneLast(dayTasks.filter((t) => t.kind === 'other'));
		return {
			day,
			weekday: formatDayLabel(day, { weekday: 'short' }, t.intl),
			dayNum: Number(day.slice(8, 10)),
			isToday: day === today,
			isPast: day < today,
			questTasks: questSplit.open,
			questDone: hideDone ? [] : questSplit.done,
			otherTasks: otherSplit.open,
			otherDone: hideDone ? [] : otherSplit.done,
			otherOpen: otherDays.has(day)
		};
	});

	// Backlog grouped per open quest (quest order, then list order) plus the "Other" backlog;
	// `?q=` drops quest groups, `?hideDone=1` hides finished rows.
	const group = (key: string, name: string, color: string | null, list: typeof otherBacklog) => {
		const split = doneLast(list);
		return { key, name, color, open: split.open, done: hideDone ? [] : split.done };
	};
	const backlogGroups = [
		...quests_
			.filter((quest) => !questFilter || questFilter.has(quest.id))
			.map((quest) =>
				group(
					quest.id,
					quest.name,
					quest.color,
					questBacklog.filter((t) => t.questId === quest.id)
				)
			),
		group('other', t.common.other, null, otherBacklog)
	].filter((g) => g.open.length + g.done.length > 0);

	return {
		weekMonday,
		today,
		monthLabel: weekMonthLabel(weekMonday, t.intl),
		columns,
		backlogGroups,
		quests: quests_,
		visibleQuests,
		questFilter: questFilter ? [...questFilter] : null,
		hideDone,
		backlogCount: backlogGroups.reduce((n, g) => n + g.open.length, 0)
	};
}) satisfies PageServerLoad;

/** `taskId` of a menu form, validated. */
async function menuTaskId(request: Request): Promise<string | null> {
	const id = formStr(await request.formData(), 'taskId');
	return isUuid(id) ? id : null;
}

export const actions: Actions = {
	...sharedTaskActions,

	/** Add a task to a day column. `questId` may be `'other'`/empty → kind `other`. */
	add: addTaskAction('add', async (form) => {
		const day = formStr(form, 'day');
		if (!isISODay(day)) return { ok: false, errors: { title: 'unknownDay' } };
		const target = await optionalQuestTarget(formStr(form, 'questId'));
		return target.ok
			? { ok: true, target: target.target, day }
			: { ok: false, errors: { title: target.error } };
	}),

	/** Add an "Other" task from a column's expanded Other zone. */
	addOther: addTaskAction('addOther', (form) => {
		const day = formStr(form, 'day');
		return isISODay(day)
			? { ok: true, target: { kind: 'other' }, day }
			: { ok: false, errors: { title: 'unknownDay' } };
	}),

	/** Add a task to a quest's backlog (backlog column). */
	addBacklog: addTaskAction('addBacklog', async (form) => {
		const target = await requireQuestTarget(formStr(form, 'questId'));
		return target.ok
			? { ok: true, target: target.target, day: null }
			: { ok: false, errors: { title: target.error } };
	}),

	/**
	 * Drag & drop (and backlog "Move to today"): `day` ('' = backlog), `beforeId`
	 * ('' or unknown = append at the end of the target list).
	 */
	moveTo: async ({ request }) => {
		const form = await request.formData();
		const taskId = formStr(form, 'taskId');
		const dayRaw = formStr(form, 'day');
		const beforeRaw = formStr(form, 'beforeId');
		if (!isUuid(taskId) || (dayRaw !== '' && !isISODay(dayRaw))) return;
		await moveTaskTo(taskId, dayRaw === '' ? null : dayRaw, isUuid(beforeRaw) ? beforeRaw : null);
	},

	/** Menu "Move to previous day". */
	prevDay: async ({ request }) => {
		const id = await menuTaskId(request);
		const task = id ? await getTask(id) : undefined;
		if (task?.day) await moveTaskToDay(task.id, addDays(task.day, -1));
	},

	/** Menu "Move to next day". */
	nextDay: async ({ request }) => {
		const id = await menuTaskId(request);
		const task = id ? await getTask(id) : undefined;
		if (task?.day) await moveTaskToDay(task.id, addDays(task.day, 1));
	}
};
