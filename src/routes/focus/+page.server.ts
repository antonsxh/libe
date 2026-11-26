import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { todayISO } from '#lib/dates.ts';
import { isUuid } from '#lib/ids.ts';
import { db } from '#lib/server/db/index.ts';
import { quests, tasks } from '#lib/server/db/schema.ts';
import {
	listDayTasks,
	listOpenBacklog,
	listOtherBacklog,
	type TaskWithQuest
} from '#lib/server/tasks.ts';
import { updatePomodoroSettings } from '#lib/server/timer.ts';
import { parsePomodoroSettings } from '#lib/timer.ts';
import { i18n } from '#lib/i18n/index.ts';
import { pomodoroSettingsFailure } from '#lib/server/settings.ts';
import type { Actions, PageServerLoad } from './$types';

export interface PickTask {
	id: string;
	title: string;
	questName: string | null;
	questColor: string | null;
	durationMin: number | null;
}

const pick = (t: TaskWithQuest): PickTask => ({
	id: t.id,
	title: t.title,
	questName: t.questName,
	questColor: t.questColor,
	durationMin: t.durationMin
});

export const load = (async ({ url, locals }) => {
	const day = todayISO();
	const g = i18n(locals.locale).focus.groups;
	const [questToday, otherToday, questBacklog, otherBacklog] = await Promise.all([
		listDayTasks(day, 'quest'),
		listDayTasks(day, 'other'),
		listOpenBacklog(),
		listOtherBacklog()
	]);
	const open = (list: TaskWithQuest[]) => list.filter((t) => t.doneAt === null).map(pick);
	// Today: quest work, then Other (like Home's one list); then the backlog.
	const groups = [
		{ key: 'today', label: g.today, tasks: open([...questToday, ...otherToday]) },
		{ key: 'backlog', label: g.backlog, tasks: open([...questBacklog, ...otherBacklog]) }
	];

	// `?task=<id>` preselects a task — also one from another day (Plan's ▶).
	const raw = url.searchParams.get('task');
	let selectedId: string | null = null;
	if (isUuid(raw)) {
		const known = groups.some((g) => g.tasks.some((t) => t.id === raw));
		if (known) selectedId = raw;
		else {
			const [row] = await db
				.select({ task: tasks, questName: quests.name, questColor: quests.color })
				.from(tasks)
				.leftJoin(quests, eq(quests.id, tasks.questId))
				.where(eq(tasks.id, raw));
			if (row && row.task.doneAt === null) {
				groups.unshift({
					key: 'selected',
					label: g.selected,
					tasks: [pick({ ...row.task, questName: row.questName, questColor: row.questColor })]
				});
				selectedId = raw;
			}
		}
	}

	return {
		groups: groups.filter((g) => g.tasks.length > 0),
		selectedId,
		timerError: url.searchParams.get('timerError')
	};
}) satisfies PageServerLoad;

export const actions = {
	/** Pomodoro settings dialog. New intervals apply from the active run's next phase. */
	settings: async ({ request, locals }) => {
		const form = await request.formData();
		const values = Object.fromEntries(form);
		const parsed = parsePomodoroSettings(values);
		if (!parsed.ok) return fail(400, pomodoroSettingsFailure(values, parsed.errors, locals.locale));
		await updatePomodoroSettings(parsed.value);
		return { intent: 'settings' as const, saved: true };
	}
} satisfies Actions;
