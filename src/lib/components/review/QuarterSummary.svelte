<script lang="ts">
	import Sparkline from '#lib/components/Sparkline.svelte';
	import { formatDayLabel, formatHours } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { percent, type ReviewQuarter } from '#lib/review.ts';

	type Props = { quarter: ReviewQuarter };
	let { quarter }: Props = $props();

	const weekLabel = (monday: string) => formatDayLabel(monday, { month: 'short', day: 'numeric' });
	const weeksText = $derived(
		`${Math.round(quarter.weeksElapsed * 10) / 10} week${quarter.weeksElapsed === 1 ? '' : 's'}`
	);
</script>

<section class="quarter" aria-labelledby="quarter-label">
	<header class="head">
		<h2 class="label" id="quarter-label">This quarter</h2>
		<span class="period muted" data-testid="quarter-label">
			{quarter.label} · {quarter.rangeLabel}
		</span>
	</header>

	<p class="summary">
		<strong class="big tabular" data-testid="quarter-quest">
			{formatHours(quarter.questMin / 60)}
		</strong>
		<span class="muted">
			quest work{#if quarter.budgetMin > 0}<span class="tabular">
					{` / ${formatHours(quarter.budgetMin / 60)} target (${weeksText})`}
				</span>{/if}
		</span>
		<span class="sep" aria-hidden="true">·</span>
		<strong class="mid tabular" data-testid="quarter-other">
			{formatHours(quarter.otherMin / 60)}
		</strong>
		<span class="muted">other work</span>
	</p>

	{#if quarter.quests.length}
		<ul class="grid">
			{#each quarter.quests as r (r.quest.id)}
				{@const color = questColorVar(r.quest.color)}
				{@const pct = r.budgetMin ? percent(r.quarterMin, r.budgetMin) : null}
				<li
					class="card qcard"
					class:closed={r.quest.closed}
					data-testid="quarter-row"
					data-quest={r.quest.id}
				>
					<div class="top">
						<span class="tile" aria-hidden="true">{r.quest.icon}</span>
						<a class="name" href={`/quests/${r.quest.id}`}>{r.quest.name}</a>
						{#if r.quest.closed}<span class="closed-tag">Closed</span>{/if}
					</div>
					<div class="numbers">
						<p class="hours">
							<span class="value tabular" data-testid="quarter-hours">
								{formatHours(r.quarterMin / 60)}
							</span>
							{#if r.budgetMin}
								<span class="budget muted tabular">/ {formatHours(r.budgetMin / 60)}</span>
							{/if}
						</p>
						<Sparkline
							values={r.weeklyMin.map((m) => m / 60)}
							{color}
							highlight={quarter.shownIndex}
							width={132}
							height={38}
						/>
						<p class="sr-only">
							Weekly hours: {r.weeklyMin
								.map((m, i) => `${weekLabel(quarter.weeks[i])} ${formatHours(m / 60)}`)
								.join(', ')}
						</p>
					</div>
					{#if pct !== null}
						<div
							class="progress"
							role="progressbar"
							aria-label={`${r.quest.name}: quarter hours vs. target`}
							aria-valuemin="0"
							aria-valuemax="100"
							aria-valuenow={Math.min(100, pct)}
						>
							<span class="fill" style:--q={color} style:width={`${Math.min(100, pct)}%`}></span>
						</div>
						<p class="meta muted tabular">{pct}% of target</p>
					{:else}
						<div class="progress" aria-hidden="true"></div>
						<p class="meta faint">{r.quest.closed ? 'Closed quest' : 'No weekly budget'}</p>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.quarter {
		display: grid;
		gap: var(--space-5);
		min-width: 0;
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2) var(--space-4);
	}
	.period {
		font-size: var(--fs-sm);
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
	}
	.big {
		font-size: var(--fs-xl);
		font-weight: var(--fw-medium);
	}
	.mid {
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
	}
	.sep {
		color: var(--text-faint);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
		gap: var(--space-6);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.qcard {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-5);
		min-width: 0;
	}
	.qcard.closed {
		opacity: 0.55;
	}
	.top {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	.tile {
		display: grid;
		place-items: center;
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-md);
		background: var(--surface-2);
		font-size: var(--fs-md);
		line-height: 1;
	}
	.name {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-weight: var(--fw-medium);
		border-radius: var(--radius-sm);
	}
	.closed-tag {
		font-size: var(--fs-xs);
		color: var(--text-faint);
	}
	.numbers {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
		min-width: 0;
	}
	.hours {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		white-space: nowrap;
	}
	.value {
		font-size: var(--fs-xl);
		font-weight: var(--fw-medium);
		letter-spacing: -0.01em;
	}
	.budget {
		font-size: var(--fs-sm);
	}
	.progress {
		height: 4px;
		border-radius: var(--radius-pill);
		background: var(--track);
		overflow: hidden;
	}
	.fill {
		display: block;
		height: 100%;
		border-radius: var(--radius-pill);
		background: var(--q);
	}
	.meta {
		font-size: var(--fs-xs);
	}
	.faint {
		color: var(--text-faint);
	}
</style>
