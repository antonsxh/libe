<script lang="ts">
	import { formatDayLabel, formatHours } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { formatHMin, type ReviewDay, type ReviewQuest } from '#lib/review.ts';

	type Props = {
		days: ReviewDay[];
		/** Quests that appear in `days[].byQuest`, by id. */
		quests: Record<string, ReviewQuest>;
	};
	let { days, quests }: Props = $props();

	/** Smallest full-scale value (minutes) so a 10-minute week doesn't fill the chart. */
	const MIN_SCALE = 60;
	const scale = $derived(Math.max(MIN_SCALE, ...days.map((d) => d.questMin)));

	const weekday = (day: string) => formatDayLabel(day, { weekday: 'short' });
	const longDay = (day: string) =>
		formatDayLabel(day, { weekday: 'short', month: 'short', day: 'numeric' });

	function ariaLabel(d: ReviewDay): string {
		const parts = d.byQuest.map(
			(q) => `${quests[q.questId]?.name ?? 'Quest'} ${formatHMin(q.min)}`
		);
		const quest = `${longDay(d.day)}: ${formatHMin(d.questMin)} quest work`;
		const other = d.otherMin > 0 ? `, other ${formatHMin(d.otherMin)}` : '';
		return parts.length ? `${quest} (${parts.join(', ')})${other}` : `${quest}${other}`;
	}
</script>

<section class="card chart" aria-labelledby="per-day-label">
	<h2 class="label" id="per-day-label">Quest hours · per day</h2>
	<ol class="bars">
		{#each days as d, i (d.day)}
			{@const stub = d.state === 'future' || d.questMin <= 0}
			<li class="col" data-state={d.state} class:first={i === 0} class:last={i === days.length - 1}>
				<button
					type="button"
					class="hit"
					aria-label={ariaLabel(d)}
					aria-describedby={`tip-${d.day}`}
					data-testid="day-bar"
					data-day={d.day}
				>
					<span class="value tabular" class:zero={d.questMin <= 0} data-testid="day-value">
						{formatHours(d.questMin / 60)}
					</span>
					<span class="plot">
						<span
							class="bar"
							class:stub
							style:height={stub ? undefined : `${(d.questMin / scale) * 100}%`}
						></span>
					</span>
					<span class="weekday">{weekday(d.day)}</span>
				</button>
				<div class="tip" role="tooltip" id={`tip-${d.day}`}>
					<p class="tip-head">
						<span>{longDay(d.day)}</span>
						<strong class="tabular">{formatHMin(d.questMin)}</strong>
					</p>
					{#if d.byQuest.length}
						<ul>
							{#each d.byQuest as q (q.questId)}
								{@const quest = quests[q.questId]}
								<li>
									<span class="dot" style:--q={questColorVar(quest?.color)}></span>
									<span class="name">{quest?.name ?? 'Quest'}</span>
									<span class="tabular">{formatHMin(q.min)}</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="none">No quest work</p>
					{/if}
					{#if d.otherMin > 0}
						<p class="other">
							<span>Other</span>
							<span class="tabular">{formatHMin(d.otherMin)}</span>
						</p>
					{/if}
				</div>
			</li>
		{/each}
	</ol>
</section>

<style>
	.chart {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding: var(--space-6);
		border-radius: var(--radius-xl);
		min-width: 0;
	}
	.bars {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.col {
		position: relative;
		display: flex;
		min-width: 0;
	}
	.hit {
		flex: 1;
		display: grid;
		grid-template-rows: auto minmax(var(--chart-h), 1fr) auto;
		justify-items: center;
		gap: var(--space-2);
		padding: 0 0 var(--space-1);
		min-width: 0;
		background: transparent;
		border: none;
		border-radius: var(--radius-md);
		cursor: default;
	}
	.value {
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.value.zero {
		color: var(--text-faint);
	}
	.plot {
		display: flex;
		align-items: flex-end;
		justify-content: center;
		width: 100%;
	}
	.bar {
		width: min(var(--chart-bar-w), 70%);
		min-height: 2px;
		border-radius: var(--chart-radius);
		background: var(--bar-muted);
		transition:
			height var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.bar.stub {
		height: 2px;
		border-radius: 1px;
	}
	.weekday {
		font-size: var(--fs-sm);
		color: var(--text-faint);
	}
	.col[data-state='today'] .value,
	.col[data-state='today'] .weekday {
		color: var(--accent);
	}
	.col[data-state='today'] .bar {
		background: var(--accent);
	}
	.col[data-state='today'] .bar.stub {
		background: var(--bar-muted);
	}
	.hit:hover .bar:not(.stub) {
		background: color-mix(in srgb, var(--bar-muted) 70%, var(--text-muted));
	}
	.col[data-state='today'] .hit:hover .bar:not(.stub) {
		background: var(--accent-hover);
	}

	/* ── tooltip ─────────────────────────────────────────── */
	.tip {
		position: absolute;
		top: calc(var(--fs-sm) * 1.45 + var(--space-3));
		left: 50%;
		z-index: 5;
		display: none;
		width: max-content;
		min-width: 160px;
		max-width: 240px;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		background: var(--surface-2);
		box-shadow: var(--shadow-pop);
		font-size: var(--fs-xs);
		color: var(--text-2);
		transform: translateX(-50%);
		pointer-events: none;
	}
	.col.first .tip {
		left: 0;
		transform: none;
	}
	.col.last .tip {
		left: auto;
		right: 0;
		transform: none;
	}
	.col:hover .tip,
	.col:focus-within .tip {
		display: grid;
		gap: var(--space-2);
	}
	.tip-head,
	.tip li,
	.other {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.tip-head {
		justify-content: space-between;
		color: var(--text-muted);
	}
	.tip-head strong {
		color: var(--text);
		font-weight: var(--fw-medium);
	}
	.tip ul {
		display: grid;
		gap: var(--space-1);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.dot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--q);
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.none {
		color: var(--text-faint);
	}
	.other {
		justify-content: space-between;
		padding-top: var(--space-2);
		border-top: 1px solid var(--border);
		color: var(--text-muted);
	}

	@media (max-width: 640px) {
		.chart {
			padding: var(--space-4);
		}
		.value,
		.weekday {
			font-size: var(--fs-xs);
		}
	}
</style>
