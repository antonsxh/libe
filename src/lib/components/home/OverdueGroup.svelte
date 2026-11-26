<script lang="ts">
	import { formAction } from '#lib/form-action.ts';
	import { enhance } from '$app/forms';
	import { ChevronDown } from '@lucide/svelte';
	import OverdueList from '#lib/components/tasks/OverdueList.svelte';
	import { previewOverdue } from '#lib/overdue.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Home's overdue tasks as tasks (O3a, every width): an inset grouped list above "Today" with
	 * "All to today" as the header action; the first rows (`OVERDUE_PREVIEW`) and "Show N more",
	 * which unfolds the rest in place. Absent while nothing is overdue.
	 */
	type Props = {
		/** `listOverdue` — most recent day first. */
		tasks: TaskWithQuest[];
		today: string;
	};
	let { tasks, today }: Props = $props();
	const t = useI18n();

	let expanded = $state(false);
	const preview = $derived(previewOverdue(tasks, expanded));
</script>

{#if tasks.length > 0}
	<section class="overdue" aria-labelledby="overdue-head" data-testid="overdue">
		<div class="head">
			<h2 id="overdue-head">
				<span class="dot" aria-hidden="true"></span>{t.overdue.heading(tasks.length)}
			</h2>
			<form method="POST" action={formAction('overdueTo')} use:enhance>
				<input type="hidden" name="all" value="1" />
				<input type="hidden" name="to" value="today" />
				<button type="submit" class="all">{t.overdue.allToToday}</button>
			</form>
		</div>
		<OverdueList tasks={preview.shown} {today} grouped>
			{#snippet more()}
				{#if preview.hidden > 0 || expanded}
					<button
						type="button"
						class="more"
						class:open={expanded}
						aria-expanded={expanded}
						onclick={() => (expanded = !expanded)}
					>
						{expanded ? t.overdue.showLess : t.homeList.showMore(preview.hidden)}
						<ChevronDown size={15} />
					</button>
				{/if}
			{/snippet}
		</OverdueList>
	</section>
{/if}

<style>
	.overdue {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: 0 var(--space-1);
	}
	h2 {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		letter-spacing: -0.01em;
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--overdue);
	}
	/* Header action, like iOS "Edit": plain accent text. */
	.all {
		padding: var(--space-1) var(--space-2);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--accent-text);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
	}
	@media (hover: hover) {
		.all:hover {
			background: var(--accent-soft);
		}
	}
	.more {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		width: 100%;
		min-height: var(--grouped-row-h);
		padding: var(--space-2) var(--grouped-inset) var(--space-2)
			calc(var(--grouped-inset) + var(--row-check) + var(--space-3));
		border: none;
		background: transparent;
		color: var(--accent-text);
		font-size: var(--fs-sm);
		text-align: left;
	}
	@media (hover: hover) {
		.more:hover {
			background: var(--surface-hover);
		}
	}
	.more :global(svg) {
		transition: transform var(--dur) var(--ease);
	}
	.more.open :global(svg) {
		transform: rotate(180deg);
	}
</style>
