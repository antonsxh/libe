<script lang="ts">
	import { formAction } from '#lib/form-action.ts';
	import { enhance } from '$app/forms';
	import {
		ArrowDown,
		ArrowLeft,
		ArrowRight,
		ArrowUp,
		CalendarPlus,
		Check,
		Play,
		Trash2
	} from '@lucide/svelte';
	import Menu from '#lib/components/Menu.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import { formatDuration } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';

	let {
		task,
		/** Milliseconds logged to this task via completed sessions. */
		loggedMs = 0,
		first = false,
		last = false,
		variant = 'home',
		dropBefore = false,
		dragging = false,
		ondragstart,
		ondragend,
		ontimeblock
	}: {
		task: TaskWithQuest;
		loggedMs?: number;
		/** Disable "move up" for the first row of its list. */
		first?: boolean;
		/** Disable "move down" for the last row of its list. */
		last?: boolean;
		/** `plan` = compact board card with prev/next-day menu entries. */
		variant?: 'home' | 'plan';
		/** Render the amber drop-indicator line above the card. */
		dropBefore?: boolean;
		/** This card is the one being dragged (rendered faded). */
		dragging?: boolean;
		/** When set, the card is an HTML5 drag source (plan board). */
		ondragstart?: (e: DragEvent, task: TaskWithQuest) => void;
		ondragend?: (e: DragEvent) => void;
		/** Opens the "Time-block…" dialog for this task (home only). */
		ontimeblock?: (task: TaskWithQuest) => void;
	} = $props();

	const done = $derived(task.doneAt !== null);
	const color = $derived(questColorVar(task.questColor));
</script>

<li
	class="task card"
	class:done
	class:plan={variant === 'plan'}
	class:drop-before={dropBefore}
	class:dragging
	data-task={task.id}
	style:--q={color}
	draggable={ondragstart ? 'true' : undefined}
	ondragstart={ondragstart && ((e) => ondragstart(e, task))}
	{ondragend}
>
	<div class="top">
		<span class="title">{task.title}</span>
	</div>

	<div class="meta">
		<form class="inline" method="POST" action={formAction('toggle')} use:enhance>
			<input type="hidden" name="taskId" value={task.id} />
			<button type="submit" class="check" aria-label={done ? 'Mark as not done' : 'Mark as done'}>
				{#if done}<Check size={13} strokeWidth={3} />{/if}
			</button>
		</form>

		{#if task.questId && task.questName}
			<QuestPill color={task.questColor} label={task.questName} />
		{/if}

		{#if loggedMs > 0}
			<span class="logged tabular">
				<span class="dot" aria-hidden="true"></span>{formatDuration(loggedMs)}
			</span>
		{:else if task.durationMin !== null}
			<span class="planned muted tabular">{formatDuration(task.durationMin * 60_000)}</span>
		{/if}

		<!-- Home: inline with the meta row; plan: its own row under the pill. -->
		<span class="tail">
			{#if !done}
				<a
					class="play"
					href={`/focus?task=${task.id}`}
					aria-label="Start focus timer for this task"
				>
					<Play size={14} />
				</a>
			{/if}

			<span class="ops">
				<form class="inline" method="POST" action={formAction('moveUp')} use:enhance>
					<input type="hidden" name="taskId" value={task.id} />
					<button type="submit" class="op" aria-label="Move up" disabled={first}>
						<ArrowUp size={15} />
					</button>
				</form>
				<form class="inline" method="POST" action={formAction('moveDown')} use:enhance>
					<input type="hidden" name="taskId" value={task.id} />
					<button type="submit" class="op" aria-label="Move down" disabled={last}>
						<ArrowDown size={15} />
					</button>
				</form>
			</span>

			<span class="menu-slot">
				<Menu label={`Actions for ${task.title}`}>
					{#snippet children(close)}
						{#if variant === 'home' && ontimeblock}
							<button
								type="button"
								class="item"
								role="menuitem"
								onclick={() => {
									close();
									ontimeblock(task);
								}}
							>
								<CalendarPlus size={14} /> Time-block…
							</button>
						{:else if variant === 'plan'}
							<form method="POST" action={formAction('prevDay')} use:enhance={() => close()}>
								<input type="hidden" name="taskId" value={task.id} />
								<button type="submit" class="item" role="menuitem">
									<ArrowLeft size={14} /> Move to previous day
								</button>
							</form>
							<form method="POST" action={formAction('nextDay')} use:enhance={() => close()}>
								<input type="hidden" name="taskId" value={task.id} />
								<button type="submit" class="item" role="menuitem">
									<ArrowRight size={14} /> Move to next day
								</button>
							</form>
						{/if}
						<form method="POST" action={formAction('toBacklog')} use:enhance={() => close()}>
							<input type="hidden" name="taskId" value={task.id} />
							<button type="submit" class="item" role="menuitem">Move to backlog</button>
						</form>
						{#if variant === 'home'}
							<form method="POST" action={formAction('toTomorrow')} use:enhance={() => close()}>
								<input type="hidden" name="taskId" value={task.id} />
								<button type="submit" class="item" role="menuitem">Move to tomorrow</button>
							</form>
						{/if}
						<form method="POST" action={formAction('deleteTask')} use:enhance={() => close()}>
							<input type="hidden" name="taskId" value={task.id} />
							<button type="submit" class="item danger" role="menuitem">
								<Trash2 size={14} /> Delete
							</button>
						</form>
					{/snippet}
				</Menu>
			</span>
		</span>
	</div>
</li>

<style>
	.task {
		position: relative;
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4) var(--space-3) calc(var(--space-4) + 3px);
		min-width: 0;
		transition:
			border-color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.task:hover {
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}
	/* Quest colour bar on the left edge. */
	.task::before {
		content: '';
		position: absolute;
		left: -1px;
		top: -1px;
		bottom: -1px;
		width: 3px;
		border-radius: var(--radius-lg) 0 0 var(--radius-lg);
		background: var(--q);
	}
	/* Drop indicator: a 2px amber line centred in the gap above the card. */
	.drop-before::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: calc(-1 * var(--space-1) - 2px);
		height: 2px;
		border-radius: 1px;
		background: var(--accent);
		pointer-events: none;
	}
	.dragging {
		opacity: 0.4;
	}
	.task[draggable='true'] {
		cursor: grab;
	}
	/* Compact board card (plan). */
	.plan {
		padding: var(--space-2) var(--space-3) var(--space-2) calc(var(--space-3) + 3px);
		gap: var(--space-1);
		border-radius: var(--radius-md);
	}
	.plan .title {
		font-size: var(--fs-md);
	}
	.plan .meta {
		gap: var(--space-1) var(--space-2);
	}
	.tail {
		display: contents;
	}
	.plan .tail {
		display: flex;
		align-items: center;
		flex-basis: 100%;
		gap: var(--space-1);
		margin-left: calc(-1 * var(--space-1));
	}
	.plan .meta :global(.pill) {
		min-width: 0;
		height: 24px;
		padding: 0 var(--space-2);
		font-size: var(--fs-xs);
	}
	.plan .planned,
	.plan .logged {
		font-size: var(--fs-xs);
	}
	.plan .play {
		width: 24px;
		height: 24px;
	}
	.plan .check {
		width: 18px;
		height: 18px;
	}
	.plan .op {
		width: 24px;
		height: 24px;
	}
	.done {
		opacity: 0.55;
	}
	.done .title {
		color: var(--text-faint);
		text-decoration: line-through;
	}

	.top {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}
	.title {
		flex: 1;
		min-width: 0;
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
		overflow-wrap: anywhere;
	}
	.menu-slot {
		position: relative;
		z-index: 2;
		flex: none;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}
	.inline {
		display: contents;
	}

	.check {
		flex: none;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border: 1.5px solid var(--border-strong);
		border-radius: 50%;
		background: transparent;
		color: transparent;
		transition:
			border-color var(--dur) var(--ease),
			background var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}
	.check:hover {
		border-color: var(--text-muted);
	}
	.done .check {
		border-color: var(--q);
		background: var(--q);
		color: var(--bg);
	}

	.logged {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.logged .dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--q);
	}
	.planned {
		font-size: var(--fs-sm);
	}

	.play {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		color: var(--text-faint);
		transition:
			color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.play:hover {
		color: var(--text);
		background: var(--surface-hover);
	}

	.ops {
		flex: none;
		display: flex;
		gap: var(--space-1);
		margin-left: auto;
	}
	.op {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-faint);
		transition:
			color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.op:hover:not(:disabled) {
		color: var(--text);
		background: var(--surface-hover);
	}
	.op:disabled {
		opacity: 0.35;
		cursor: not-allowed;
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
	.item:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text);
	}
	.item.danger {
		color: var(--danger);
	}
</style>
