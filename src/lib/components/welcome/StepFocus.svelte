<script lang="ts">
	import { PartyPopper, Timer } from '@lucide/svelte';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import WelcomeScreen from './WelcomeScreen.svelte';
	import { formatDurationMin } from '#lib/duration.ts';
	import { welcomeHref } from '#lib/onboarding.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { WelcomeTask } from '#lib/server/onboarding.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Step 3: the created task as a card and "Start focus" (or, after "Skip" in step 2 — no
	 * task, and the timer needs one — just "Go to Home"). Both buttons finish the flow.
	 */
	type Props = { task: WelcomeTask | null; busy: boolean };
	let { task, busy }: Props = $props();
	const t = useI18n();
	const f = $derived(t.onboarding.focus);
</script>

<WelcomeScreen
	step={3}
	backHref={welcomeHref(2, task?.id)}
	title={task ? f.title : f.noTaskTitle}
	lead={task ? f.lead : f.noTaskLead}
>
	{#snippet symbol()}
		{#if task}<Timer strokeWidth={1.5} aria-hidden="true" />{:else}<PartyPopper
				strokeWidth={1.5}
				aria-hidden="true"
			/>{/if}
	{/snippet}
	{#if task}
		<GroupedList label={task.title}>
			<div class="task" data-testid="welcome-task" style:--q={questColorVar(task.questColor)}>
				<p class="title">{task.title}</p>
				<p class="meta">
					<span class="dot" aria-hidden="true"></span>
					<span>{task.questName}</span>
					{#if task.durationMin}
						<span aria-hidden="true">·</span>
						<span class="tabular">
							{formatDurationMin(task.durationMin, t.intl)}
							{t.tasks.planned}
						</span>
					{/if}
				</p>
			</div>
		</GroupedList>
	{/if}
	{#snippet actions()}
		{#if task}
			<button class="cta" type="submit" name="then" value="focus" disabled={busy}>{f.start}</button>
			<button class="plain" type="submit" name="then" value="home" disabled={busy}>
				{f.later}
			</button>
		{:else}
			<button class="cta" type="submit" name="then" value="home" disabled={busy}>{f.home}</button>
		{/if}
	{/snippet}
</WelcomeScreen>

<style>
	.task {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--grouped-inset);
	}
	.title {
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
		overflow-wrap: anywhere;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--q);
	}
</style>
