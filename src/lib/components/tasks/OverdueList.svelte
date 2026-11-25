<script lang="ts">
	import { formAction } from '#lib/form-action.ts';
	import { enhance } from '$app/forms';
	import { ArrowRight, CalendarClock, Inbox, Trash2 } from '@lucide/svelte';
	import Menu from '#lib/components/Menu.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import { fadeScale } from '#lib/motion.ts';
	import { overdueAgeLabel } from '#lib/overdue.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Overdue tasks as rows (Home's card and sheet, Plan's Overdue group): done check, title,
	 * quest pill, age ("yesterday" / "since Wed, Nov 18"), an inline "Today" and a ⋯ menu with
	 * Tomorrow, Backlog and Delete. Every way out is an explicit server action (shared
	 * `task-actions.ts`: `overdueTo`, `toggle`, `toBacklog`, `deleteTask`).
	 */
	type Props = {
		/** In display order (`listOverdue`). */
		tasks: TaskWithQuest[];
		/** The server's today (ages are relative to it). */
		today: string;
		/** Plan's narrow rail: no pill (the colour bar shows the quest), smaller rows. */
		compact?: boolean;
		/**
		 * `data-task` on the rows (the palette scrolls to it). Off where the same task also has
		 * a card on the page (Plan's week), so the attribute stays unique.
		 */
		mark?: boolean;
		/** Plan's rail: rows are drag sources onto the day columns. */
		ondragstart?: (e: DragEvent, task: TaskWithQuest) => void;
		ondragend?: (e: DragEvent) => void;
		draggingId?: string | null;
	};
	let {
		tasks,
		today,
		compact = false,
		mark = true,
		ondragstart,
		ondragend,
		draggingId = null
	}: Props = $props();
	const t = useI18n();

	const age = (day: string | null) => (day ? overdueAgeLabel(day, today, t.overdue, t.intl) : '');
</script>

<ul class="rows" class:compact>
	{#each tasks as task (task.id)}
		<li
			class="row"
			class:dragging={draggingId === task.id}
			style:--q={questColorVar(task.questColor)}
			data-task={mark ? task.id : undefined}
			data-overdue={task.id}
			draggable={ondragstart ? 'true' : undefined}
			ondragstart={ondragstart && ((e) => ondragstart(e, task))}
			{ondragend}
			out:fadeScale
		>
			<form class="inline" method="POST" action={formAction('toggle')} use:enhance>
				<input type="hidden" name="taskId" value={task.id} />
				<button type="submit" class="check" aria-label={t.common.markDone}></button>
			</form>
			<span class="main">
				<span class="title">{task.title}</span>
				<span class="meta">
					{#if !compact}
						{#if task.questId && task.questName}
							<QuestPill color={task.questColor} label={task.questName} />
						{:else}
							<QuestPill color="slate" label={t.common.other} />
						{/if}
					{/if}
					<span class="age">{age(task.day)}</span>
				</span>
			</span>
			<form class="inline" method="POST" action={formAction('overdueTo')} use:enhance>
				<input type="hidden" name="taskId" value={task.id} />
				<input type="hidden" name="to" value="today" />
				<button type="submit" class="today" aria-label={t.overdue.todayAria(task.title)}>
					<ArrowRight size={14} />
					{#if !compact}{t.common.today}{/if}
				</button>
			</form>
			<Menu label={t.common.actionsFor(task.title)}>
				{#snippet children(close)}
					<form method="POST" action={formAction('overdueTo')} use:enhance={() => close()}>
						<input type="hidden" name="taskId" value={task.id} />
						<input type="hidden" name="to" value="tomorrow" />
						<button type="submit" class="item" role="menuitem">
							<CalendarClock size={14} />
							{t.tasks.moveToTomorrow}
						</button>
					</form>
					<form method="POST" action={formAction('toBacklog')} use:enhance={() => close()}>
						<input type="hidden" name="taskId" value={task.id} />
						<button type="submit" class="item" role="menuitem">
							<Inbox size={14} />
							{t.tasks.moveToBacklog}
						</button>
					</form>
					<form method="POST" action={formAction('deleteTask')} use:enhance={() => close()}>
						<input type="hidden" name="taskId" value={task.id} />
						<button type="submit" class="item danger" role="menuitem">
							<Trash2 size={14} />
							{t.common.delete}
						</button>
					</form>
				{/snippet}
			</Menu>
		</li>
	{/each}
</ul>

<style>
	.rows {
		list-style: none;
		display: grid;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
	}
	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
		padding: var(--space-2) var(--space-2) var(--space-2) calc(var(--space-3) + 2px);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}
	/* Quest colour on the left edge, like every task row. */
	.row::before {
		content: '';
		position: absolute;
		left: -1px;
		top: -1px;
		bottom: -1px;
		width: 3px;
		border-radius: var(--radius-md) 0 0 var(--radius-md);
		background: var(--q);
	}
	.row[draggable='true'] {
		cursor: grab;
	}
	.row.dragging {
		opacity: 0.4;
	}
	.inline {
		display: contents;
	}
	.check {
		flex: none;
		width: 20px;
		height: 20px;
		padding: 0;
		border: 1.5px solid var(--border-strong);
		border-radius: 50%;
		background: transparent;
		transition: border-color var(--dur) var(--ease);
	}
	.check:hover {
		border-color: var(--text-muted);
	}
	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: var(--fs-md);
	}
	.meta {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	.age {
		color: var(--overdue);
		font-size: var(--fs-xs);
		white-space: nowrap;
	}
	.today {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 28px;
		padding: 0 var(--space-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		white-space: nowrap;
		transition: color var(--dur) var(--ease);
	}
	.today:hover {
		color: var(--accent-text);
	}

	/* Plan's rail: title over the age, an icon-only "Today". */
	.compact .row {
		gap: var(--space-2);
		padding: var(--space-1) var(--space-1) var(--space-1) calc(var(--space-2) + 2px);
	}
	.compact .check {
		width: 16px;
		height: 16px;
	}
	.compact .main {
		display: grid;
		gap: 0;
	}
	.compact .title {
		font-size: var(--fs-sm);
	}
	.compact .today {
		width: 26px;
		height: 26px;
		padding: 0;
		justify-content: center;
		border: none;
		background: transparent;
		color: var(--text-faint);
	}
	.compact .today:hover {
		color: var(--accent-text);
		background: var(--surface-hover);
	}

	/* Phones (Home's sheet): the title gets its own line, pill and age under it. */
	@media (max-width: 720px) {
		.main {
			display: grid;
			gap: var(--space-1);
		}
		.title {
			white-space: normal;
			overflow-wrap: anywhere;
		}
		.meta {
			flex-wrap: wrap;
			gap: var(--space-1) var(--space-3);
		}
		.meta :global(.pill) {
			min-width: 0;
			max-width: 100%;
		}
		.compact .title {
			white-space: nowrap;
		}
	}

	/* menu items */
	.item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-2);
		font-size: var(--fs-sm);
		text-align: left;
		white-space: nowrap;
	}
	.item:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.item.danger {
		color: var(--danger);
	}
</style>
