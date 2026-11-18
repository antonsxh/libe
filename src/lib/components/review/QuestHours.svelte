<script lang="ts">
	import { formatHours } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { QuestWeekRow } from '#lib/review.ts';

	type Props = { rows: QuestWeekRow[] };
	let { rows }: Props = $props();

	/** Full track = the largest of any hours or budget, so every budget tick fits. */
	const scale = $derived(Math.max(60, ...rows.map((r) => Math.max(r.weekMin, r.budgetMin ?? 0))));
	const pct = (min: number) => `${Math.min(100, (min / scale) * 100)}%`;
</script>

<section class="card panel" aria-labelledby="by-quest-label">
	<h2 class="label" id="by-quest-label">Hours by quest</h2>
	{#if rows.length === 0}
		<p class="empty muted">No quests yet.</p>
	{:else}
		<ul class="rows">
			{#each rows as r (r.quest.id)}
				<li
					class="row"
					class:closed={r.quest.closed}
					data-testid="quest-row"
					data-quest={r.quest.id}
				>
					<span class="who">
						<span class="dot" style:--q={questColorVar(r.quest.color)}></span>
						<a class="name" href={`/quests/${r.quest.id}`} title={r.quest.name}>{r.quest.name}</a>
						{#if r.quest.closed}<span class="sr-only">(closed)</span>{/if}
					</span>
					<span class="track" aria-hidden="true">
						<span class="fill" style:--q={questColorVar(r.quest.color)} style:width={pct(r.weekMin)}
						></span>
						{#if r.budgetMin !== null}
							<span class="tick" style:left={pct(r.budgetMin)}></span>
						{/if}
					</span>
					<span class="value tabular" data-testid="quest-value">
						{formatHours(r.weekMin / 60)}{#if r.budgetMin !== null}<span class="budget">
								{` / ${formatHours(r.budgetMin / 60)}`}
							</span>{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
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
	.rows {
		display: grid;
		gap: var(--space-4);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.row {
		display: grid;
		grid-template-columns: minmax(0, 10.5rem) minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-4);
		min-width: 0;
	}
	.row.closed {
		opacity: 0.5;
	}
	.who {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
	}
	.dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--q);
	}
	.name {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--text);
		border-radius: var(--radius-sm);
	}
	.name:hover {
		color: var(--text-2);
	}
	.track {
		position: relative;
		height: var(--chart-track-h);
		border-radius: var(--chart-radius);
		background: var(--track);
	}
	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: var(--chart-radius);
		background: var(--q);
	}
	.tick {
		position: absolute;
		top: calc(var(--space-1) * -1);
		bottom: calc(var(--space-1) * -1);
		width: 2px;
		margin-left: -1px;
		border-radius: 1px;
		background: var(--text-muted);
	}
	.value {
		min-width: 3.5rem;
		text-align: right;
		white-space: nowrap;
		color: var(--text);
	}
	.budget {
		color: var(--text-faint);
		font-size: var(--fs-sm);
	}

	@media (max-width: 640px) {
		.panel {
			padding: var(--space-4);
		}
		.row {
			grid-template-columns: minmax(0, 1fr) auto;
			row-gap: var(--space-2);
		}
		.track {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
</style>
