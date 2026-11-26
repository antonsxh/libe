<script lang="ts">
	import { formatHours } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { percent, splitSegments, type QuestWeekRow } from '#lib/review.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		questMin: number;
		otherMin: number;
		/** The week's quest rows (most first): the bar's segments in their quest colours. */
		rows: QuestWeekRow[];
	};
	let { questMin, otherMin, rows }: Props = $props();
	const t = useI18n();
	const hours = (h: number) => formatHours(h, t.intl);

	const total = $derived(questMin + otherMin);
	const segments = $derived(splitSegments(rows, otherMin));
	const summary = $derived(
		total > 0
			? t.review.split(hours(questMin / 60), percent(questMin, total), hours(otherMin / 60))
			: t.review.noTimeThisWeek
	);
</script>

<section class="card panel" aria-labelledby="split-label">
	<h2 class="label" id="split-label">{t.review.questVsOther}</h2>
	<div class="stack" role="img" aria-label={summary}>
		{#each segments as seg (seg.key)}
			<span class="seg" style:--q={questColorVar(seg.color)} style:flex-grow={seg.min}></span>
		{/each}
	</div>
	<p class="legend">
		<span class="item quest-item">
			<span>
				{t.review.questWorkLegend} ·
				<span class="tabular" data-testid="split-quest">
					{hours(questMin / 60)}
				</span>
			</span>
		</span>
		<span class="item other-item">
			<span class="dot"></span>
			<span>
				{t.common.other} ·
				<span class="tabular" data-testid="split-other">
					{hours(otherMin / 60)}
				</span>
			</span>
		</span>
	</p>
</section>

<style>
	.panel {
		display: grid;
		align-content: start;
		gap: var(--space-5);
		padding: var(--space-6);
		border-radius: var(--radius-xl);
		min-width: 0;
	}
	/* Quest work in its quest colours, Other in slate — no accent (it isn't "now"). */
	.stack {
		display: flex;
		gap: var(--chart-seg-gap);
		height: var(--chart-stack-h);
		border-radius: var(--chart-radius);
		background: var(--track);
		overflow: hidden;
	}
	.seg {
		flex: 0 1 0;
		min-width: var(--chart-seg-gap);
		background: var(--q);
		transition: flex-grow var(--dur) var(--ease);
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-8);
		font-size: var(--fs-md);
	}
	.item {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		white-space: nowrap;
	}
	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
	}
	.quest-item {
		color: var(--text-2);
	}
	.other-item {
		color: var(--text-muted);
	}
	.other-item .dot {
		background: var(--quest-slate);
	}

	@media (max-width: 640px) {
		.panel {
			padding: var(--space-4);
		}
	}
</style>
