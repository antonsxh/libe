<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CalendarCheck, Inbox, Plus } from '@lucide/svelte';
	import DayStrip from '#lib/components/DayStrip.svelte';
	import DaySwipe from '#lib/components/DaySwipe.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import WeekNav from '#lib/components/WeekNav.svelte';
	import QuestFilter from '#lib/components/tasks/QuestFilter.svelte';
	import BacklogColumn from '#lib/components/plan/BacklogColumn.svelte';
	import PlanColumn from '#lib/components/plan/PlanColumn.svelte';
	import { addDays } from '#lib/dates.ts';
	import { dayHref, resolveDay, stepDay, todayHref } from '#lib/day-view.ts';
	import { isPhoneViewport } from '#lib/motion.ts';
	import { overdueDays } from '#lib/overdue.ts';
	import type { TaskFormResult } from '#lib/task-form.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const t = useI18n();

	const taskForm = $derived(form as TaskFormResult | null);

	let board = $state<HTMLDivElement | undefined>();

	/**
	 * Bring today's column (if shown; else the board start) into view whenever the *week* changes — scrolling as
	 * little as possible. Keyed on a derived string so re-loads after mutations (same
	 * week) don't yank the board around.
	 */
	const scrollKey = $derived(`${data.weekMonday}|${data.today}`);
	$effect(() => {
		const today = scrollKey.split('|')[1];
		const el = board;
		const col = el?.querySelector<HTMLElement>(`[data-day="${today}"]`);
		if (!el || isPhoneViewport()) return; // phones: the day view, nothing to scroll
		if (!col) {
			el.scrollLeft = 0; // another week: start at the backlog / Monday
			return;
		}
		const left = col.offsetLeft;
		const right = left + col.offsetWidth;
		if (right > el.scrollLeft + el.clientWidth) el.scrollLeft = right - el.clientWidth;
		if (left < el.scrollLeft) el.scrollLeft = left;
	});

	/** Build `?…` from the current URL params; unrelated params survive. */
	function href(set: (p: URLSearchParams) => void): string {
		const p = new URLSearchParams(page.url.searchParams.toString());
		set(p);
		const qs = p.toString();
		return qs ? `?${qs}` : '?';
	}
	const navOpts = { reset: false } as const;
	function setQuestFilter(ids: string[] | null) {
		void goto(
			href((p) => (ids ? p.set('q', ids.join(',')) : p.delete('q'))),
			navOpts
		);
	}
	/** Other-zone expanded days live in `?other=` (survives reload, works without JS). */
	function toggleOther(day: string, open: boolean) {
		const url = href((p) => {
			const days = new Set((p.get('other') ?? '').split(',').filter((d) => d.length > 0));
			if (open) days.add(day);
			else days.delete(day);
			if (days.size > 0) p.set('other', [...days].sort().join(','));
			else p.delete('other');
		});
		void goto(url, { ...navOpts, replace: true });
	}
	/** "Hide done tasks" in the filter menu: `?hideDone=1` (a new history entry, like `?q=`). */
	function setHideDone(hide: boolean) {
		void goto(
			href((p) => (hide ? p.set('hideDone', '1') : p.delete('hideDone'))),
			navOpts
		);
	}
	const isCurrentWeek = $derived(data.columns.some((c) => c.isToday));

	/* ── Phones: day view (`?day=`, client-only — the server loads the whole week) ── */
	const selected = $derived(
		resolveDay(page.url.searchParams.get('day'), data.weekMonday, data.today)
	);
	const dayLink = (day: string) => dayHref(page.url.search, day, data.weekMonday, ['other']);
	function selectDay(day: string) {
		return goto(dayLink(day), { reset: false, replace: true });
	}
	/** Swiping the day strip: the same weekday of the previous / next week (a new history entry, like ‹ ›). */
	function stepWeek(delta: -1 | 1) {
		return goto(dayLink(addDays(selected, 7 * delta)), { reset: false });
	}
	/** The strip's dot: days with open tasks. */
	const openDays = $derived(
		new Set(
			data.columns.filter((c) => c.questTasks.length + c.otherTasks.length > 0).map((c) => c.day)
		)
	);

	/** Overdue tasks: marked cards on past days, the strip's overdue dot (phones). */
	const overdueIds = $derived(new Set(data.overdue.map((task) => task.id)));
	const overdueOn = $derived(overdueDays(data.overdue));

	/**
	 * A week without any planned task: one symbol, one sentence and "Add a task" instead of
	 * seven empty columns (the backlog rail and the week nav stay). The action shows the week
	 * and focuses the add row of today (or the selected day / Monday) — until the week changes.
	 */
	let shownWeek = $state<string | null>(null);
	const weekEmpty = $derived(data.weekPlanned === 0 && shownWeek !== data.weekMonday);
	async function showWeek() {
		shownWeek = data.weekMonday;
		await tick();
		const input = board?.querySelector<HTMLInputElement>(
			`[data-day="${selected}"] form.add input[name=title]`
		);
		input?.focus();
		input?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}

	/** Backlog bottom sheet; its content mounts on open and unmounts after the exit animation. */
	let backlogOpen = $state(false);
	let backlogMounted = $state(false);
	function openBacklog() {
		backlogMounted = true;
		backlogOpen = true;
	}
</script>

<svelte:head>
	<title>{t.plan.title} · libe</title>
</svelte:head>

<header class="plan-head">
	<h1>{t.plan.title}</h1>
	<div class="tools">
		<span class="board-only">
			<WeekNav
				variant="toolbar"
				monday={data.weekMonday}
				rangeLabel={data.rangeLabel}
				{isCurrentWeek}
				weekScoped={['other']}
			/>
		</span>
		<QuestFilter
			round
			quests={data.quests}
			selected={data.questFilter}
			onchange={setQuestFilter}
			hideDone={data.hideDone}
			onhidedone={setHideDone}
		/>
		<button
			type="button"
			class="round-btn phone-only"
			aria-label={t.common.backlog}
			aria-haspopup="dialog"
			onclick={openBacklog}
		>
			<Inbox size={17} />
		</button>
	</div>
</header>

<!-- Phones: the month, "Today" and the week's days (swipe the strip for other weeks). -->
<DayStrip
	monday={data.weekMonday}
	{selected}
	today={data.today}
	marked={openDays}
	markLabel={t.plan.hasOpenTasks}
	alerts={overdueOn}
	alertLabel={t.overdue.stripMark}
	hrefFor={dayLink}
	onselect={selectDay}
	onweek={stepWeek}
	month={data.monthLabel}
	todayLink={todayHref(page.url.search, ['other'])}
/>

<DaySwipe day={selected} onstep={(delta) => selectDay(stepDay(selected, delta).day)}>
	<div class="board" bind:this={board}>
		<div class="rail-slot">
			<BacklogColumn
				overdue={data.overdue}
				groups={data.backlogGroups}
				quests={data.visibleQuests}
				count={data.backlogCount}
				today={data.today}
				form={taskForm}
			/>
		</div>
		{#if weekEmpty}
			<div class="empty-week">
				<EmptyState
					icon={CalendarCheck}
					title={t.plan.emptyWeek.title}
					text={t.plan.emptyWeek.text}
					action={t.plan.emptyWeek.action}
					actionIcon={Plus}
					onaction={showWeek}
					testid="plan-empty"
				/>
			</div>
		{:else}
			{#each data.columns as col (col.day)}
				<PlanColumn
					{col}
					quests={data.visibleQuests}
					form={taskForm}
					ontoggleother={toggleOther}
					{overdueIds}
					selected={col.day === selected}
				/>
			{/each}
		{/if}
	</div>
</DaySwipe>

<Dialog bind:open={backlogOpen} title={t.common.backlog} onclosed={() => (backlogMounted = false)}>
	{#if backlogMounted}
		<BacklogColumn
			sheet
			day={selected}
			overdue={data.overdue}
			groups={data.backlogGroups}
			quests={data.visibleQuests}
			count={data.backlogCount}
			today={data.today}
			form={taskForm}
		/>
	{/if}
</Dialog>

<style>
	/* The board scrolls horizontally itself — the page never does. */
	.board {
		position: relative;
		display: flex;
		align-items: stretch;
		gap: var(--space-3);
		height: max(440px, calc(100dvh - var(--nav-h) - 170px));
		overflow-x: auto;
		overflow-y: hidden;
		padding-bottom: var(--space-2);
		scrollbar-color: var(--border-strong) transparent;
	}

	.rail-slot {
		display: contents;
	}
	.empty-week {
		flex: 1;
		display: grid;
		place-items: center;
		min-width: 0;
	}

	/* Phones: one day, full width (the day view); the backlog lives in a sheet. */
	@media (max-width: 720px) {
		.board {
			display: block;
			height: auto;
			overflow: visible;
			padding-bottom: 0;
		}
		.rail-slot {
			display: none;
		}
	}

	/* One toolbar: the large title left; week controls and the filter right (board). */
	.plan-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-8);
	}
	.tools {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.board-only {
		display: contents;
	}
	.round-btn {
		display: grid;
		place-items: center;
		width: var(--toolbar-btn);
		height: var(--toolbar-btn);
		padding: 0;
		border: none;
		border-radius: var(--radius-pill);
		background: var(--toolbar-btn-bg);
		color: var(--accent-text);
		transition: background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.round-btn:hover {
			background: var(--toolbar-btn-bg-hover);
		}
	}
	.phone-only {
		display: none;
	}

	/* Phones: title + filter + backlog on one line; the week moves by swiping the day strip. */
	@media (max-width: 720px) {
		.plan-head {
			margin-bottom: var(--space-4);
		}
		.board-only {
			display: none;
		}
		.phone-only {
			display: grid;
		}
	}
</style>
