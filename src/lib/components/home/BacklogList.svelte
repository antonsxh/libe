<script lang="ts">
	import { formatDurationMin } from '#lib/duration.ts';
	import { formAction } from '#lib/form-action.ts';
	import { enhance } from '$app/forms';
	import { ArrowRight, ChevronDown, Trash2 } from '@lucide/svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import TaskAddForm from '#lib/components/tasks/TaskAddForm.svelte';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import type { Quest } from '#lib/server/db/schema.ts';
	import type { TaskFormResult } from '#lib/task-form.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	let {
		tasks,
		otherTasks = [],
		quests,
		form
	}: {
		/** Open-quest backlog tasks (day = null), grouped by quest order then list order. */
		tasks: TaskWithQuest[];
		/** "Other" tasks without a day (no quest) — rendered as their own group. */
		otherTasks?: TaskWithQuest[];
		quests: Quest[];
		form?: TaskFormResult | undefined;
	} = $props();

	const t = useI18n();
	let expanded = $state(true);
	const count = $derived(tasks.length + otherTasks.length);
</script>

{#snippet row(task: TaskWithQuest)}
	<li
		class="row"
		class:done={task.doneAt !== null}
		style:--q={questColorVar(task.questColor)}
		data-task={task.id}
	>
		{#if task.questName}
			<QuestPill color={task.questColor} label={task.questName} />
		{:else}
			<QuestPill color="slate" label={t.common.other} />
		{/if}
		<span class="title">{task.title}</span>
		{#if task.durationMin !== null}
			<span class="dur muted tabular">{formatDurationMin(task.durationMin, t.intl)}</span>
		{/if}
		<form class="inline" method="POST" action={formAction('today')} use:enhance>
			<input type="hidden" name="taskId" value={task.id} />
			<button type="submit" class="op primary-op" aria-label={t.home.scheduleToday}>
				<ArrowRight size={14} />
				{t.common.today}
			</button>
		</form>
		<form class="inline" method="POST" action={formAction('deleteTask')} use:enhance>
			<input type="hidden" name="taskId" value={task.id} />
			<button type="submit" class="op danger" aria-label={t.common.deleteTask}>
				<Trash2 size={14} />
			</button>
		</form>
	</li>
{/snippet}

<section class="section">
	<div class="head">
		<h2 class="label">{t.common.backlog}</h2>
		<button
			type="button"
			class="collapse"
			class:collapsed={!expanded}
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
		>
			{t.home.openTasks(count)}
			<ChevronDown size={15} />
		</button>
	</div>

	<TaskAddForm action="addBacklog" placeholder={t.tasks.addToBacklog} {quests} otherOption {form} />

	{#if expanded}
		{#if count > 0}
			<ul class="rows">
				{#each tasks as task (task.id)}{@render row(task)}{/each}
				<!-- "Other" tasks without a day, after the quest groups (like Plan's backlog rail). -->
				{#each otherTasks as task (task.id)}{@render row(task)}{/each}
			</ul>
		{:else}
			<p class="muted empty">{t.tasks.backlogEmpty}</p>
		{/if}
	{/if}
</section>

<style>
	.section {
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}
	.collapse {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		padding: var(--space-1) var(--space-2);
	}
	.collapse:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	.collapse :global(svg) {
		transition: transform var(--dur) var(--ease);
	}
	.collapse.collapsed :global(svg) {
		transform: rotate(-90deg);
	}

	.rows {
		list-style: none;
		display: grid;
		gap: var(--space-1);
		padding: 0;
		margin: 0;
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-left: 2px solid var(--q);
		border-radius: var(--radius-md);
		background: var(--surface);
		min-width: 0;
	}
	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: var(--fs-sm);
	}
	.dur {
		flex: none;
		font-size: var(--fs-xs);
	}
	.inline {
		display: contents;
	}
	.op {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 26px;
		padding: 0 var(--space-2);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-faint);
		font-size: var(--fs-xs);
		white-space: nowrap;
	}
	.op:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	.op.primary-op:hover {
		color: var(--accent-text);
	}
	.op.danger:hover {
		color: var(--danger);
	}

	.row.done .title {
		color: var(--text-faint);
		text-decoration: line-through;
	}
	.empty {
		font-size: var(--fs-sm);
		padding: var(--space-2) 0;
	}
</style>
