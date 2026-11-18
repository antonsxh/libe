<script lang="ts">
	import { formAction } from '#lib/form-action.ts';
	import { enhance } from '$app/forms';
	import { CalendarArrowDown, Check, ChevronLeft, ChevronRight, Trash2 } from '@lucide/svelte';
	import Menu from '#lib/components/Menu.svelte';
	import TaskAddForm from '#lib/components/tasks/TaskAddForm.svelte';
	import { formatDuration } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { drag, endDrag, rowBefore, startDrag, submitMove } from './drag.svelte.ts';
	import type { Quest } from '#lib/server/db/schema.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import type { TaskFormResult } from '#lib/task-form.ts';

	/** One backlog list: a quest's tasks without a day (`key` = quest id), or `'other'`. */
	export interface BacklogGroup {
		key: string;
		name: string;
		color: string | null;
		open: TaskWithQuest[];
		done: TaskWithQuest[];
	}

	type Props = {
		groups: BacklogGroup[];
		/** Quests for the "Add to backlog…" picker (respects the `?q=` filter). */
		quests: Quest[];
		/** Number of open backlog tasks shown. */
		count: number;
		/** Today's ISO day — target of the keyboard "Move to today" menu entry. */
		today: string;
		form?: TaskFormResult | null;
	};
	let { groups, quests, count, today, form = null }: Props = $props();

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

{#if expanded}
	<section class="rail" aria-label="Backlog" bind:this={rail} {ondragover} {ondragleave} {ondrop}>
		<header class="rail-head">
			<h2 class="title">Backlog</h2>
			<span class="count tabular" title="Open backlog tasks">{count}</span>
			<button
				type="button"
				class="collapse"
				aria-label="Collapse backlog"
				aria-expanded="true"
				onclick={() => (expanded = false)}
			>
				<ChevronLeft size={15} />
			</button>
		</header>

		<div class="add-slot">
			<TaskAddForm action="addBacklog" placeholder="Add to backlog…" compact {quests} {form} />
		</div>

		<div class="body">
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
								draggable="true"
								ondragstart={(e) => startDrag(e, task)}
								ondragend={rowDragend}
							>
								<form class="inline" method="POST" action={formAction('toggle')} use:enhance>
									<input type="hidden" name="taskId" value={task.id} />
									<button
										type="submit"
										class="check"
										aria-label={task.doneAt === null ? 'Mark as done' : 'Mark as not done'}
									>
										{#if task.doneAt !== null}<Check size={11} strokeWidth={3} />{/if}
									</button>
								</form>
								<span class="rtitle">{task.title}</span>
								{#if task.durationMin !== null}
									<span class="dur tabular">{formatDuration(task.durationMin * 60_000)}</span>
								{/if}
								<Menu label={`Actions for ${task.title}`}>
									{#snippet children(close)}
										<form method="POST" action={formAction('moveTo')} use:enhance={() => close()}>
											<input type="hidden" name="taskId" value={task.id} />
											<input type="hidden" name="day" value={today} />
											<input type="hidden" name="beforeId" value="" />
											<button type="submit" class="item" role="menuitem">
												<CalendarArrowDown size={14} /> Move to today
											</button>
										</form>
										<form
											method="POST"
											action={formAction('deleteTask')}
											use:enhance={() => close()}
										>
											<input type="hidden" name="taskId" value={task.id} />
											<button type="submit" class="item danger" role="menuitem">
												<Trash2 size={14} /> Delete
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
				<p class="muted empty">Nothing waiting in the backlog.</p>
			{/if}
		</div>

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
		aria-label="Expand backlog"
		aria-expanded="false"
		onclick={() => (expanded = true)}
	>
		<ChevronRight size={14} />
		<span class="strip-label">Backlog</span>
		<span class="count tabular">{count}</span>
	</button>
{/if}

<style>
	.rail {
		flex: 0 0 240px;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		min-width: 0;
		min-height: 0;
		padding: var(--space-3) var(--space-2) var(--space-2);
		border: 1px dashed var(--border-dashed);
		border-radius: var(--radius-lg);
	}
	.rail-head {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: 0 var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--border);
	}
	.title {
		margin: 0;
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
		color: var(--text-muted);
	}
	.count {
		font-size: var(--fs-sm);
		color: var(--text-faint);
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
	.add-slot :global(form.add) {
		margin-bottom: 0;
		padding-left: var(--space-3);
	}

	.body {
		flex: 1;
		min-height: 0;
		display: grid;
		align-content: start;
		gap: var(--space-3);
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: var(--border-strong) transparent;
	}
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
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
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
		letter-spacing: 0;
	}

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
		gap: var(--space-2);
		min-width: 0;
		padding: var(--space-1) var(--space-1) var(--space-1) calc(var(--space-2) + 2px);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		cursor: grab;
	}
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
	.row:hover {
		border-color: var(--border-strong);
	}
	.row.dragging {
		opacity: 0.4;
	}
	/* 2px amber drop line centred in the 4px gap above the row. */
	.row.drop-before::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: -4px;
		height: 2px;
		border-radius: 1px;
		background: var(--accent);
		pointer-events: none;
	}
	.done {
		opacity: 0.55;
	}
	.done .rtitle {
		color: var(--text-faint);
		text-decoration: line-through;
	}
	.inline {
		display: contents;
	}
	.check {
		flex: none;
		display: grid;
		place-items: center;
		width: 16px;
		height: 16px;
		padding: 0;
		border: 1.5px solid var(--border-strong);
		border-radius: 50%;
		background: transparent;
		color: var(--bg);
	}
	.check:hover {
		border-color: var(--text-muted);
	}
	.done .check {
		border-color: var(--q);
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
	.drop-end {
		height: 2px;
		border-radius: 1px;
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
		border: 1px dashed var(--border-dashed);
		border-radius: var(--radius-lg);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.rail-strip:hover {
		color: var(--text);
		border-color: var(--border-strong);
	}
	.strip-label {
		writing-mode: vertical-rl;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		font-weight: var(--fw-medium);
	}
</style>
