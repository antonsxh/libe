<script lang="ts">
	import { formAction } from '#lib/form-action.ts';
	import { enhance } from '$app/forms';
	import { CalendarArrowDown, Check, ChevronLeft, ChevronRight, Trash2 } from '@lucide/svelte';
	import Menu from '#lib/components/Menu.svelte';
	import TaskAddForm from '#lib/components/tasks/TaskAddForm.svelte';
	import OverdueList from '#lib/components/tasks/OverdueList.svelte';
	import { OVERDUE_RAIL_PREVIEW, previewOverdue } from '#lib/overdue.ts';
	import { formatDayLabel } from '#lib/dates.ts';
	import { formatDurationMin } from '#lib/duration.ts';
	import { fadeScale } from '#lib/motion.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { drag, endDrag, rowBefore, startDrag, submitMove } from './drag.svelte.ts';
	import type { Quest } from '#lib/server/db/schema.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import type { TaskFormResult } from '#lib/task-form.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/** One backlog list: a quest's tasks without a day (`key` = quest id), or `'other'`. */
	export interface BacklogGroup {
		key: string;
		name: string;
		color: string | null;
		open: TaskWithQuest[];
		done: TaskWithQuest[];
	}

	type Props = {
		/**
		 * Overdue tasks of any week (`listOverdue`): the group on top — rows drag onto a day
		 * (the rail), or move with "Today" / ⋯ (rail and sheet).
		 */
		overdue?: TaskWithQuest[];
		groups: BacklogGroup[];
		/** Quests for the "Add to backlog…" picker (respects the `?q=` filter). */
		quests: Quest[];
		/** Number of open backlog tasks shown. */
		count: number;
		/** Today's ISO day — target of the keyboard "Move to today" menu entry. */
		today: string;
		form?: TaskFormResult | null;
		/**
		 * Phones: the backlog's content in a bottom sheet (no rail chrome, no drag & drop);
		 * rows move to `day` (the day shown behind the sheet) instead of today, with a direct
		 * button per row.
		 */
		sheet?: boolean;
		day?: string;
	};
	let {
		overdue = [],
		groups,
		quests,
		count,
		today,
		form = null,
		sheet = false,
		day
	}: Props = $props();
	const t = useI18n();

	/** Where "Move to …" sends a row: the sheet's day, else today. */
	const moveDay = $derived(sheet && day ? day : today);
	const targetLabel = $derived(
		sheet && day
			? t.tasks.moveToDate(
					formatDayLabel(day, { weekday: 'long', month: 'short', day: 'numeric' }, t.intl)
				)
			: t.tasks.moveToToday
	);
	/** In the sheet, a row pulled into the day gives way softly (the rail stays as it was). */
	const rowOut = (node: Element) => (sheet ? fadeScale(node) : { duration: 0 });
	const targetShort = $derived(day ? formatDayLabel(day, { weekday: 'short' }, t.intl) : '');

	/** The rail shows a few overdue rows (its backlog stays in reach); the sheet shows all. */
	let overdueExpanded = $state(false);
	const overduePreview = $derived(
		previewOverdue(overdue, sheet || overdueExpanded, OVERDUE_RAIL_PREVIEW)
	);

	/** Client-only UI state: whether the rail is expanded (not worth a URL param). */
	let expanded = $state(true);

	let rail = $state<HTMLElement | undefined>();
	let moveForm = $state<HTMLFormElement | undefined>();
	/** Drop indicator: before which row, or at the end of which group (`end`). */
	let over = $state<{ beforeId: string | null; end: string } | null>(null);

	/** The dragged task's backlog list: its quest group, or the Other group. */
	const groupOf = (t: { kind: string; questId: string | null }) =>
		t.kind === 'quest' && t.questId ? t.questId : 'other';

	function target(y: number) {
		const task = drag.task;
		if (!task || !rail) return null;
		const key = groupOf(task);
		return { beforeId: rowBefore(rail, `li[data-group="${key}"]`, y), end: key };
	}

	function ondragover(e: DragEvent) {
		if (!drag.task) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		const next = target(e.clientY);
		if (next?.beforeId !== over?.beforeId || next?.end !== over?.end) over = next;
	}

	function ondragleave(e: DragEvent) {
		if (!rail?.contains(e.relatedTarget as Node | null)) over = null;
	}

	function ondrop(e: DragEvent) {
		if (!drag.task || !moveForm) return;
		e.preventDefault();
		const dest = target(e.clientY);
		over = null;
		submitMove(moveForm, '', dest?.beforeId ?? null);
	}

	function rowDragend() {
		over = null;
		endDrag();
	}
</script>

{#snippet addSlot()}
	<!-- The backlog's one add row, last (like every Plan list): a quest or Other. -->
	<div class="add-slot">
		<TaskAddForm
			action="addBacklog"
			placeholder={t.tasks.addToBacklog}
			row
			{quests}
			otherOption
			{form}
		/>
	</div>
{/snippet}

{#snippet groupList()}
	<div class="body">
		{#if overdue.length > 0}
			<div class="group overdue" style:--q="var(--overdue)" data-testid="overdue-group">
				<h3 class="group-head">
					<span class="dot" aria-hidden="true"></span>
					<span class="gname">{t.overdue.label}</span>
					<span class="count tabular">{overdue.length}</span>
				</h3>
				<!-- The same tasks have cards in the week's columns: no `data-task` here. -->
				<OverdueList
					tasks={overduePreview.shown}
					{today}
					grouped
					compact={!sheet}
					mark={false}
					ondragstart={sheet ? undefined : (e, task) => startDrag(e, task)}
					ondragend={sheet ? undefined : rowDragend}
					draggingId={drag.task?.id ?? null}
				/>
				{#if !sheet && (overduePreview.hidden > 0 || overdueExpanded)}
					<button
						type="button"
						class="more"
						aria-expanded={overdueExpanded}
						onclick={() => (overdueExpanded = !overdueExpanded)}
					>
						{overdueExpanded ? t.overdue.showLess : t.overdue.showAll(overdue.length)}
					</button>
				{/if}
			</div>
		{/if}
		{#each groups as group (group.key)}
			<div class="group" style:--q={questColorVar(group.color)}>
				<h3 class="group-head">
					<span class="dot" aria-hidden="true"></span>
					<span class="gname">{group.name}</span>
					<span class="count tabular">{group.open.length}</span>
				</h3>
				<ul class="rows">
					{#each [...group.open, ...group.done] as task (task.id)}
						<li
							class="row"
							class:done={task.doneAt !== null}
							class:drop-before={over?.beforeId === task.id}
							class:dragging={drag.task?.id === task.id}
							data-task={task.id}
							data-group={group.key}
							draggable={sheet ? undefined : 'true'}
							ondragstart={sheet ? undefined : (e) => startDrag(e, task)}
							ondragend={sheet ? undefined : rowDragend}
							out:rowOut
						>
							<form class="inline" method="POST" action={formAction('toggle')} use:enhance>
								<input type="hidden" name="taskId" value={task.id} />
								<button
									type="submit"
									class="check"
									aria-label={task.doneAt === null ? t.common.markDone : t.common.markNotDone}
								>
									{#if task.doneAt !== null}<Check size={11} strokeWidth={3} />{/if}
								</button>
							</form>
							<span class="rtitle">{task.title}</span>
							{#if task.durationMin !== null}
								<span class="dur tabular">{formatDurationMin(task.durationMin, t.intl)}</span>
							{/if}
							{#if sheet && task.doneAt === null}
								<!-- The sheet's job: pull a task into the day behind it, in one tap. -->
								<form class="inline" method="POST" action={formAction('moveTo')} use:enhance>
									<input type="hidden" name="taskId" value={task.id} />
									<input type="hidden" name="day" value={moveDay} />
									<input type="hidden" name="beforeId" value="" />
									<button type="submit" class="move" aria-label={`${targetLabel}: ${task.title}`}>
										<CalendarArrowDown size={14} />
										{targetShort}
									</button>
								</form>
							{/if}
							<Menu label={t.common.actionsFor(task.title)}>
								{#snippet children(close)}
									<form method="POST" action={formAction('moveTo')} use:enhance={() => close()}>
										<input type="hidden" name="taskId" value={task.id} />
										<input type="hidden" name="day" value={moveDay} />
										<input type="hidden" name="beforeId" value="" />
										<button type="submit" class="item" role="menuitem">
											<CalendarArrowDown size={14} />
											{targetLabel}
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
					{#if over?.beforeId === null && over.end === group.key}
						<li class="drop-end" aria-hidden="true"></li>
					{/if}
				</ul>
			</div>
		{/each}

		{#if over && over.beforeId === null && !groups.some((g) => g.key === over?.end)}
			<div class="drop-end" aria-hidden="true"></div>
		{/if}

		{#if groups.length === 0}
			<p class="muted empty">{t.tasks.backlogEmpty}</p>
		{/if}
		{@render addSlot()}
	</div>
{/snippet}

{#if sheet}
	<div class="sheet">
		{@render groupList()}
	</div>
{:else if expanded}
	<section
		class="rail"
		aria-label={t.common.backlog}
		bind:this={rail}
		{ondragover}
		{ondragleave}
		{ondrop}
	>
		<header class="rail-head">
			<h2 class="title">{t.common.backlog}</h2>
			<span class="count tabular" title={t.plan.openBacklog}>{count}</span>
			<button
				type="button"
				class="collapse"
				aria-label={t.plan.collapseBacklog}
				aria-expanded="true"
				onclick={() => (expanded = false)}
			>
				<ChevronLeft size={15} />
			</button>
		</header>

		{@render groupList()}

		<form method="POST" action={formAction('moveTo')} use:enhance bind:this={moveForm} hidden>
			<input type="hidden" name="taskId" value="" />
			<input type="hidden" name="day" value="" />
			<input type="hidden" name="beforeId" value="" />
		</form>
	</section>
{:else}
	<button
		type="button"
		class="rail-strip"
		aria-label={t.plan.expandBacklog}
		aria-expanded="false"
		onclick={() => (expanded = true)}
	>
		<ChevronRight size={14} />
		<span class="strip-label">{t.common.backlog}</span>
		<span class="count tabular">{count}</span>
	</button>
{/if}

<style>
	.rail {
		flex: 0 0 var(--plan-rail-w);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		min-width: 0;
		min-height: 0;
	}
	.rail-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-2);
	}
	.title {
		margin: 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}
	.count {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.collapse {
		margin-left: auto;
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
	}
	.collapse:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	/* Phones: the sheet body (the dialog brings title, padding and scrolling). */
	.sheet {
		--grouped-bg: var(--grouped-bg-raised);
		--grouped-separator: var(--grouped-separator-raised);
		display: grid;
		gap: var(--space-4);
	}
	.sheet .body {
		overflow: visible;
		gap: var(--space-5);
	}
	.sheet .row {
		cursor: default;
	}
	.sheet .rtitle {
		font-size: var(--fs-md);
	}
	.move {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 28px;
		padding: 0 var(--space-2);
		border: none;
		border-radius: var(--radius-pill);
		background: var(--toolbar-btn-bg-hover);
		color: var(--text-2);
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		white-space: nowrap;
	}
	.move:hover {
		color: var(--text);
	}
	.add-slot {
		flex: none;
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg);
		overflow: hidden;
	}
	.rail .add-slot :global(form.add.row) {
		padding-inline: var(--space-3);
	}

	.body {
		flex: 1;
		min-height: 0;
		display: grid;
		align-content: start;
		gap: var(--space-4);
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--border-strong) transparent;
	}
	/* One inset grouped list per quest (and Other, Overdue), its name above it. */
	.group {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}
	.group-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		padding: 0 var(--space-2);
		min-width: 0;
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
		color: var(--text-muted);
	}
	.sheet .group-head {
		padding: 0 var(--grouped-inset);
		font-size: var(--fs-label);
	}
	.dot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--q);
	}
	.gname {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.group-head .count {
		font-size: var(--fs-xs);
		font-weight: var(--fw-regular);
		letter-spacing: 0;
	}

	.rows {
		list-style: none;
		display: grid;
		margin: 0;
		padding: 0;
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg);
		overflow: hidden;
	}
	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
		min-height: var(--grouped-row-h);
		padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
		cursor: grab;
		transition: background var(--dur) var(--ease);
	}
	.sheet .row {
		padding-left: var(--grouped-inset);
	}
	@media (hover: hover) {
		.row:hover {
			background: var(--surface-hover);
		}
	}
	/* Hairline between rows, inset to the text. */
	.row + .row::after {
		content: '';
		position: absolute;
		top: 0;
		left: calc(var(--space-3) + var(--row-check) + var(--space-3));
		right: 0;
		height: 1px;
		background: var(--grouped-separator);
		pointer-events: none;
	}
	.sheet .row + .row::after {
		left: calc(var(--grouped-inset) + var(--row-check) + var(--space-3));
	}
	.row.dragging {
		opacity: 0.4;
	}
	/* 2px accent drop line on the row's top edge. */
	.row.drop-before::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: -1px;
		height: 2px;
		background: var(--accent);
		pointer-events: none;
		z-index: 1;
	}
	.done .rtitle {
		color: var(--text-faint);
		text-decoration: line-through;
	}
	.done .dur {
		opacity: 0.6;
	}
	.inline {
		display: contents;
	}
	.check {
		flex: none;
		display: grid;
		place-items: center;
		width: var(--row-check);
		height: var(--row-check);
		padding: 0;
		border: 1.5px solid var(--q);
		border-radius: 50%;
		background: transparent;
		color: var(--bg);
		transition: background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.check:hover {
			background: color-mix(in srgb, var(--q) 18%, transparent);
		}
	}
	.done .check {
		background: var(--q);
	}
	.rtitle {
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
		color: var(--text-muted);
	}
	.more {
		justify-self: start;
		padding: var(--space-1) var(--space-2);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--accent-text);
		font-size: var(--fs-xs);
	}
	.more:hover {
		background: var(--surface-hover);
	}
	.drop-end {
		height: 2px;
		background: var(--accent);
	}
	.empty {
		font-size: var(--fs-sm);
		padding: 0 var(--space-2);
	}

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

	/* Collapsed rail: a slim vertical strip at the board's left edge. */
	.rail-strip {
		flex: 0 0 40px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-3) 0;
		border: none;
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg);
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.rail-strip:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	.strip-label {
		writing-mode: vertical-rl;
		font-weight: var(--fw-semibold);
	}
</style>
