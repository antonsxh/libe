<script lang="ts">
	import DayTimeline from '#lib/components/home/DayTimeline.svelte';
	import type { BlockWithTask } from '#lib/server/blocks.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Home's daily plan in the slim right column (wider screens): the timeline around now
	 * (`nowWindow`), with a toggle to the whole day in place. Blocks are created from a task's
	 * ⋯ "Time-block…" and edited by clicking them (`onedit`).
	 */
	type Props = {
		blocks: BlockWithTask[];
		now: number;
		onedit: (block: BlockWithTask) => void;
	};
	let { blocks, now, onedit }: Props = $props();
	const t = useI18n();

	let whole = $state(false);
</script>

<section class="plan" aria-labelledby="day-plan-head">
	<div class="head">
		<h2 id="day-plan-head">{t.homeList.dailyPlan}</h2>
		<button type="button" class="toggle" aria-pressed={whole} onclick={() => (whole = !whole)}>
			{whole ? t.homeList.nextHours : t.homeList.wholeDay}
		</button>
	</div>
	{#key whole}
		<DayTimeline {blocks} {now} range={whole ? 'day' : 'now'} {onedit} />
	{/key}
	{#if blocks.length === 0}
		<p class="hint">{t.homeList.planHint}</p>
	{/if}
</section>

<style>
	.plan {
		display: grid;
		padding: var(--space-3) 0 var(--space-2);
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: 0 var(--space-2) 0 var(--grouped-inset);
	}
	h2 {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
	}
	.toggle {
		padding: var(--space-1) var(--space-2);
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--accent-text);
		font-size: var(--fs-sm);
	}
	@media (hover: hover) {
		.toggle:hover {
			background: var(--accent-soft);
		}
	}
	.hint {
		padding: 0 var(--grouped-inset) var(--space-1);
		color: var(--text-faint);
		font-size: var(--fs-xs);
	}
</style>
