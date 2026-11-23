<script lang="ts">
	import { Flame, Moon } from '@lucide/svelte';
	import { formatDayLabel, formatHours } from '#lib/dates.ts';
	import type { StreakMark } from '#lib/streak.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { formatDurationMin } from '#lib/duration.ts';
	import { type ReviewDay, type ReviewQuest } from '#lib/review.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		days: ReviewDay[];
		/** Quests that appear in `days[].byQuest`, by id. */
		quests: Record<string, ReviewQuest>;
		/** Streak marker per day (same order as `days`); null = no streak row. */
		marks?: StreakMark[] | null;
		/** Longest streak ever (days), shown in the card head. */
		longest?: number | null;
	};
	let { days, quests, marks = null, longest = null }: Props = $props();
	const t = useI18n();

	/** Smallest full-scale value (minutes) so a 10-minute week doesn't fill the chart. */
	const MIN_SCALE = 60;
	const scale = $derived(Math.max(MIN_SCALE, ...days.map((d) => d.questMin)));

	const weekday = (day: string) => formatDayLabel(day, { weekday: 'short' }, t.intl);
	const longDay = (day: string) =>
		formatDayLabel(day, { weekday: 'short', month: 'short', day: 'numeric' }, t.intl);

	/**
	 * Touch screens have no hover (and iOS doesn't focus buttons on tap): a tap pins the
	 * day's tooltip, a tap elsewhere or Escape closes it.
	 */
	let pinned = $state<string | null>(null);
	function toggle(day: string) {
		if (!matchMedia('(hover: none)').matches) return;
		pinned = pinned === day ? null : day;
	}
	$effect(() => {
		if (!pinned) return;
		const close = (e: Event) => {
			if (
				e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as Element).closest?.('.col')
			)
				pinned = null;
		};
		window.addEventListener('pointerdown', close);
		window.addEventListener('keydown', close);
		return () => {
			window.removeEventListener('pointerdown', close);
			window.removeEventListener('keydown', close);
		};
	});

	function ariaLabel(d: ReviewDay): string {
		const parts = d.byQuest.map(
			(q) => `${quests[q.questId]?.name ?? t.common.quest} ${formatDurationMin(q.min, t.intl)}`
		);
		const quest = t.review.dayAria(longDay(d.day), formatDurationMin(d.questMin, t.intl));
		const other =
			d.otherMin > 0 ? t.review.dayAriaOther(formatDurationMin(d.otherMin, t.intl)) : '';
		const base = parts.length ? `${quest} (${parts.join(', ')})${other}` : `${quest}${other}`;
		const mark = marks?.[days.indexOf(d)];
		return mark ? `${base}; ${t.streak.marks[mark]}` : base;
	}
</script>

<section class="card chart" aria-labelledby="per-day-label">
	<header class="head">
		<h2 class="label" id="per-day-label">{t.review.perDay}</h2>
		{#if longest !== null}
			<p class="longest tabular" data-testid="longest-streak">
				<Flame size={14} aria-hidden="true" />
				{t.streak.longest(longest)}
			</p>
		{/if}
	</header>
	<ol class="bars">
		{#each days as d, i (d.day)}
			{@const stub = d.state === 'future' || d.questMin <= 0}
			<li
				class="col"
				data-state={d.state}
				class:first={i === 0}
				class:last={i === days.length - 1}
				class:pinned={pinned === d.day}
			>
				<button
					type="button"
					class="hit"
					onclick={() => toggle(d.day)}
					aria-label={ariaLabel(d)}
					aria-describedby={`tip-${d.day}`}
					data-testid="day-bar"
					data-day={d.day}
				>
					<span class="value tabular" class:zero={d.questMin <= 0} data-testid="day-value">
						{formatHours(d.questMin / 60, t.intl)}
					</span>
					<span class="plot">
						<span
							class="bar"
							class:stub
							style:height={stub ? undefined : `${(d.questMin / scale) * 100}%`}
						></span>
					</span>
					<span class="weekday">{weekday(d.day)}</span>
					{#if marks?.[i]}
						<span class="mark" data-mark={marks[i]} data-testid="streak-mark" aria-hidden="true">
							{#if marks[i] === 'done'}<Flame size={13} />{:else if marks[i] === 'rest'}<Moon
									size={12}
								/>{:else}<span class="pip"></span>{/if}
						</span>
					{/if}
				</button>
				<div class="tip" role="tooltip" id={`tip-${d.day}`}>
					<p class="tip-head">
						<span>{longDay(d.day)}</span>
						<strong class="tabular">{formatDurationMin(d.questMin, t.intl)}</strong>
					</p>
					{#if d.byQuest.length}
						<ul>
							{#each d.byQuest as q (q.questId)}
								{@const quest = quests[q.questId]}
								<li>
									<span class="dot" style:--q={questColorVar(quest?.color)}></span>
									<span class="name">{quest?.name ?? t.common.quest}</span>
									<span class="tabular">{formatDurationMin(q.min, t.intl)}</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="none">{t.review.noQuestWork}</p>
					{/if}
					{#if d.otherMin > 0}
						<p class="other">
							<span>{t.common.other}</span>
							<span class="tabular">{formatDurationMin(d.otherMin, t.intl)}</span>
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
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
	}
	.longest {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.longest :global(svg) {
		color: var(--text-2);
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
		grid-template-rows: auto minmax(var(--chart-h), 1fr) auto auto;
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
	/* Streak row: flame = streak day, moon = rest day, dot = missed / open / upcoming. */
	.mark {
		display: grid;
		place-items: center;
		height: 14px;
		color: var(--text-faint);
	}
	.mark[data-mark='done'] {
		color: var(--text-2);
	}
	.mark .pip {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--bar-muted);
	}
	.mark[data-mark='today'] .pip {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--accent);
	}
	.mark[data-mark='future'] .pip {
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--border-strong);
	}
	.col[data-state='today'] .value {
		color: var(--text);
	}
	.col[data-state='today'] .weekday {
		color: var(--accent);
	}
	.col[data-state='today'] .bar {
		background: var(--text-2);
	}
	.col[data-state='today'] .bar.stub {
		background: var(--bar-muted);
	}
	.hit:hover .bar:not(.stub) {
		background: color-mix(in srgb, var(--bar-muted) 70%, var(--text-muted));
	}
	.col[data-state='today'] .hit:hover .bar:not(.stub) {
		background: var(--text);
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
	.col:focus-within .tip,
	.col.pinned .tip {
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
