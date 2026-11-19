<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowLeft, Plus } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import TaskRow from '#lib/components/tasks/TaskRow.svelte';
	import { formatDayLabel, formatHours } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = useI18n();

	const quest = $derived(data.quest);
	/** Echoed values while the "add to backlog" row shows validation errors. */
	const addEcho = $derived(form?.intent === 'add' && form.errors ? form : undefined);
</script>

<svelte:head><title>{quest.name} · libe</title></svelte:head>

<a class="back muted" href="/quests"><ArrowLeft size={15} /> {t.quests.allQuests}</a>

<header class="head">
	<span class="tile" aria-hidden="true">{quest.icon}</span>
	<div class="head-text">
		<h1 class="quest-name" style:color={questColorVar(quest.color)}>{quest.name}</h1>
		{#if quest.description}<p class="muted desc">{quest.description}</p>{/if}
		{#if quest.closedAt !== null}
			<p class="label">{t.common.closedQuest}</p>
		{:else if quest.weeklyBudgetH !== null}
			<QuestPill
				color={quest.color}
				label={t.quests.perWeek(formatHours(quest.weeklyBudgetH, t.intl))}
			/>
		{/if}
	</div>
</header>

<section class="section">
	<h2 class="label">{t.common.backlog}</h2>

	<form class="add" method="POST" action="?/add" use:enhance>
		<input
			class="title"
			name="title"
			type="text"
			maxlength="200"
			placeholder={t.tasks.addToBacklog}
			autocomplete="off"
			value={addEcho?.title ?? ''}
		/>
		<input
			class="duration"
			name="duration"
			type="number"
			min="1"
			max="1440"
			step="1"
			placeholder={t.common.durationPlaceholder}
			aria-label={t.common.durationOptional}
			value={addEcho?.duration ?? ''}
		/>
		<Button size="sm" type="submit"><Plus size={16} /> {t.common.add}</Button>
	</form>
	{#if addEcho?.errors?.title}<p class="error">{addEcho.errors.title}</p>{/if}
	{#if addEcho?.errors?.duration}<p class="error">{addEcho.errors.duration}</p>{/if}

	{#if data.backlog.length > 0}
		<ul class="tasks">
			{#each data.backlog as task, i (task.id)}
				<TaskRow {task} first={i === 0} last={i === data.backlog.length - 1} />
			{/each}
		</ul>
	{:else}
		<p class="muted empty">
			{t.quests.backlogEmpty}
		</p>
	{/if}
</section>

<section class="section">
	<h2 class="label">{t.quests.scheduled}</h2>
	{#if data.scheduled.length > 0}
		<ul class="tasks">
			{#each data.scheduled as task (task.id)}
				<li class="sched card" class:done={task.doneAt !== null}>
					<span class="day muted">
						{formatDayLabel(task.day, { weekday: 'short', month: 'short', day: 'numeric' }, t.intl)}
					</span>
					<span class="title">{task.title}</span>
					{#if task.durationMin !== null}
						<span class="dur muted tabular">{t.common.minutes(task.durationMin)}</span>
					{/if}
					{#if task.doneAt !== null}<span class="done-mark">✓</span>{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted empty">{t.quests.scheduledEmpty}</p>
	{/if}
</section>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--fs-sm);
		margin-bottom: var(--space-5);
	}
	.back:hover {
		color: var(--text);
	}

	.head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
		margin-bottom: var(--space-10);
	}
	.tile {
		flex: none;
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		border-radius: var(--radius-lg);
		background: var(--surface-2);
		font-size: 28px;
		line-height: 1;
	}
	.head-text {
		display: grid;
		gap: var(--space-2);
		justify-items: start;
		min-width: 0;
	}
	.quest-name {
		letter-spacing: -0.02em;
	}
	.desc {
		max-width: 60ch;
	}

	.section {
		margin-bottom: var(--space-10);
	}
	.section .label {
		display: block;
		margin-bottom: var(--space-3);
	}

	.add {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
		border: 1px dashed var(--border-dashed);
		border-radius: var(--radius-md);
		margin-bottom: var(--space-3);
	}
	.add:focus-within {
		border-color: var(--border-strong);
	}
	.add .title {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		padding: var(--space-2) 0;
		color: var(--text);
		font-size: var(--fs-md);
	}
	.add .duration {
		flex: none;
		width: 64px;
		padding: var(--space-2);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-2);
		font-size: var(--fs-sm);
		text-align: right;
	}

	.error {
		color: var(--danger);
		font-size: var(--fs-xs);
		margin-bottom: var(--space-3);
	}

	.tasks {
		list-style: none;
		display: grid;
		/* Rows never grow past the column (long titles ellipsize instead). */
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-2);
		padding: 0;
		margin: 0;
	}

	.sched {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
	}
	.sched .day {
		flex: none;
		font-size: var(--fs-xs);
		min-width: 90px;
	}
	.sched .title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.sched .dur {
		flex: none;
		font-size: var(--fs-xs);
	}
	.sched .done-mark {
		flex: none;
		color: var(--success);
	}
	.sched.done .title {
		color: var(--text-faint);
		text-decoration: line-through;
	}

	.empty {
		font-size: var(--fs-sm);
		padding: var(--space-4) 0;
	}
</style>
