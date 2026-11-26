<script lang="ts">
	import { addDays, formatDayLabel, formatHours, startOfWeek } from '#lib/dates.ts';
	import { formatDurationMin } from '#lib/duration.ts';
	import { quarterWeekTotals, type ReviewQuarter } from '#lib/review.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Review on phones, Quarter: quest hours per week of the quarter (the week view's day bars
	 * one level up). Every week of the quarter has a column — the ones still ahead are stubs —
	 * and the shown week's bar is lighter. Plain divs; the values are listed for screen readers.
	 */
	type Props = { quarter: ReviewQuarter };
	let { quarter }: Props = $props();
	const t = useI18n();

	/** All Mondays of the quarter (`quarter.weeks` stops at the later of today and the shown week). */
	const mondays = $derived.by(() => {
		const out: string[] = [];
		for (let m = startOfWeek(quarter.start); m <= quarter.end; m = addDays(m, 7)) out.push(m);
		return out;
	});
	const totals = $derived(quarterWeekTotals(quarter));
	const scale = $derived(Math.max(60, ...totals));
	const total = $derived(quarter.quests.reduce((s, r) => s + r.quarterMin, 0));
	const label = (day: string) => formatDayLabel(day, { month: 'short', day: 'numeric' }, t.intl);
</script>

<section class="card chart" aria-labelledby="per-week-label">
	<header class="head">
		<h2 class="label" id="per-week-label">{t.review.phone.perWeekChart}</h2>
		<span class="total tabular">{formatHours(total / 60, t.intl)}</span>
	</header>
	<ol class="bars" style:--n={mondays.length} aria-hidden="true">
		{#each mondays as monday, i (monday)}
			{@const min = i < totals.length ? totals[i] : 0}
			<li
				class="col"
				class:shown={i === quarter.shownIndex}
				class:stub={i >= totals.length || min <= 0}
				data-testid="week-bar"
			>
				<span class="bar" style:height={min > 0 ? `${(min / scale) * 100}%` : undefined}></span>
			</li>
		{/each}
	</ol>
	<p class="axis tabular" aria-hidden="true">
		<span>{label(quarter.start)}</span>
		<span>{label(quarter.end)}</span>
	</p>
	<ul class="sr-only">
		{#each totals as min, i (quarter.weeks[i])}
			<li>{t.review.phone.weekAria(label(quarter.weeks[i]), formatDurationMin(min, t.intl))}</li>
		{/each}
	</ul>
</section>

<style>
	.chart {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: var(--radius-lg);
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.total {
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.bars {
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: var(--space-1);
		height: var(--chart-h-compact);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.col {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		min-width: 0;
	}
	.bar {
		width: min(var(--chart-bar-w), 80%);
		min-height: 2px;
		border-radius: var(--chart-radius);
		background: var(--bar-muted);
	}
	.stub .bar {
		height: 2px;
		border-radius: 1px;
	}
	.shown:not(.stub) .bar {
		background: var(--progress-fill);
	}
	.axis {
		display: flex;
		justify-content: space-between;
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
</style>
