<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import StepIntro from '#lib/components/welcome/StepIntro.svelte';
	import StepGoal from '#lib/components/welcome/StepGoal.svelte';
	import StepQuest from '#lib/components/welcome/StepQuest.svelte';
	import StepFocus from '#lib/components/welcome/StepFocus.svelte';
	import { formAction } from '#lib/form-action.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import type { PageProps } from './$types';

	/**
	 * First-run flow — one form per screen (`?/finish` on the welcome screen and the last
	 * step, `?/goal`, `?/quest`); the step and the created task live in the URL (see
	 * `+page.server.ts`).
	 */
	let { data, form }: PageProps = $props();
	const t = useI18n();
	const timer = useTimer();

	const ACTIONS = ['finish', 'goal', 'quest', 'finish'] as const;
	const o = $derived(t.onboarding);
	const screenTitle = $derived(
		[
			o.pageTitle,
			`${o.goal.title} · libe`,
			`${o.quest.title} · libe`,
			`${data.task ? o.focus.title : o.focus.noTaskTitle} · libe`
		][data.step]
	);

	let busy = $state(false);

	/**
	 * "Start focus" with JS: the action only marks the install onboarded, then the timer store
	 * starts the focus like every other ▶ (asking first if another timer is active) and Focus
	 * opens. Everything else follows the action's redirect.
	 */
	const submit: SubmitFunction = ({ formData, submitter }) => {
		const task = data.task;
		const focus =
			data.step === 3 && task && submitter?.getAttribute('value') === 'focus' ? task : null;
		if (focus) formData.set('client', '1');
		busy = true;
		return async ({ result, update }) => {
			if (focus && result.type === 'success') {
				const ok = await timer.start(
					{ task: { id: focus.id, title: focus.title }, mode: 'focus' },
					{ navigate: true }
				);
				// Rejected for another reason than an active timer (whose "Stop current and start
				// this?" dialog is open now): Focus with the task preselected.
				if (ok) await goto('/focus');
				else if (!timer.switchRequest) await goto(`/focus?task=${focus.id}`);
				busy = false;
				return;
			}
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<svelte:head><title>{screenTitle}</title></svelte:head>

<form method="POST" action={formAction(ACTIONS[data.step])} use:enhance={submit} novalidate>
	{#if data.task}<input type="hidden" name="task" value={data.task.id} />{/if}
	{#key data.step}
		{#if data.step === 0}
			<StepIntro {busy} />
		{:else if data.step === 1}
			<StepGoal
				initial={form?.intent === 'goal' ? form.goal : data.goalChoice}
				taskId={data.task?.id ?? null}
				error={form?.intent === 'goal' ? form.error : undefined}
				{busy}
			/>
		{:else if data.step === 2}
			<StepQuest task={data.task} echo={form?.intent === 'quest' ? form : null} {busy} />
		{:else}
			<StepFocus task={data.task} {busy} />
		{/if}
	{/key}
</form>
