<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowRight, ChevronDown, Trash2 } from '@lucide/svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import TaskAddForm from '#lib/components/home/TaskAddForm.svelte';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import type { Quest } from '#lib/server/db/schema.ts';
	import type { TaskFormResult } from '#lib/task-form.ts';

	let {
		tasks,
		quests,
		form
	}: {
		/** Open-quest backlog tasks (day = null), grouped by quest order then list order. */
		tasks: TaskWithQuest[];
		quests: Quest[];
		form?: TaskFormResult | undefined;
	} = $props();

	let expanded = $state(true);
</script>

<section class="section">
	<div class="head">
		<h2 class="label">Backlog</h2>
		<button
			type="button"
			class="collapse"
			class:collapsed={!expanded}
			onclick={() => (expanded = !expanded)}
			aria-expanded={expanded}
		>
			{tasks.length} open {tasks.length === 1 ? 'task' : 'tasks'}
			<ChevronDown size={15} />
		</button>
	</div>

	<TaskAddForm action="addBacklog" placeholder="Add to backlog…" {quests} {form} />

	{#if expanded}
		{#if tasks.length > 0}
			<ul class="rows">
				{#each tasks as task (task.id)}
					<li class="row" style:--q={questColorVar(task.questColor)}>
						{#if task.questName}
							<QuestPill color={task.questColor} label={task.questName} />
						{/if}
						<span class="title">{task.title}</span>
						{#if task.durationMin !== null}
							<span class="dur muted tabular">{task.durationMin} min</span>
						{/if}
						<form class="inline" method="POST" action="?/today" use:enhance>
							<input type="hidden" name="taskId" value={task.id} />
							<button type="submit" class="op primary-op" aria-label="Schedule for today">
								<ArrowRight size={14} /> Today
							</button>
						</form>
						<form class="inline" method="POST" action="?/deleteTask" use:enhance>
							<input type="hidden" name="taskId" value={task.id} />
							<button type="submit" class="op danger" aria-label="Delete task">
								<Trash2 size={14} />
							</button>
						</form>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="muted empty">Nothing waiting in the backlog.</p>
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
		color: var(--accent);
	}
	.op.danger:hover {
		color: var(--danger);
	}

	.empty {
		font-size: var(--fs-sm);
		padding: var(--space-2) 0;
	}
</style>
