<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import { formatHours } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * Review on phones: the period's quests as an inset grouped list — hours / target and a
	 * thin bar in the quest colour (only with a target) — and "Other" as its own last row.
	 * A quest row opens the quest. The numbers are text, so the bars need no extra alternative.
	 */
	type Row = {
		id: string;
		name: string;
		color: string;
		closed: boolean;
		min: number;
		/** Target for the period (minutes); null = none (no budget, closed). */
		budgetMin: number | null;
	};
	type Props = { rows: Row[]; otherMin: number; label: string; testid: string };
	let { rows, otherMin, label, testid }: Props = $props();
	const t = useI18n();
	const hours = (min: number) => formatHours(min / 60, t.intl);
	const fill = (r: Row) => `${Math.min(100, (r.min / (r.budgetMin ?? 1)) * 100)}%`;
</script>

<div class="list" data-testid={testid}>
	<GroupedList {label}>
		{#each rows as r (r.id)}
			<a
				class="row"
				class:closed={r.closed}
				href={`/quests/${r.id}`}
				data-testid="list-row"
				data-quest={r.id}
			>
				<span class="line">
					<span class="dot" style:--q={questColorVar(r.color)} aria-hidden="true"></span>
					<span class="name">{r.name}</span>
					{#if r.closed}<span class="sr-only">{t.review.closedSr}</span>{/if}
					<span class="value tabular" data-testid="list-value">
						<strong>{hours(r.min)}</strong>{#if r.budgetMin !== null}<span class="budget">
								{` / ${hours(r.budgetMin)}`}
							</span>{/if}
					</span>
					<ChevronRight size={16} class="chevron" aria-hidden="true" />
				</span>
				{#if r.budgetMin !== null}
					<span class="track" aria-hidden="true">
						<span class="fill" style:--q={questColorVar(r.color)} style:width={fill(r)}></span>
					</span>
				{/if}
			</a>
		{/each}
		<div class="row" data-testid="list-row" data-quest="other">
			<span class="line">
				<span class="dot" style:--q={questColorVar('slate')} aria-hidden="true"></span>
				<span class="name">{t.common.other}</span>
				<span class="value tabular" data-testid="list-value">
					<strong>{hours(otherMin)}</strong>
				</span>
			</span>
		</div>
	</GroupedList>
</div>

<style>
	.row {
		display: grid;
		gap: var(--space-2);
		min-height: var(--grouped-row-h);
		align-content: center;
		padding: var(--space-3) var(--grouped-inset);
		color: var(--text);
		-webkit-tap-highlight-color: transparent;
		transition: background var(--dur) var(--ease);
	}
	a.row:active {
		background: var(--surface-2);
	}
	@media (hover: hover) {
		a.row:hover {
			background: var(--surface-hover);
		}
	}
	a.row:focus-visible {
		outline: none;
		box-shadow: inset 0 0 0 2px var(--focus-ring);
	}
	.row.closed .line,
	.row.closed .track {
		opacity: 0.55;
	}
	.line {
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
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.value {
		flex: none;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.value strong {
		color: var(--text);
		font-weight: var(--fw-medium);
	}
	.budget {
		font-size: var(--fs-sm);
		color: var(--text-faint);
	}
	.line :global(.chevron) {
		flex: none;
		margin-right: calc(var(--space-2) * -1);
		color: var(--text-faint);
	}
	/* The Other row has no chevron: keep its number in line with the quests' numbers. */
	.row:not(a) .value {
		margin-right: calc(16px + var(--space-3) - var(--space-2));
	}
	.track {
		height: var(--chart-thin-h);
		margin-left: calc(8px + var(--space-3));
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
</style>
