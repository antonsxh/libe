<script lang="ts">
	import { formAction } from '#lib/form-action.ts';
	import { enhance } from '$app/forms';
	import type { Snippet } from 'svelte';
	import { ArrowRight, CalendarClock, Inbox, Trash2 } from '@lucide/svelte';
	import Menu from '#lib/components/Menu.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import { fadeScale, listFlip, rowIn } from '#lib/motion.ts';
	import { untrack } from 'svelte';
	import { overdueAgeLabel } from '#lib/overdue.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Overdue tasks as rows (Home's Overdue group, Plan's rail and phone sheet): done check,
	 * title, quest pill (Home: "● quest" under the title), age ("yesterday" / "since Wed, Nov 18"), an inline "Today" and a ⋯ menu with
	 * Tomorrow, Backlog and Delete. Every way out is an explicit server action (shared
	 * `task-actions.ts`: `overdueTo`, `toggle`, `toBacklog`, `deleteTask`).
	 */
	type Props = {
		/** In display order (`listOverdue`). */
		tasks: TaskWithQuest[];
		/** The server's today (ages are relative to it). */
		today: string;
		/**
		 * Plan's narrow rail: no quest name (the check's colour shows it), one-line titles,
		 * an icon-only "Today".
		 */
		compact?: boolean;
		/**
		 * Home: rows of an inset grouped list (like "Today") — a check ring in the quest colour,
		 * the title over "● quest · age".
		 */
		grouped?: boolean;
		/** A last row inside the list (Home's "Show N more"). */
		more?: Snippet;
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
		grouped = false,
		more,
		mark = true,
		ondragstart,
		ondragend,
		draggingId = null
	}: Props = $props();
	const t = useI18n();

	/** Home (grouped): rows slide in when they appear and the others glide into place. */
	let list = $state<HTMLUListElement>();
	const flip = listFlip('overdue');
	$effect.pre(() => {
		void tasks;
		if (grouped) untrack(() => flip.measure(list));
	});
	$effect(() => {
		void tasks;
		if (grouped) untrack(() => flip.play(list));
	});

	const age = (day: string | null) => (day ? overdueAgeLabel(day, today, t.overdue, t.intl) : '');
</script>

<ul class="rows" class:compact class:grouped bind:this={list}>
	{#each tasks as task (task.id)}
		<li
			in:rowIn={{ enabled: grouped }}
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
					{#if grouped && !compact}
						<span class="qdot" aria-hidden="true"></span>
						<span class="qname">{task.questName ?? t.common.other}</span>
						<span class="sep" aria-hidden="true">·</span>
					{:else if !compact}
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
	{#if more}<li class="more">{@render more()}</li>{/if}
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

	/* Home: rows of an inset grouped list, title over "● quest · age". */
	.grouped {
		gap: 0;
		overflow: hidden;
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg);
	}
	.grouped > li {
		position: relative;
	}
	.grouped > li + li::after {
		content: '';
		position: absolute;
		top: 0;
		left: calc(var(--grouped-inset) + var(--row-check) + var(--space-3));
		right: 0;
		height: 1px;
		background: var(--grouped-separator);
		pointer-events: none;
	}
	.grouped .row {
		min-height: calc(var(--grouped-row-h) + var(--space-2));
		padding: var(--space-2) var(--space-2) var(--space-2) var(--grouped-inset);
		border: 0;
		border-radius: 0;
		background: transparent;
	}
	.grouped .row::before {
		display: none;
	}
	.grouped .check {
		width: var(--row-check);
		height: var(--row-check);
		border-color: var(--q);
	}
	@media (hover: hover) {
		.grouped .check:hover {
			border-color: var(--q);
			background: color-mix(in srgb, var(--q) 18%, transparent);
		}
	}
	.grouped .main {
		display: grid;
		gap: 1px;
	}
	.grouped .title {
		white-space: normal;
		overflow-wrap: anywhere;
	}
	.grouped .meta {
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.qdot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--q);
	}
	.qname {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.sep {
		color: var(--text-faint);
	}
	.grouped .meta {
		flex-wrap: nowrap;
	}
	/* Plan's rail (grouped + compact): one line per title, the age under it. */
	.grouped.compact .row {
		min-height: var(--grouped-row-h);
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
		gap: var(--space-3);
	}
	.grouped.compact > li + li::after {
		left: calc(var(--space-3) + var(--row-check) + var(--space-3));
	}
	.grouped.compact .title {
		white-space: nowrap;
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
