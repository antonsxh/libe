<script lang="ts">
	import { formatDurationMin } from '#lib/duration.ts';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { ArrowDown, ArrowUp, Check, Trash2 } from '@lucide/svelte';
	import type { Task } from '#lib/server/db/schema.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	let {
		task,
		first = false,
		last = false
	}: {
		task: Task;
		/** Disable "move up" for the first row of its list. */
		first?: boolean;
		/** Disable "move down" for the last row of its list. */
		last?: boolean;
	} = $props();
	const t = useI18n();

	const done = $derived(task.doneAt !== null);
	/** The check pops on the tap; the title is struck once the server confirms "done". */
	let popping = $state(false);
	let celebrate = $state(false);
	const onToggle: SubmitFunction = () => {
		const wasDone = done;
		popping = true;
		celebrate = false;
		return async ({ update }) => {
			await update();
			celebrate = !wasDone && done;
		};
	};
</script>

<li class="task card" class:done class:struck={done} class:celebrate>
	<form class="inline" method="POST" action="?/toggle" use:enhance={onToggle}>
		<input type="hidden" name="taskId" value={task.id} />
		<button
			type="submit"
			class="check"
			class:popping
			onanimationend={() => (popping = false)}
			aria-label={task.doneAt ? t.common.markNotDone : t.common.markDone}
		>
			{#if task.doneAt !== null}<Check size={14} strokeWidth={3} />{/if}
		</button>
	</form>

	<span class="title"><span class="strike">{task.title}</span></span>

	{#if task.durationMin !== null}
		<span class="dur muted tabular">{formatDurationMin(task.durationMin, t.intl)}</span>
	{/if}

	<span class="ops">
		<form class="inline" method="POST" action="?/moveUp" use:enhance>
			<input type="hidden" name="taskId" value={task.id} />
			<button type="submit" class="op" aria-label={t.common.moveUp} disabled={first}>
				<ArrowUp size={15} />
			</button>
		</form>
		<form class="inline" method="POST" action="?/moveDown" use:enhance>
			<input type="hidden" name="taskId" value={task.id} />
			<button type="submit" class="op" aria-label={t.common.moveDown} disabled={last}>
				<ArrowDown size={15} />
			</button>
		</form>
		<form class="inline" method="POST" action="?/delete" use:enhance>
			<input type="hidden" name="taskId" value={task.id} />
			<button type="submit" class="op danger" aria-label={t.common.deleteTask}>
				<Trash2 size={15} />
			</button>
		</form>
	</span>
</li>

<style>
	.task {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
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
	/* Done = the quest's colour, like the day cards (not the accent). */
	.done .check {
		border-color: var(--q, var(--control-on));
		background: var(--q, var(--control-on));
		color: var(--bg);
	}

	.title {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.done .title {
		color: var(--text-faint);
	}
	.celebrate .strike {
		animation: strike-in var(--dur-slow) var(--ease-out);
	}
	.celebrate .check :global(svg *) {
		stroke-dasharray: 24;
		animation: check-draw var(--dur-slow) var(--ease-out) both;
	}
	.check.popping {
		animation: check-pop var(--dur-pop) var(--ease-spring);
	}

	.dur {
		flex: none;
		font-size: var(--fs-xs);
	}

	.ops {
		flex: none;
		display: flex;
		gap: var(--space-1);
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
	.op.danger:hover:not(:disabled) {
		color: var(--danger);
	}
</style>
