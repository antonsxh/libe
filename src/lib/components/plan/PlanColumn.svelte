<script lang="ts">
	import { formAction } from '#lib/form-action.ts';
	import { enhance } from '$app/forms';
	import { ChevronRight, Plus } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import DayTaskCard from '#lib/components/tasks/DayTaskCard.svelte';
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

	/** Phones' empty day: the add input is the one thing to do — the button leads there. */
	function focusAdd() {
		const input = colEl?.querySelector<HTMLInputElement>('form.add input[name=title]');
		input?.focus();
		input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
	}

	/* ── Drag & drop ─────────────────────────────────────────────────────────── */

	let colEl = $state<HTMLDivElement | undefined>();
	let questUl = $state<HTMLUListElement | undefined>();
	let otherUl = $state<HTMLUListElement | undefined>();
	let moveForm = $state<HTMLFormElement | undefined>();
	/**
	 * Where the dragged task would land: the list of *its* kind (a quest task hovering the
	 * Other zone still goes to the quest list) and the card it would be inserted before.
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

	function cardDragstart(e: DragEvent, task: TaskWithQuest) {
		startDrag(e, task);
	}
	function cardDragend() {
		over = null;
		endDrag();
	}
</script>

{#snippet card(task: TaskWithQuest, i: number, group: TaskWithQuest[])}
	<DayTaskCard
		{task}
		variant="plan"
		first={i === 0}
		last={i === group.length - 1}
		dropBefore={over?.beforeId === task.id}
		dragging={drag.task?.id === task.id}
		overdue={overdueIds?.has(task.id) ?? false}
		ondragstart={cardDragstart}
		ondragend={cardDragend}
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
		<h2 class="day">
			<span class="weekday">{col.weekday}</span>
			<span class="daynum tabular">{col.dayNum}</span>
		</h2>
		{#if col.isToday}<span class="sr-only">{t.plan.todayMarker}</span>{/if}
	</header>

	<TaskAddForm
		action="add"
		placeholder={t.tasks.addTask}
		{quests}
		otherOption
		topBottom
		compact
		day={col.day}
		{form}
	/>

	<div class="body">
		{#if empty}
			<!-- Phones only: a calm empty day whose one action is the add input above. -->
			<div class="empty-day">
				<p class="empty-title">
					{t.plan.emptyDay(formatDayLabel(col.day, { weekday: 'long' }, t.intl))}
				</p>
				<p class="muted">{t.plan.emptyDayHint}</p>
				<Button variant="primary" onclick={focusAdd}>
					<Plus size={16} />
					{t.plan.addTask}
				</Button>
			</div>
		{/if}
		<ul class="cards" bind:this={questUl}>
			{#each col.questTasks as task, i (task.id)}
				{@render card(task, i, col.questTasks)}
			{/each}
			{#each col.questDone as task, i (task.id)}
				{@render card(task, i, col.questDone)}
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
							{@render card(task, i, col.otherTasks)}
						{/each}
						{#each col.otherDone as task, i (task.id)}
							{@render card(task, i, col.otherDone)}
						{/each}
						{#if over?.kind === 'other' && over.beforeId === null}
							<li class="drop-end" aria-hidden="true"></li>
						{/if}
					</ul>
					<TaskAddForm
						action="addOther"
						placeholder={t.plan.addOther}
						topBottom
						compact
						day={col.day}
						{form}
					/>
				{/if}
			</div>
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
		flex: 0 0 252px;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		min-height: 0;
		padding: var(--space-3) var(--space-2) var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--surface) 45%, transparent);
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
		padding: 0 var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
	}
	.today .head {
		border-bottom: 2px solid var(--accent);
		padding-bottom: calc(var(--space-3) - 1px);
	}
	.day {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
	}
	.weekday {
		color: var(--text-muted);
	}
	.daynum {
		font-size: var(--fs-md);
		color: var(--text-faint);
	}
	.today .weekday {
		color: var(--text);
	}
	.today .daynum {
		color: var(--accent);
	}

	.col :global(form.add) {
		margin-bottom: 0;
		padding-left: var(--space-3);
	}

	/* Cards + Other zone scroll together inside the column. */
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
	.cards {
		list-style: none;
		display: grid;
		align-content: start;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-1) 0 0;
		min-width: 0;
	}

	/* Amber line at the end of the list the card would be appended to. */
	.drop-end {
		height: 2px;
		border-radius: 1px;
		background: var(--accent);
	}

	.other {
		display: grid;
		gap: var(--space-2);
	}
	.other-toggle {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		width: 100%;
		padding: var(--space-2);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.other-toggle:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	.other-toggle.drop-target {
		border-color: var(--accent);
	}
	.caret {
		display: grid;
		flex: none;
		transition: transform var(--dur) var(--ease);
	}
	.caret.open {
		transform: rotate(90deg);
	}
	.other-toggle .count {
		color: var(--text-faint);
	}

	.empty-day {
		display: none;
	}

	/*
	 * Phones: the day view — only the selected day, full width, no column chrome (the day
	 * strip names the day); the page scrolls instead of the column.
	 */
	@media (max-width: 720px) {
		.col {
			flex: none;
			width: 100%;
			gap: var(--space-4);
			padding: 0;
			border: none;
			background: none;
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
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}
		.col :global(form.add) {
			padding-left: var(--space-3);
		}
		.body {
			overflow: visible;
			gap: var(--space-3);
		}
		.cards {
			gap: var(--space-3);
		}
		.cards:empty {
			display: none;
		}
		.empty-day {
			display: grid;
			justify-items: start;
			gap: var(--space-2);
			padding: var(--space-6) var(--space-4);
			border: 1px dashed var(--border-dashed);
			border-radius: var(--radius-lg);
		}
		.empty-title {
			font-size: var(--fs-lg);
			font-weight: var(--fw-medium);
		}
		.empty-day :global(.btn) {
			margin-top: var(--space-2);
		}
	}
</style>
