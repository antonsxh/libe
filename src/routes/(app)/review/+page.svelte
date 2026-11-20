<script lang="ts">
	import PageHeader from '#lib/components/PageHeader.svelte';
	import WeekNav from '#lib/components/WeekNav.svelte';
	import DayBars from '#lib/components/review/DayBars.svelte';
	import QuarterSummary from '#lib/components/review/QuarterSummary.svelte';
	import QuestHours from '#lib/components/review/QuestHours.svelte';
	import QuestVsOther from '#lib/components/review/QuestVsOther.svelte';
	import { formatHours } from '#lib/dates.ts';
	import {
		comparisonLabel,
		formatSignedHours,
		percent,
		weekSummary,
		weekSummaryText,
		type ReviewQuest
	} from '#lib/review.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { runningSpan } from '#lib/daily-goal.ts';
	import { pageStreak, streakMarks } from '#lib/streak.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const t = useI18n();
	const hours = (h: number) => formatHours(h, t.intl);
	const timer = useTimer();

	const week = $derived(data.review.week);
	const prev = $derived(week.previous);
	const sharePct = $derived(week.questShare === null ? null : Math.round(week.questShare * 100));
	const targetPct = $derived(percent(week.questMin, week.budgetMin));
	const questsById = $derived(
		Object.fromEntries(week.quests.map((r) => [r.quest.id, r.quest])) as Record<string, ReviewQuest>
	);
	const vs = $derived(prev ? comparisonLabel(prev.days, t) : '');
	/** "Your week, Anton. 12.5h logged — 2.1h more than last week." (vocative only). */
	const headline = $derived(
		`${t.review.yourWeek(data.profile?.displayName ?? null)} ${weekSummaryText(weekSummary(week), t)}`
	);

	/** Live streak (today's minutes move with the timer, like Home). */
	const streak = $derived(
		data.streak && data.todayLog
			? pageStreak(
					data.streak,
					data.todayLog,
					runningSpan(timer.timer, timer.view),
					timer.serverNow
				)
			: null
	);
	/** Streak marker per day of the shown week (logged minutes = quest + other, same day rule). */
	const marks = $derived(
		data.streak
			? streakMarks(
					week.days.map((d) => ({ day: d.day, min: d.questMin + d.otherMin })),
					{
						today: data.today,
						threshold: data.streak.threshold,
						restMask: data.streak.restMask,
						todayMin: streak?.todayMin
					}
				)
			: null
	);

	/** Week-over-week deltas (null for future weeks / no data on either side). */
	const deltas = $derived.by(() => {
		if (!prev) return null;
		const shareNow = week.questShare;
		const sharePrev = prev.questShare;
		const pts =
			shareNow !== null && sharePrev !== null
				? Math.round(shareNow * 100) - Math.round(sharePrev * 100)
				: null;
		return {
			quest: (week.questMin - prev.questMin) / 60,
			avg: (week.dailyAvgMin - prev.dailyAvgMin) / 60,
			share: pts
		};
	});
	const sign = (n: number) => (Math.round(n * 10) === 0 ? 'zero' : n > 0 ? 'up' : 'down');
	const signedPts = (n: number) =>
		t.review.points(n === 0 ? '±0' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`);
</script>

<svelte:head><title>{t.review.title} · libe</title></svelte:head>

<PageHeader title={t.review.title} subtitle={headline}>
	{#snippet actions()}
		<WeekNav
			monday={data.weekMonday}
			rangeLabel={data.rangeLabel}
			isCurrentWeek={data.isCurrentWeek}
		/>
	{/snippet}
</PageHeader>

<div class="review">
	<section class="kpis" aria-label={t.review.keyFigures}>
		<article class="card kpi">
			<header class="kpi-head">
				<h2 class="label">{t.review.questHours}</h2>
				{#if deltas}
					<span class="delta tabular" data-sign={sign(deltas.quest)} data-testid="delta-quest">
						{formatSignedHours(deltas.quest, t.intl)}
						{vs}
					</span>
				{/if}
			</header>
			<p class="figure">
				<span class="num accent tabular" data-testid="kpi-quest">
					{hours(week.questMin / 60)}
				</span>
				{#if week.budgetMin > 0}
					<span class="unit tabular" data-testid="kpi-budget">
						/ {hours(week.budgetMin / 60)}
					</span>
				{/if}
			</p>
			<p class="sub tabular" data-testid="kpi-target">
				{targetPct === null ? t.review.noBudget : t.common.pctOfTarget(targetPct)}
			</p>
		</article>

		<article class="card kpi">
			<header class="kpi-head">
				<h2 class="label">{t.review.dailyAverage}</h2>
				{#if deltas}
					<span class="delta tabular" data-sign={sign(deltas.avg)}>
						{formatSignedHours(deltas.avg, t.intl)}
						{vs}
					</span>
				{/if}
			</header>
			<p class="figure">
				<span class="num tabular" data-testid="kpi-avg">{hours(week.dailyAvgMin / 60)}</span>
			</p>
			<p class="sub tabular">
				{#if week.daysElapsed === 0}
					{t.review.notStarted}
				{:else}
					{t.review.loggedOver(hours(week.totalMin / 60), week.daysElapsed)}
				{/if}
			</p>
		</article>

		<article class="card kpi">
			<header class="kpi-head">
				<h2 class="label">{t.review.questVsOther}</h2>
				{#if deltas && deltas.share !== null}
					<span class="delta tabular" data-sign={sign(deltas.share)}>
						{signedPts(deltas.share)}
						{vs}
					</span>
				{/if}
			</header>
			<p class="figure">
				{#if sharePct === null}
					<span class="num faint" data-testid="kpi-share">—</span>
				{:else}
					<span class="num tabular" data-testid="kpi-share">{sharePct}</span>
					<span class="unit">%</span>
				{/if}
			</p>
			<p class="sub tabular">
				{week.totalMin > 0 ? t.review.ofLogged(hours(week.totalMin / 60)) : t.review.noTimeLogged}
			</p>
		</article>
	</section>

	<div class="charts">
		<DayBars
			days={week.days}
			quests={questsById}
			{marks}
			longest={streak ? streak.longest : null}
		/>
		<div class="side">
			<QuestHours rows={week.quests} />
			<QuestVsOther questMin={week.questMin} otherMin={week.otherMin} />
		</div>
	</div>

	<QuarterSummary quarter={data.review.quarter} />
</div>

<style>
	.review {
		display: grid;
		gap: var(--space-10);
		min-width: 0;
	}

	/* ── KPIs ────────────────────────────────────────────── */
	.kpis {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-6);
		margin-top: calc(var(--space-2) * -1);
	}
	.kpi {
		display: grid;
		align-content: start;
		gap: var(--space-3);
		padding: var(--space-6);
		border-radius: var(--radius-xl);
		min-width: 0;
	}
	.kpi-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
	}
	.delta {
		font-size: var(--fs-xs);
		color: var(--text-faint);
		white-space: nowrap;
	}
	.delta[data-sign='up'] {
		color: color-mix(in srgb, var(--success) 70%, var(--text-faint));
	}
	.figure {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.num {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-regular);
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.num.accent {
		color: var(--accent);
	}
	.num.faint {
		color: var(--text-faint);
	}
	.unit {
		font-size: var(--fs-md);
		color: var(--text-muted);
	}
	.sub {
		font-size: var(--fs-md);
		color: var(--text-faint);
	}

	/* ── Charts ──────────────────────────────────────────── */
	.charts {
		display: grid;
		grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
		gap: var(--space-6);
	}
	.side {
		display: grid;
		grid-template-rows: auto 1fr;
		gap: var(--space-6);
		min-width: 0;
	}

	@media (max-width: 1100px) {
		.charts {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 720px) {
		.kpis {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 900px) {
		.kpis {
			gap: var(--space-4);
		}
		.review {
			gap: var(--space-8);
		}
		.charts,
		.side {
			gap: var(--space-4);
		}
	}
</style>
