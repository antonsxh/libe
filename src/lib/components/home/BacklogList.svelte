<script lang="ts">
	import { formatDurationMin } from '#lib/duration.ts';
	import { formAction } from '#lib/form-action.ts';
	import { enhance } from '$app/forms';
	import { ArrowRight, Trash2 } from '@lucide/svelte';
	import TaskAddForm from '#lib/components/tasks/TaskAddForm.svelte';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import type { Quest } from '#lib/server/db/schema.ts';
	import type { TaskFormResult } from '#lib/task-form.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Home's backlog (inside the Backlog sheet): every open quest's tasks without a day, then
	 * the "Other" ones, as an inset grouped list — "● quest" over the title, the planned
	 * duration, "→ Today" and delete — and "+ Add to backlog…" as its last row.
	 */
	let {
		tasks,
		otherTasks = [],
		quests,
		form
	}: {
		/** Open-quest backlog tasks (day = null), grouped by quest order then list order. */
		tasks: TaskWithQuest[];
		/** "Other" tasks without a day (no quest) — after the quest groups. */
		otherTasks?: TaskWithQuest[];
		quests: Quest[];
		form?: TaskFormResult | undefined;
	} = $props();

	const t = useI18n();
	const count = $derived(tasks.length + otherTasks.length);
</script>

{#snippet row(task: TaskWithQuest)}
	<li
		class="row"
		class:done={task.doneAt !== null}
		style:--q={questColorVar(task.questColor)}
		data-task={task.id}
	>
		<span class="main">
			<span class="sub">
				<span class="dot" aria-hidden="true"></span>
				<span class="quest">{task.questName ?? t.common.other}</span>
			</span>
			<span class="title">{task.title}</span>
		</span>
		{#if task.durationMin !== null}
			<span class="dur muted tabular">
				{formatDurationMin(task.durationMin, t.intl)}
				<span class="sr-only">{t.tasks.planned}</span>
			</span>
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
				<Trash2 size={15} />
			</button>
		</form>
	</li>
{/snippet}

<section class="section" aria-label={t.common.backlog} data-testid="backlog">
	<ul class="group">
		{#each tasks as task (task.id)}{@render row(task)}{/each}
		<!-- "Other" tasks without a day, after the quest groups (like Plan's backlog rail). -->
		{#each otherTasks as task (task.id)}{@render row(task)}{/each}
		<li class="add-slot">
			<TaskAddForm
				action="addBacklog"
				placeholder={t.tasks.addToBacklog}
				{quests}
				otherOption
				row
				{form}
			/>
		</li>
	</ul>
	{#if count === 0}
		<p class="muted empty">{t.tasks.backlogEmpty}</p>
	{/if}
</section>

<style>
	.section {
		display: grid;
		gap: var(--space-3);
		min-width: 0;
	}
	.group {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow: hidden;
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg-raised); /* in a sheet: one step up (white in light) */
	}
	.group > li {
		position: relative;
	}
	.group > li + li::before {
		content: '';
		position: absolute;
		top: 0;
		left: var(--grouped-inset);
		right: 0;
		height: 1px;
		background: var(--border-strong);
		pointer-events: none;
	}
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: calc(var(--grouped-row-h) + var(--space-2));
		padding: var(--space-2) var(--space-2) var(--space-2) var(--grouped-inset);
		min-width: 0;
	}
	.main {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 1px;
	}
	.sub {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.dot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--q);
	}
	.quest {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.title {
		min-width: 0;
		overflow-wrap: anywhere;
		font-size: var(--fs-md);
	}
	.dur {
		flex: none;
		font-size: var(--fs-sm);
		white-space: nowrap;
	}
	.inline {
		display: contents;
	}
	.op {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 30px;
		padding: 0 var(--space-2);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		white-space: nowrap;
	}
	.op.primary-op {
		color: var(--accent-text);
	}
	@media (hover: hover) {
		.op:hover {
			color: var(--text);
			background: var(--surface-hover);
		}
		.op.primary-op:hover {
			color: var(--accent-text);
			background: var(--accent-soft);
		}
		.op.danger:hover {
			color: var(--danger);
		}
	}
	.row.done .title {
		color: var(--text-faint);
		text-decoration: line-through;
	}
	.empty {
		font-size: var(--fs-sm);
		padding: 0 var(--grouped-inset);
	}
</style>
