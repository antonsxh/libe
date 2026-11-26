<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { Check } from '@lucide/svelte';
	import { formAction } from '#lib/form-action.ts';
	import { rowIn } from '#lib/motion.ts';
	import type { Task } from '#lib/server/db/schema.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * One row of the quest detail's grouped lists (Backlog, Scheduled): a round check in the
	 * quest colour (`--q`, set by the list), the title, an optional second line (`sub`), an
	 * optional trailing text (`trail`) and an optional ⋯ menu (`menu`). The check is the
	 * page's `toggle` action; the title is struck once the server says "done".
	 */
	type Props = {
		task: Task;
		sub?: Snippet;
		trail?: Snippet;
		menu?: Snippet;
	};
	let { task, sub, trail, menu }: Props = $props();
	const t = useI18n();

	const done = $derived(task.doneAt !== null);
	/** The check pops on the tap; the tick draws once the server agrees. */
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

<li in:rowIn class="task" class:done class:struck={done} class:celebrate data-task={task.id}>
	<form class="inline" method="POST" action={formAction('toggle')} use:enhance={onToggle}>
		<input type="hidden" name="taskId" value={task.id} />
		<button
			type="submit"
			class="check"
			class:popping
			onanimationend={() => (popping = false)}
			aria-label={done ? t.common.markNotDone : t.common.markDone}
		>
			{#if done}<Check size={13} strokeWidth={3} />{/if}
		</button>
	</form>

	<span class="main">
		<span class="title"><span class="strike">{task.title}</span></span>
		{#if sub}<span class="sub">{@render sub()}</span>{/if}
	</span>

	{#if trail}<span class="trail tabular">{@render trail()}</span>{/if}
	{#if menu}<span class="menu-slot">{@render menu()}</span>{/if}
</li>

<style>
	.task {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--grouped-row-h);
		padding: var(--space-2) var(--space-2) var(--space-2) var(--grouped-inset);
		min-width: 0;
		transition: background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.task:hover {
			background: var(--surface-hover);
		}
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
		color: transparent;
		transition:
			background var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.check:hover {
			background: color-mix(in srgb, var(--q) 18%, transparent);
		}
	}
	.done .check {
		background: var(--q);
		color: var(--bg);
	}
	.check.popping {
		animation: check-pop var(--dur-pop) var(--ease-spring);
	}
	.celebrate .check :global(svg *) {
		stroke-dasharray: 24;
		animation: check-draw var(--dur-slow) var(--ease-out) both;
	}
	.celebrate .strike {
		animation: strike-in var(--dur-slow) var(--ease-out);
	}
	.main {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 1px;
		padding-right: var(--space-2);
	}
	.title {
		min-width: 0;
		overflow-wrap: anywhere;
		color: var(--text);
		font-size: var(--fs-md);
	}
	.done .title {
		color: var(--text-faint);
	}
	.sub {
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.done .sub {
		opacity: 0.6;
	}
	.trail {
		flex: none;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		white-space: nowrap;
	}
	.menu-slot {
		flex: none;
		display: inline-flex;
	}
</style>
