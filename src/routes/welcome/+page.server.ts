import { fail, redirect } from '@sveltejs/kit';
import { parseDailyGoal } from '#lib/daily-goal.ts';
import { i18n } from '#lib/i18n/index.ts';
import {
	initialGoalChoice,
	parseFirstStepDuration,
	parseStep,
	welcomeHref
} from '#lib/onboarding.ts';
import { parseQuestForm, validateQuestForm } from '#lib/quest-form.ts';
import { validateTaskTitle } from '#lib/task-form.ts';
import { getWelcomeTask, saveFirstQuest } from '#lib/server/onboarding.ts';
import { isOnboarded, markOnboarded, saveDailyGoal } from '#lib/server/settings.ts';
import { formStr } from '#lib/server/task-actions.ts';
import { TimerError, startTimer } from '#lib/server/timer.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * First-run flow (`/welcome`): welcome → daily goal → first quest + first step → first focus.
 * The step is in the URL (`?step=1…3`, `&task=<id>` once step 2 created the task), so
 * back/forward and reloads show the same screen. Only while `settings.onboarded_at` is null;
 * afterwards the page redirects to Home. Nothing else redirects here except a first-device
 * `/setup` — leaving halfway never traps anyone.
 */
export const load = (async ({ url, locals }) => {
	if (await isOnboarded()) redirect(303, '/');
	const step = parseStep(url.searchParams.get('step'));
	const task = await getWelcomeTask(url.searchParams.get('task'));
	return { step, task, goalChoice: initialGoalChoice(locals.dailyGoalMin) };
}) satisfies PageServerLoad;

export const actions = {
	/** Step 1: save the daily goal (a choice, or `off` = no goal), then step 2. */
	goal: async ({ request, locals }) => {
		const form = await request.formData();
		const goal = formStr(form, 'goal');
		const parsed = parseDailyGoal({ preset: goal });
		if (!parsed.ok)
			return fail(400, {
				intent: 'goal' as const,
				goal,
				error: i18n(locals.locale).errors[parsed.error]
			});
		await saveDailyGoal(parsed.value);
		redirect(303, welcomeHref(2, formStr(form, 'task') || null));
	},

	/** Step 2: the quest (name, colour) and its first step today (title, 25/45/60 min). */
	quest: async ({ request, locals }) => {
		const form = await request.formData();
		const fields = parseQuestForm(form);
		const values = {
			name: fields.name,
			color: fields.color,
			title: formStr(form, 'title'),
			duration: formStr(form, 'duration')
		};
		// Only name and colour are asked for: description, icon and budget take their defaults.
		const quest = validateQuestForm({ ...fields, description: '', icon: '', weeklyBudgetH: '' });
		const title = validateTaskTitle(values.title);
		const duration = parseFirstStepDuration(values.duration);
		if (!quest.ok || !title.ok || !duration.ok) {
			const { errors: t } = i18n(locals.locale);
			const errors: Partial<Record<'name' | 'color' | 'title' | 'duration', string>> = {};
			if (!quest.ok) {
				if (quest.errors.name) errors.name = t[quest.errors.name];
				if (quest.errors.color) errors.color = t[quest.errors.color];
			}
			if (!title.ok) errors.title = t[title.error];
			if (!duration.ok) errors.duration = t[duration.error];
			return fail(400, { intent: 'quest' as const, ...values, errors });
		}
		const existing = await getWelcomeTask(formStr(form, 'task'));
		const taskId = await saveFirstQuest(
			{ quest: quest.draft, title: title.title, durationMin: duration.minutes },
			existing
		);
		redirect(303, welcomeHref(3, taskId));
	},

	/**
	 * Done (step 3's buttons, or "Skip setup"): mark the install onboarded, then Home — or,
	 * with `then=focus`, start a focus on the created task. With JS (`client=1`) the page
	 * starts it through the timer store (`useTimer().start`, which asks before replacing an
	 * active timer); without JS this action starts it with the same server function as
	 * `POST /api/timer` and lands on `/focus`.
	 */
	finish: async ({ request }) => {
		const form = await request.formData();
		await markOnboarded();
		const task =
			formStr(form, 'then') === 'focus' ? await getWelcomeTask(formStr(form, 'task')) : null;
		if (!task) redirect(303, '/');
		if (formStr(form, 'client') === '1') return { intent: 'finish' as const, start: task.id };
		try {
			await startTimer({ taskId: task.id, mode: 'focus' });
		} catch (err) {
			if (!(err instanceof TimerError)) throw err;
			// Another timer is active: Focus shows it, with this task preselected for later.
			redirect(303, `/focus?task=${task.id}`);
		}
		redirect(303, '/focus');
	}
} satisfies Actions;
