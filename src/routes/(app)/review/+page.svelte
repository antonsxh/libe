<script lang="ts">
	import { ChartColumn, Play } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import WeekNav from '#lib/components/WeekNav.svelte';
	import DayBars from '#lib/components/review/DayBars.svelte';
	import QuarterBars from '#lib/components/review/QuarterBars.svelte';
	import QuarterSummary from '#lib/components/review/QuarterSummary.svelte';
	import QuestHours from '#lib/components/review/QuestHours.svelte';
	import QuestList from '#lib/components/review/QuestList.svelte';
	import QuestVsOther from '#lib/components/review/QuestVsOther.svelte';
	import SummaryCard from '#lib/components/review/SummaryCard.svelte';
	import { dayRangeLabel, formatHours } from '#lib/dates.ts';
	import {
		comparisonLabel,
		formatSignedHours,
		parseReviewView,
		percent,
		quarterComparisonLabel,
		reviewViewHref,
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
	/**
	 * A week without any logged time shows one symbol, one sentence and (for the running week)
	 * one action instead of KPIs and charts full of zeros. The quarter stays when it has time.
	 */
	const empty = $derived(week.totalMin <= 0);
	const emptyKind = $derived(
		week.daysElapsed === 0 ? 'future' : week.daysElapsed < 7 ? 'current' : 'past'
	);
	const quarterHasTime = $derived(data.review.quarter.questMin + data.review.quarter.otherMin > 0);

	/** "Your week, Anton. 12.5h logged — 2.1h more than last week." (vocative only). */
	const headline = $derived(
		empty
			? t.review.yourWeek(data.profile?.displayName ?? null)
			: `${t.review.yourWeek(data.profile?.displayName ?? null)} ${weekSummaryText(weekSummary(week), t)}`
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
	const signedPts = (n: number) =>
		t.review.points(n === 0 ? '±0' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`);

	/* ── Phones: Week | Quarter (`?view=`), one summary card, a list of quests ── */
	const quarter = $derived(data.review.quarter);
	const viewOptions = $derived([
		{ value: 'week', label: t.review.phone.week },
		{ value: 'quarter', label: t.review.phone.quarter }
	]);
	/** The segmented control navigates (a history entry, so Back returns to the other view). */
	function switchView(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.name !== 'view') return;
		goto(reviewViewHref(page.url.search, parseReviewView(input.value)), { reset: false });
	}
	const weekFigures = $derived([
		{
			value: hours(week.questMin / 60),
			label: t.review.questHours,
			sub: week.budgetMin > 0 ? t.review.phone.ofTarget(hours(week.budgetMin / 60)) : undefined,
			testid: 'sum-quest'
		},
		{ value: hours(week.dailyAvgMin / 60), label: t.review.phone.perDay, testid: 'sum-avg' },
		{
			value: deltas ? formatSignedHours(deltas.quest, t.intl) : '—',
			label: vs || t.review.vsLastWeek,
			testid: 'sum-delta'
		}
	]);
	const quarterHasStarted = $derived(quarter.elapsedDays > 0);
	const quarterFigures = $derived([
		{
			value: hours(quarter.questMin / 60),
			label: t.review.questHours,
			sub:
				quarter.budgetMin > 0 ? t.review.phone.ofTarget(hours(quarter.budgetMin / 60)) : undefined,
			testid: 'q-sum-quest'
		},
		{
			value: hours(
				quarter.weeksElapsed > 0
					? (quarter.questMin + quarter.otherMin) / 60 / quarter.weeksElapsed
					: 0
			),
			label: t.review.phone.perWeek,
			testid: 'q-sum-week'
		},
		{
			value: quarter.previous
				? formatSignedHours((quarter.questMin - quarter.previous.questMin) / 60, t.intl)
				: '—',
			label: quarter.previous ? quarterComparisonLabel(quarter.previous, t) : '',
			testid: 'q-sum-delta'
		}
	]);
	const weekRows = $derived(
		week.quests.map((r) => ({
			id: r.quest.id,
			name: r.quest.name,
			color: r.quest.color,
			closed: r.quest.closed,
			min: r.weekMin,
			budgetMin: r.budgetMin
		}))
	);
	const quarterRows = $derived(
		quarter.quests.map((r) => ({
			id: r.quest.id,
			name: r.quest.name,
			color: r.quest.color,
			closed: r.quest.closed,
			min: r.quarterMin,
			budgetMin: r.budgetMin
		}))
	);
</script>

<svelte:head><title>{t.review.title} · libe</title></svelte:head>

<!--
	Phones (≤ 720px) show one period at a time — Week or Quarter (`?view=`), each as one summary
	card, its bars and a grouped list of quests with Other as a row. Wider screens keep the grid
	(KPI cards, charts, quarter cards) and ignore `?view=`. Both share one tree: CSS hides the
	other layout's parts (`desk-only` / `phone-only`), so SSR needs no viewport guess.
-->
<div class="review-page" data-view={data.view}>
	<PageHeader title={t.review.title} subtitle={headline}>
		{#snippet actions()}
			<div class="head-controls">
				<form class="view-switch" method="GET" action="/review" onchange={switchView}>
					{#if !data.isCurrentWeek}<input type="hidden" name="week" value={data.weekMonday} />{/if}
					<SegmentedControl
						name="view"
						label={t.review.phone.view}
						options={viewOptions}
						value={data.view}
					/>
					<noscript><button type="submit">{t.review.phone.view}</button></noscript>
				</form>
				<div class="week-slot">
					<WeekNav
						monday={data.weekMonday}
						rangeLabel={data.rangeLabel}
						isCurrentWeek={data.isCurrentWeek}
					/>
				</div>
				{#if data.view === 'quarter'}
					<p class="quarter-range muted tabular" data-testid="quarter-range">
						{quarter.label} · {dayRangeLabel(quarter.start, quarter.end, t.intl)}
					</p>
				{/if}
			</div>
		{/snippet}
	</PageHeader>

	{#if empty}
		<div class="week-part">
			{#if emptyKind === 'current'}
				<EmptyState
					icon={ChartColumn}
					title={t.review.empty.title}
					text={t.review.empty.text}
					action={t.review.empty.action}
					actionIcon={Play}
					href="/focus"
					testid="review-empty"
				/>
			{:else}
				<EmptyState
					icon={ChartColumn}
					title={emptyKind === 'future' ? t.review.notStarted : t.review.empty.pastTitle}
					text={emptyKind === 'future' ? t.review.empty.futureText : t.review.empty.pastText}
					testid="review-empty"
				/>
			{/if}
		</div>
		{#if quarterHasTime}
			<div class="review desk-only">
				<QuarterSummary quarter={data.review.quarter} />
			</div>
		{/if}
	{:else}
		<div class="review week-part">
			<section class="kpis desk-only" aria-label={t.review.keyFigures}>
				<article class="card kpi">
					<header class="kpi-head">
						<h2 class="label">{t.review.questHours}</h2>
						{#if deltas}
							<span class="delta tabular" data-testid="delta-quest">
								{formatSignedHours(deltas.quest, t.intl)}
								{vs}
							</span>
						{/if}
					</header>
					<p class="figure">
						<span class="num tabular" data-testid="kpi-quest">
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
							<span class="delta tabular">
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
							<span class="delta tabular">
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
						{week.totalMin > 0
							? t.review.ofLogged(hours(week.totalMin / 60))
							: t.review.noTimeLogged}
					</p>
				</article>
			</section>
			<div class="phone-only">
				<SummaryCard figures={weekFigures} label={t.review.keyFigures} testid="week-summary" />
			</div>

			<div class="charts">
				<DayBars
					days={week.days}
					quests={questsById}
					{marks}
					longest={streak ? streak.longest : null}
				/>
				<div class="side desk-only">
					<QuestHours rows={week.quests} />
					<QuestVsOther questMin={week.questMin} otherMin={week.otherMin} rows={week.quests} />
				</div>
				<div class="phone-only">
					<QuestList
						rows={weekRows}
						otherMin={week.otherMin}
						label={t.review.hoursByQuest}
						testid="week-list"
					/>
				</div>
			</div>

			<div class="desk-only">
				<QuarterSummary quarter={data.review.quarter} />
			</div>
		</div>
	{/if}

	<!-- Phones, Quarter: the same structure with the quarter's numbers. -->
	{#if data.view === 'quarter'}
		<div class="review phone-only quarter-part">
			{#if quarterHasTime}
				<SummaryCard
					figures={quarterFigures}
					label={t.review.keyFigures}
					testid="quarter-summary"
				/>
				<QuarterBars {quarter} />
				<QuestList
					rows={quarterRows}
					otherMin={quarter.otherMin}
					label={t.review.hoursByQuest}
					testid="quarter-list"
				/>
			{:else if !quarterHasStarted}
				<EmptyState
					icon={ChartColumn}
					title={t.review.phone.quarterEmpty.futureTitle}
					text={t.review.empty.futureText}
					testid="review-empty-quarter"
				/>
			{:else if data.today > quarter.end}
				<EmptyState
					icon={ChartColumn}
					title={t.review.empty.pastTitle}
					text={t.review.phone.quarterEmpty.pastText}
					testid="review-empty-quarter"
				/>
			{:else}
				<EmptyState
					icon={ChartColumn}
					title={t.review.empty.title}
					text={t.review.phone.quarterEmpty.text}
					action={t.review.empty.action}
					actionIcon={Play}
					href="/focus"
					testid="review-empty-quarter"
				/>
			{/if}
		</div>
	{/if}
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
	/* Week-over-week: a plain fact, muted — no green/red for "better/worse". */
	.delta {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		white-space: nowrap;
	}
	.figure {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
	}
	.num {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-figure);
		letter-spacing: -0.02em;
		line-height: 1.1;
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

	/* ── Phone / desktop parts ───────────────────────────── */
	.phone-only,
	.view-switch,
	.quarter-range {
		display: none;
	}
	.head-controls {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	@media (max-width: 720px) {
		.desk-only {
			display: none;
		}
		.phone-only {
			display: block;
		}
		.review.phone-only {
			display: grid;
		}
		[data-view='quarter'] .week-part,
		[data-view='quarter'] .week-slot {
			display: none;
		}
		/* The summary card carries the week's numbers; the headline would repeat them. */
		.review-page :global(.page-header .titles > p) {
			display: none;
		}
		.review-page :global(.page-header > .actions) {
			width: 100%;
		}
		.head-controls {
			display: grid;
			width: 100%;
			gap: var(--space-4);
		}
		.view-switch {
			display: block;
		}
		.view-switch :global(.segmented) {
			display: grid;
			width: 100%;
		}
		.quarter-range {
			display: block;
			font-size: var(--fs-sm);
		}
		.review-page .review {
			gap: var(--space-4);
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
