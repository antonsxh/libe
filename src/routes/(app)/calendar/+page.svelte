<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { LayoutList } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import WeekNav from '#lib/components/WeekNav.svelte';
	import WeekGrid from '#lib/components/calendar/WeekGrid.svelte';
	import SessionDialog, { type SessionEditor } from '#lib/components/calendar/SessionDialog.svelte';
	import {
		calendarWeek,
		formatHM,
		wallClock,
		type CalendarSession,
		type PickTask
	} from '#lib/calendar.ts';
	import { addDays, formatHours, formatMinutes, todayISO } from '#lib/dates.ts';
	import { clockElapsedMs } from '#lib/timer.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const timer = useTimer();

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
	const planHref = $derived(href((p) => (data.showPlan ? p.delete('plan') : p.set('plan', '1'))));

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

<svelte:head><title>Calendar · libe</title></svelte:head>

<PageHeader title="Calendar">
	{#snippet titleActions()}
		<div class="nav-wrap">
			<WeekNav monday={data.weekMonday} rangeLabel={data.rangeLabel} {isCurrentWeek}>
				<a
					class="pill-btn plan-toggle"
					class:on={data.showPlan}
					href={planHref}
					aria-label={data.showPlan ? 'Hide plan' : 'Show plan'}
					data-sveltekit-reset="false"
				>
					<LayoutList size={15} />
					<span class="box" aria-hidden="true"></span>
					Show plan
				</a>
			</WeekNav>
		</div>
	{/snippet}
	{#snippet actions()}
		<div class="week-stats">
			<p class="totals tabular">
				<strong data-testid="week-total">{formatHM(week.totalMs)}</strong>
				<span data-testid="quest-total">/ {formatHours(week.questMs / 3_600_000)} quest</span>
			</p>
			<div
				class="bar"
				role="progressbar"
				aria-label="Quest hours vs. weekly quest budget"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={Math.round(questPct)}
			>
				<div class="bar-fill" style:width={`${questPct}%`}></div>
			</div>
		</div>
	{/snippet}
</PageHeader>

<WeekGrid
	days={data.days}
	{week}
	blocks={data.blocks}
	timeZone={data.timeZone}
	{now}
	onedit={openEdit}
	onlog={openLog}
/>

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
	.nav-wrap {
		margin-left: var(--space-4);
	}
	.pill-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		height: 34px;
		padding: 0 var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text-2);
		font-size: var(--fs-sm);
		white-space: nowrap;
		transition:
			background var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}
	.pill-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.box {
		width: 12px;
		height: 12px;
		border: 1px solid var(--border-strong);
		border-radius: 3px;
	}
	.plan-toggle.on {
		color: var(--text);
		border-color: var(--border-strong);
	}
	.plan-toggle.on .box {
		background: var(--accent);
		border-color: var(--accent);
	}

	.week-stats {
		display: flex;
		align-items: center;
		gap: var(--space-5);
		padding-bottom: var(--space-1);
	}
	.totals {
		white-space: nowrap;
		color: var(--text-faint);
		font-size: var(--fs-sm);
	}
	.totals strong {
		color: var(--text);
		font-size: var(--fs-xl);
		font-weight: var(--fw-medium);
		letter-spacing: -0.01em;
		margin-right: var(--space-1);
	}
	.bar {
		width: 128px;
		height: 4px;
		border-radius: var(--radius-pill);
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
		border-radius: var(--radius-pill);
		background: var(--accent);
		transition: width var(--dur) var(--ease);
	}

	@media (max-width: 900px) {
		.nav-wrap {
			margin-left: 0;
		}
	}
</style>
