<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CalendarDays, Plus } from '@lucide/svelte';
	import DayStrip from '#lib/components/DayStrip.svelte';
	import DaySwipe from '#lib/components/DaySwipe.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Switch from '#lib/components/Switch.svelte';
	import WeekNav from '#lib/components/WeekNav.svelte';
	import WeekGrid from '#lib/components/calendar/WeekGrid.svelte';
	import SessionDialog, { type SessionEditor } from '#lib/components/calendar/SessionDialog.svelte';
	import {
		calendarWeek,
		emptyWeekLogStart,
		wallClock,
		wallMinutes,
		type CalendarSession,
		type PickTask
	} from '#lib/calendar.ts';
	import { addDays, formatHours, formatMinutes, todayISO } from '#lib/dates.ts';
	import { formatDurationMs } from '#lib/duration.ts';
	import { dayHref, resolveDay, stepDay, todayHref } from '#lib/day-view.ts';
	import { clockElapsedMs } from '#lib/timer.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const timer = useTimer();
	const t = useI18n();

	/**
	 * Server clock for the now line and the live entry: refreshed every 5 s while a timer is
	 * active (the entry grows), else every 30 s, and immediately on every timer snapshot.
	 */
	let now = $state(untrack(() => data.now));
	const serverNow = () => Date.now() + timer.offset;
	$effect(() => {
		void timer.snapshot;
		now = untrack(serverNow);
	});
	const hasActive = $derived(!!timer.timer?.session);
	$effect(() => {
		const id = setInterval(() => (now = serverNow()), hasActive ? 5_000 : 30_000);
		return () => clearInterval(id);
	});

	/** The running/paused session from the timer store, drawn live (start → now). */
	const live = $derived.by((): CalendarSession | null => {
		const t = timer.timer;
		const s = t?.session;
		if (!t || !s) return null;
		const end = Math.max(now, s.startedAt + 1000);
		return {
			id: s.id,
			taskId: t.task.id,
			taskTitle: t.task.title,
			taskDone: false,
			questId: t.task.questId,
			questName: t.task.questName,
			questColor: t.task.questColor,
			source: s.source,
			startedAt: s.startedAt,
			endedAt: end,
			loggedMs: clockElapsedMs(s, end),
			active: true,
			paused: s.state === 'paused'
		};
	});

	const dayList = $derived(data.days.map((d) => d.day));
	const week = $derived(
		calendarWeek(live ? [...data.sessions, live] : data.sessions, dayList, data.timeZone)
	);
	const questPct = $derived(
		data.budgetMin > 0 ? Math.min(100, (week.questMs / 60_000 / data.budgetMin) * 100) : 0
	);
	const isCurrentWeek = $derived(data.days.some((d) => d.isToday));

	/* ── URL state: ?week= and ?plan=1 ─────────────────────────────────────── */
	function href(set: (p: URLSearchParams) => void): string {
		const p = new URLSearchParams(page.url.searchParams.toString());
		set(p);
		const qs = p.toString();
		return qs ? `?${qs}` : '?';
	}
	/** "Show plan" switch: `?plan=1` overlays the week's planned blocks (kept on week links). */
	function togglePlan(show: boolean) {
		void goto(
			href((p) => (show ? p.set('plan', '1') : p.delete('plan'))),
			{ reset: false }
		);
	}

	/* ── Phones: day view (`?day=`, client-only — the server loads the whole week) ── */
	const selected = $derived(
		resolveDay(page.url.searchParams.get('day'), data.weekMonday, data.today)
	);
	const dayLink = (day: string) => dayHref(page.url.search, day, data.weekMonday);
	function selectDay(day: string) {
		return goto(dayLink(day), { reset: false, replace: true });
	}
	/** Swiping the day strip: the same weekday of the previous / next week (a new history entry). */
	function stepWeek(delta: -1 | 1) {
		return goto(dayLink(addDays(selected, 7 * delta)), { reset: false });
	}
	/** The strip's dot: days with logged time (incl. the running session). */
	const loggedDays = $derived(new Set(dayList.filter((_, i) => week.dayMs[i] > 0)));

	/* ── Dialog ────────────────────────────────────────────────────────────── */
	let editor = $state<SessionEditor | null>(null);
	let editorKey = $state(0);
	const dayOf = (ms: number) => todayISO(data.timeZone, new Date(ms));

	function openEdit(s: CalendarSession) {
		const task: PickTask = {
			id: s.taskId,
			title: s.taskTitle,
			day: null,
			kind: s.questId ? 'quest' : 'other',
			done: s.taskDone,
			questName: s.questName,
			questColor: s.questColor
		};
		editorKey++;
		editor = {
			sessionId: s.id,
			taskId: s.taskId,
			task,
			day: dayOf(s.startedAt),
			start: wallClock(s.startedAt, data.timeZone),
			endDay: dayOf(s.endedAt),
			end: wallClock(s.endedAt, data.timeZone)
		};
	}

	/**
	 * A week without any session (none logged, no live one, no planned blocks shown): one
	 * symbol, one sentence and "Log time" instead of an empty grid. The week nav stays.
	 */
	const empty = $derived(!live && data.sessions.length === 0 && data.blocks.length === 0);
	const emptyLog = $derived(
		emptyWeekLogStart(dayList, data.today, wallMinutes(data.now, data.timeZone))
	);
	function logFromEmpty() {
		const at = emptyWeekLogStart(dayList, data.today, wallMinutes(serverNow(), data.timeZone));
		if (at) openLog(at.day, at.minute);
	}

	/** Empty slot: that day at the clicked time, 30 minutes. */
	function openLog(day: string, minute: number) {
		const endMin = minute + 30;
		editorKey++;
		editor = {
			taskId: null,
			day,
			start: formatMinutes(minute),
			endDay: endMin >= 1440 ? addDays(day, 1) : day,
			end: formatMinutes(endMin % 1440)
		};
	}
</script>

<svelte:head><title>{t.calendar.title} · libe</title></svelte:head>

<PageHeader title={t.calendar.title}>
	{#snippet titleActions()}
		<div class="week-stats" class:hidden={empty}>
			<p class="totals tabular">
				<strong data-testid="week-total">{formatDurationMs(week.totalMs, t.intl)}</strong>
				<span data-testid="quest-total">
					{t.calendar.questTotal(formatHours(week.questMs / 3_600_000, t.intl))}
				</span>
			</p>
			<div
				class="bar"
				role="progressbar"
				aria-label={t.calendar.budgetBar}
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={Math.round(questPct)}
			>
				<div class="bar-fill" style:width={`${questPct}%`}></div>
			</div>
		</div>
	{/snippet}
	{#snippet actions()}
		<label class="plan-switch">
			<span>{t.calendar.showPlan}</span>
			<Switch checked={data.showPlan} onchange={togglePlan} />
		</label>
		<!-- Phones change weeks on the day strip (swipe, "Today"), not with ‹ ›. -->
		<span class="week-tools">
			<WeekNav
				variant="toolbar"
				monday={data.weekMonday}
				rangeLabel={data.rangeLabel}
				{isCurrentWeek}
			/>
		</span>
	{/snippet}
</PageHeader>

<!-- Phones: the month, "Today" and the week's days (swipe the strip for other weeks). -->
<DayStrip
	monday={data.weekMonday}
	{selected}
	today={data.today}
	marked={loggedDays}
	markLabel={t.calendar.hasLogged}
	hrefFor={dayLink}
	onselect={selectDay}
	onweek={stepWeek}
	month={data.monthLabel}
	todayLink={todayHref(page.url.search)}
/>

{#if empty}
	<EmptyState
		icon={CalendarDays}
		title={t.calendar.empty.title}
		text={t.calendar.empty.text}
		action={emptyLog ? t.calendar.empty.action : undefined}
		actionIcon={Plus}
		onaction={logFromEmpty}
		testid="calendar-empty"
	/>
{:else}
	<DaySwipe day={selected} onstep={(delta) => selectDay(stepDay(selected, delta).day)}>
		<WeekGrid
			days={data.days}
			{week}
			blocks={data.blocks}
			timeZone={data.timeZone}
			{now}
			{selected}
			onedit={openEdit}
			onlog={openLog}
		/>
	</DaySwipe>
{/if}

{#if editor}
	{#key editorKey}
		<SessionDialog
			{editor}
			tasks={data.pickTasks}
			weekDays={dayList}
			onclose={() => (editor = null)}
		/>
	{/key}
{/if}

<style>
	.week-tools {
		display: contents;
	}
	.plan-switch {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin-right: var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		white-space: nowrap;
		cursor: pointer;
	}

	/* An empty week has no totals to show (but keeps its place in the header). */
	.week-stats.hidden {
		visibility: hidden;
	}
	.week-stats {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		margin-left: var(--space-4);
	}
	.totals {
		white-space: nowrap;
		color: var(--text-faint);
		font-size: var(--fs-sm);
	}
	.totals strong {
		color: var(--text);
		font-size: var(--fs-xl);
		font-weight: var(--fw-figure);
		letter-spacing: -0.01em;
		margin-right: var(--space-1);
	}
	.bar {
		width: 96px;
		height: 4px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
		border-radius: var(--radius-pill);
		background: var(--progress-fill);
		transition: width var(--dur) var(--ease);
	}

	/* Phones: the day view's header line carries the day total; the week sums stay on wider screens. */
	@media (max-width: 720px) {
		.week-stats {
			display: none;
		}
		.plan-switch {
			margin-right: 0;
		}
		.week-tools {
			display: none;
		}
	}
</style>
