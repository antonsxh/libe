<script lang="ts">
	import { formAction } from '#lib/form-action.ts';
	import { enhance } from '$app/forms';
	import { ChevronRight } from '@lucide/svelte';
	import PlanRow from './PlanRow.svelte';
	import TaskAddForm from '#lib/components/tasks/TaskAddForm.svelte';
	import { drag, endDrag, rowBefore, startDrag, submitMove } from './drag.svelte.ts';
	import type { Quest } from '#lib/server/db/schema.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import type { TaskFormResult } from '#lib/task-form.ts';
	import { formatDayLabel } from '#lib/dates.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	export interface Column {
		day: string;
		weekday: string;
		dayNum: number;
		isToday: boolean;
		isPast: boolean;
		questTasks: TaskWithQuest[];
		questDone: TaskWithQuest[];
		otherTasks: TaskWithQuest[];
		otherDone: TaskWithQuest[];
		otherOpen: boolean;
	}

	type Props = {
		col: Column;
		/** Quests visible under the current `?q=` filter (picker options). */
		quests: Quest[];
		form?: TaskFormResult | null;
		/** Expand/collapse this day's Other zone (state lives in the page URL). */
		ontoggleother: (day: string, open: boolean) => void;
		/** Phones (≤ 720px) show only the selected day, full width (the day view). */
		selected?: boolean;
		/** Overdue tasks (`listOverdue`): their cards on past days get the overdue marker. */
		overdueIds?: ReadonlySet<string>;
	};
	let { col, quests, form = null, ontoggleother, selected = false, overdueIds }: Props = $props();
	const t = useI18n();

	const otherCount = $derived(col.otherTasks.length + col.otherDone.length);
	const empty = $derived(otherCount + col.questTasks.length + col.questDone.length === 0);
	/** Open tasks of the day (the phone's list header: "Thursday · 1 open"). */
	const openCount = $derived(col.questTasks.length + col.otherTasks.length);

	/* ── Drag & drop ─────────────────────────────────────────────────────────── */

	let colEl = $state<HTMLDivElement | undefined>();
	let questUl = $state<HTMLUListElement | undefined>();
	let otherUl = $state<HTMLUListElement | undefined>();
	let moveForm = $state<HTMLFormElement | undefined>();
	/**
	 * Where the dragged task would land: the list of *its* kind (a quest task hovering the
	 * Other zone still goes to the quest list) and the row it would be inserted before.
	 */
	let over = $state<{ kind: 'quest' | 'other'; beforeId: string | null } | null>(null);

	function target(y: number) {
		const task = drag.task;
		if (!task) return null;
		const ul = task.kind === 'quest' ? questUl : otherUl;
		return { kind: task.kind, beforeId: ul ? rowBefore(ul, 'li[data-task]', y) : null };
	}

	function ondragover(e: DragEvent) {
		if (!drag.task) return; // not one of our cards (e.g. a file)
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const next = target(e.clientY);
		if (next?.kind !== over?.kind || next?.beforeId !== over?.beforeId) over = next;
	}

	function ondragleave(e: DragEvent) {
		if (!colEl?.contains(e.relatedTarget as Node | null)) over = null;
	}

	function ondrop(e: DragEvent) {
		if (!drag.task || !moveForm) return;
		e.preventDefault();
		const dest = target(e.clientY);
		over = null;
		submitMove(moveForm, col.day, dest?.beforeId ?? null);
	}

	function rowDragstart(e: DragEvent, task: TaskWithQuest) {
		startDrag(e, task);
	}
	function rowDragend() {
		over = null;
		endDrag();
	}
</script>

{#snippet row(task: TaskWithQuest, i: number, group: TaskWithQuest[])}
	<PlanRow
		{task}
		first={i === 0}
		last={i === group.length - 1}
		dropBefore={over?.beforeId === task.id}
		dragging={drag.task?.id === task.id}
		overdue={overdueIds?.has(task.id) ?? false}
		ondragstart={rowDragstart}
		ondragend={rowDragend}
	/>
{/snippet}

<div
	class="col"
	class:sel={selected}
	class:today={col.isToday}
	class:past={col.isPast}
	role="group"
	aria-label={`${col.weekday} ${col.dayNum}`}
	data-day={col.day}
	bind:this={colEl}
	{ondragover}
	{ondragleave}
	{ondrop}
>
	<header class="head">
		<!-- Board: "Mon 23"; phones (the day strip names the date): "Thursday · 1 open". -->
		<h2 class="day">
			<span class="board-only">
				<span class="weekday">{col.weekday}</span>
				<span class="daynum tabular">{col.dayNum}</span>
			</span>
			<span class="phone-only">
				{formatDayLabel(col.day, { weekday: 'long' }, t.intl)} · {t.homeList.open(openCount)}
			</span>
		</h2>
		{#if col.isToday}<span class="sr-only">{t.plan.todayMarker}</span>{/if}
	</header>

	<div class="body">
		<div class="group">
			<ul class="cards" bind:this={questUl}>
				{#each col.questTasks as task, i (task.id)}
					{@render row(task, i, col.questTasks)}
				{/each}
				{#each col.questDone as task, i (task.id)}
					{@render row(task, i, col.questDone)}
				{/each}
				{#if over?.kind === 'quest' && over.beforeId === null}
					<li class="drop-end" aria-hidden="true"></li>
				{/if}
			</ul>

			{#if otherCount > 0}
				<div class="other">
					<button
						type="button"
						class="other-toggle"
						class:drop-target={over?.kind === 'other' && !col.otherOpen}
						aria-expanded={col.otherOpen}
						onclick={() => ontoggleother(col.day, !col.otherOpen)}
					>
						<span class="caret" class:open={col.otherOpen} aria-hidden="true">
							<ChevronRight size={14} />
						</span>
						<span>{t.common.other}</span>
						<span class="count tabular">{otherCount}</span>
					</button>
					{#if col.otherOpen}
						<ul class="cards" bind:this={otherUl}>
							{#each col.otherTasks as task, i (task.id)}
								{@render row(task, i, col.otherTasks)}
							{/each}
							{#each col.otherDone as task, i (task.id)}
								{@render row(task, i, col.otherDone)}
							{/each}
							{#if over?.kind === 'other' && over.beforeId === null}
								<li class="drop-end" aria-hidden="true"></li>
							{/if}
						</ul>
					{/if}
				</div>
			{/if}

			<!-- The day's one add row, last in its list: a quest or Other from the picker. -->
			<div class="add-slot">
				<TaskAddForm
					action="add"
					placeholder={t.tasks.addTask}
					{quests}
					otherOption
					row
					day={col.day}
					{form}
				/>
			</div>
		</div>
		{#if empty}
			<p class="empty-hint">{t.plan.emptyDayHint}</p>
		{/if}
	</div>

	<form method="POST" action={formAction('moveTo')} use:enhance bind:this={moveForm} hidden>
		<input type="hidden" name="taskId" value="" />
		<input type="hidden" name="day" value={col.day} />
		<input type="hidden" name="beforeId" value="" />
	</form>
</div>

<style>
	.col {
		flex: 0 0 var(--plan-col-w);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		min-height: 0;
	}
	/* Past days are dimmed but stay fully interactive. */
	.past {
		opacity: 0.55;
	}
	.past:hover,
	.past:focus-within {
		opacity: 0.85;
	}

	.head {
		padding: 0 var(--space-2);
	}
	.day {
		display: flex;
		align-items: baseline;
		margin: 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
	}
	.board-only {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.phone-only {
		display: none;
	}
	.daynum {
		color: var(--text-muted);
		font-weight: var(--fw-medium);
		font-size: var(--fs-sm);
	}
	/* Today: weekday and date in the accent's text colour. */
	.today .day,
	.today .daynum {
		color: var(--accent-text);
	}

	/* The list scrolls inside the column (the whole column is the drop target). */
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--border-strong) transparent;
	}
	/* One inset grouped list per day: the quest rows, the Other zone, the add row. */
	.group {
		flex: none;
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg);
		overflow: hidden;
	}
	.cards {
		list-style: none;
		display: grid;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	/* Hairline under every row (the add row is always last, so none dangles); `::before` on the
	 * Other toggle — touch screens give every button an `::after` hit area (`global.css`). */
	.cards > :global(li.task)::after,
	.other-toggle::before {
		content: '';
		position: absolute;
		left: calc(var(--space-3) + var(--row-check) + var(--space-3));
		right: 0;
		bottom: 0;
		height: 1px;
		background: var(--grouped-separator);
		pointer-events: none;
	}

	/* Accent line at the end of the list the row would be appended to. */
	.drop-end {
		height: 2px;
		background: var(--accent);
	}

	.other-toggle {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: var(--grouped-row-h);
		padding: var(--space-2) var(--space-3);
		border: none;
		background: transparent;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		text-align: left;
	}
	@media (hover: hover) {
		.other-toggle:hover {
			color: var(--text);
			background: var(--surface-hover);
		}
	}
	.other-toggle.drop-target {
		box-shadow: inset 0 0 0 2px var(--accent);
	}
	.caret {
		display: grid;
		place-items: center;
		flex: none;
		width: var(--row-check);
		transition: transform var(--dur) var(--ease);
	}
	.caret.open {
		transform: rotate(90deg);
	}
	.other-toggle .count {
		margin-left: auto;
		color: var(--text-faint);
	}

	/* The add row in a narrow column: same inset as the rows. */
	.add-slot :global(form.add.row) {
		padding-inline: var(--space-3);
	}
	.empty-hint {
		display: none;
	}

	/*
	 * Phones: the day view — only the selected day, full width; its list header names the day
	 * and its open tasks ("Thursday · 1 open"); the page scrolls instead of the column.
	 */
	@media (max-width: 720px) {
		.col {
			flex: none;
			width: 100%;
		}
		.col:not(.sel) {
			display: none;
		}
		.past,
		.past:hover,
		.past:focus-within {
			opacity: 1;
		}
		.head {
			padding: 0 var(--grouped-inset);
		}
		.day {
			font-size: var(--fs-label);
			font-weight: var(--fw-semibold);
			color: var(--text-muted);
		}
		.today .day {
			color: var(--text-muted);
		}
		.board-only {
			display: none;
		}
		.phone-only {
			display: inline;
		}
		.body {
			overflow: visible;
		}
		.cards > :global(li.task)::after,
		.other-toggle::before {
			left: calc(var(--grouped-inset) + var(--row-check) + var(--space-3));
		}
		.other-toggle {
			padding-inline: var(--grouped-inset);
			font-size: var(--fs-md);
		}
		.add-slot :global(form.add.row) {
			padding-inline: var(--grouped-inset);
		}
		.empty-hint {
			display: block;
			padding: 0 var(--grouped-inset);
			font-size: var(--fs-xs);
			color: var(--text-muted);
		}
	}
</style>
