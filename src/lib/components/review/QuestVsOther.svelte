<script lang="ts">
	import { formatHours } from '#lib/dates.ts';
	import { percent } from '#lib/review.ts';

	type Props = { questMin: number; otherMin: number };
	let { questMin, otherMin }: Props = $props();

	const total = $derived(questMin + otherMin);
	const share = $derived(total > 0 ? (questMin / total) * 100 : 0);
	const summary = $derived(
		total > 0
			? `Quest work ${formatHours(questMin / 60)} (${percent(questMin, total)}%), other ${formatHours(otherMin / 60)}`
			: 'No time logged this week'
	);
</script>

<section class="card panel" aria-labelledby="split-label">
	<h2 class="label" id="split-label">Quest work vs other</h2>
	<div class="stack" role="img" aria-label={summary}>
		<span class="quest" style:width={`${share}%`}></span>
	</div>
	<p class="legend">
		<span class="item quest-item">
			<span class="dot"></span>
			<span>
				Quest work · <span class="tabular" data-testid="split-quest">
					{formatHours(questMin / 60)}
				</span>
			</span>
		</span>
		<span class="item other-item">
			<span class="dot"></span>
			<span>
				Other · <span class="tabular" data-testid="split-other">{formatHours(otherMin / 60)}</span>
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
	.stack {
		height: var(--chart-stack-h);
		border-radius: var(--chart-radius);
		background: var(--track);
		overflow: hidden;
	}
	.quest {
		display: block;
		height: 100%;
		background: var(--accent);
		transition: width var(--dur) var(--ease);
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
	.quest-item .dot {
		background: var(--accent);
	}
	.other-item {
		color: var(--text-muted);
	}
	.other-item .dot {
		background: var(--bar-muted);
	}

	@media (max-width: 640px) {
		.panel {
			padding: var(--space-4);
		}
	}
</style>
