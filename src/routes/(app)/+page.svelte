<script lang="ts">
	import { untrack } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { Inbox, Rows3 } from '@lucide/svelte';
	import { addDays, formatHours, formatMinutes } from '#lib/dates.ts';
	import {
		nextHalfHourMinutes,
		planSummary,
		type BlockEditor,
		type BlockFormResult
	} from '#lib/timeline.ts';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import GroupedNavRow from '#lib/components/GroupedNavRow.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import BacklogList from '#lib/components/home/BacklogList.svelte';
	import BlockDialog from '#lib/components/home/BlockDialog.svelte';
	import DayPlanCard from '#lib/components/home/DayPlanCard.svelte';
	import DayTimeline from '#lib/components/home/DayTimeline.svelte';
	import AllDoneCard from '#lib/components/home/AllDoneCard.svelte';
	import FirstQuestCard from '#lib/components/home/FirstQuestCard.svelte';
	import NextUpCard from '#lib/components/home/NextUpCard.svelte';
	import OverdueGroup from '#lib/components/home/OverdueGroup.svelte';
	import StreakStatus from '#lib/components/home/StreakStatus.svelte';
	import TodayList from '#lib/components/home/TodayList.svelte';
	import QuestForm from '#lib/components/quests/QuestForm.svelte';
	import type { QuestFormResult } from '#lib/quest-form.ts';
	import { prefersReducedMotion, tickIn } from '#lib/motion.ts';
	import { BACKLOG_PARAM } from '#lib/nav.ts';
	import { isAllDone } from '#lib/next-up.ts';
	import { planDayHref } from '#lib/day-view.ts';
	import { mergeDayLists } from '#lib/ordering.ts';
	import type { TaskFormResult } from '#lib/task-form.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import type { BlockWithTask } from '#lib/server/blocks.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { liveLoggedMin, runningSpan } from '#lib/daily-goal.ts';
	import { pageStreak } from '#lib/streak.ts';

	let { data, form } = $props();
	const t = useI18n();
	const timer = useTimer();

	/**
	 * Minutes logged today: the root layout's server number (completed sessions) plus the
	 * active session's running time — the same value as the nav's goal ring at Home.
	 */
	const todayMin = $derived(
		data.todayLog
			? Math.round(
					liveLoggedMin(data.todayLog, runningSpan(timer.timer, timer.view), timer.serverNow)
				)
			: 0
	);
	const todayLabel = $derived(formatHours(todayMin / 60, t.intl));

	/** The streak with today's live minutes — flips `pending → active` while a session runs. */
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

	/** Nothing open today (nor overdue): Next up becomes the "All done" card. */
	const allDone = $derived(isAllDone({ ...data.dayCounts, overdue: data.overdue.length }));

	/** Quest work and Other as one list: open first, each stored list in its order. */
	const rows = $derived(mergeDayLists(data.questTasks, data.otherTasks));

	/** "Next up" empty state: jump to the add row (keyboard opens in the tap). */
	let mainCol = $state<HTMLElement>();
	function focusAdd() {
		const input = mainCol?.querySelector<HTMLInputElement>(
			'form.add[data-intent=add] input[name=title]'
		);
		if (!input) return;
		input.focus({ preventScroll: true });
		input.scrollIntoView({
			block: 'center',
			behavior: prefersReducedMotion() ? 'auto' : 'smooth'
		});
	}

	/** No open quest yet: "Create your first quest" under the list (Other works meanwhile). */
	const noQuests = $derived(data.quests.length === 0);
	let creatingQuest = $state(false);
	/** Bumped on every open: a fresh create form (not reset while the sheet slides out). */
	let questNonce = $state(0);
	function startCreateQuest() {
		creatingQuest = true;
		questNonce += 1;
	}
	const questForm = $derived(form as QuestFormResult | undefined);
	const taskForm = $derived(form as TaskFormResult | undefined);
	const blockForm = $derived(form as BlockFormResult | undefined);

	/* ── Sheets: content mounts on open, unmounts after the exit animation ─────────────── */

	let backlogOpen = $state(false);
	let backlogMounted = $state(false);
	function openBacklog() {
		backlogMounted = true;
		backlogOpen = true;
	}
	const backlogCount = $derived(data.backlog.length + data.otherBacklog.length);
	// A failed backlog add without JS comes back as a fresh page: show it in the open sheet.
	if (untrack(() => taskForm?.intent === 'addBacklog' && taskForm.errors)) openBacklog();

	// `?backlog=1` (the palette's target for a task without a day): open the sheet, then drop
	// the parameter again so a reload or "back" doesn't reopen it.
	$effect(() => {
		if (page.url.searchParams.get(BACKLOG_PARAM) !== '1') return;
		untrack(() => {
			openBacklog();
			const url = new URL(page.url.href);
			url.searchParams.delete(BACKLOG_PARAM);
			void replaceState(url, page.state);
		});
	});

	let planOpen = $state(false);
	let planMounted = $state(false);
	function openPlan() {
		planMounted = true;
		planOpen = true;
	}
	const plan = $derived(planSummary(data.blocks, data.now));
	const planText = $derived(
		plan.kind === 'now'
			? t.homeList.planNow(plan.block.taskTitle)
			: plan.kind === 'next'
				? t.homeList.planNext(formatMinutes(plan.block.startMin), plan.block.taskTitle)
				: plan.kind === 'past'
					? t.homeList.planPast(plan.count)
					: t.homeList.planEmpty
	);

	/* ── Time blocks ───────────────────────────────────────────────────────────────────── */

	/** The open "Time-block" dialog target (null = closed). */
	let blockEditor = $state<BlockEditor | null>(null);

	/** Fallback notice if a block submit failed while the dialog is closed (no-JS). */
	const blockFailed = $derived(
		blockEditor === null &&
			form != null &&
			form.ok === false &&
			(form.intent === 'block' || form.intent === 'blockUpdate')
	);

	function openTaskBlock(task: TaskWithQuest) {
		blockEditor = {
			taskId: task.id,
			taskTitle: task.title,
			start: formatMinutes(nextHalfHourMinutes()),
			duration: String(task.durationMin ?? 30)
		};
	}
	function openBlockEdit(block: BlockWithTask) {
		planOpen = false; // from the phone sheet: the block dialog takes its place
		blockEditor = {
			taskId: block.taskId,
			blockId: block.id,
			taskTitle: block.taskTitle,
			start: formatMinutes(block.startMin),
			duration: String(block.endMin - block.startMin)
		};
	}

	/* ── `?q=` / `?hideDone=1` — keep the other params and the scroll position ─────────── */

	function urlWith(set: URLSearchParams): string {
		const qs = set.toString();
		return qs ? `?${qs}` : '?';
	}
	function setQuestFilter(ids: string[] | null) {
		const p = new URLSearchParams(page.url.searchParams.toString());
		if (ids) p.set('q', ids.join(','));
		else p.delete('q');
		void goto(urlWith(p), { reset: false });
	}
	const hideDoneHref = $derived.by(() => {
		const p = new URLSearchParams(page.url.searchParams.toString());
		if (data.hideDone) p.delete('hideDone');
		else p.set('hideDone', '1');
		return urlWith(p);
	});
</script>

<div class="home">
	<div class="main-col" bind:this={mainCol}>
		<header class="hero">
			<p class="greeting">
				{t.home.greeting[data.greeting](data.profile?.displayName ?? null)}
			</p>
			<h1>{data.title}</h1>
			<p class="meta">
				<span class="item tabular" data-testid="today-logged">
					{#key todayLabel}<strong in:tickIn>{todayLabel}</strong>{/key}
					{data.dailyGoalMin
						? t.home.ofGoalToday(formatHours(data.dailyGoalMin / 60, t.intl))
						: t.home.today}
				</span>
				<span class="item week tabular">
					<span class="sep" aria-hidden="true">·</span>
					<span data-testid="week-logged">
						{t.home.thisWeek(formatHours(data.weekMin / 60, t.intl))}
					</span>
				</span>
				{#if streak}
					<span class="item">
						<span class="sep" aria-hidden="true">·</span>
						<StreakStatus {streak} name={data.profile?.displayName ?? null} />
					</span>
				{/if}
			</p>
		</header>

		{#if blockFailed}
			<p class="form-error" role="alert">{t.home.blockFailed}</p>
		{/if}

		{#if allDone}
			<AllDoneCard
				total={data.dayCounts.total}
				loggedMin={todayMin}
				goalMin={data.dailyGoalMin ?? null}
				tomorrowHref={planDayHref(addDays(data.day, 1))}
			/>
		{:else}
			<NextUpCard
				questTasks={data.questTasks}
				otherTasks={data.otherTasks}
				overdueCount={data.overdue.length}
				onadd={focusAdd}
			/>
		{/if}

		<OverdueGroup tasks={data.overdue} today={data.day} />

		<TodayList
			{rows}
			byTaskMs={data.byTaskMs}
			quests={data.quests}
			pickable={data.visibleQuests}
			questFilter={data.questFilter}
			onfilter={setQuestFilter}
			hideDone={data.hideDone}
			{hideDoneHref}
			form={taskForm}
			ontimeblock={openTaskBlock}
		/>

		{#if noQuests}
			<FirstQuestCard oncreate={startCreateQuest} />
		{/if}
	</div>

	<div class="side-col">
		<GroupedList label={t.common.backlog}>
			<GroupedNavRow
				label={t.common.backlog}
				ariaLabel={t.homeList.backlogRow(backlogCount)}
				count={backlogCount}
				dialog
				testid="backlog-row"
				onclick={openBacklog}
			>
				{#snippet icon()}<Inbox size={16} />{/snippet}
			</GroupedNavRow>
			<!-- Phones / narrow screens: the daily plan is a row that opens the whole day. -->
			<div class="plan-row">
				<GroupedNavRow
					label={t.homeList.dailyPlan}
					value={planText}
					dialog
					testid="plan-row"
					onclick={openPlan}
				>
					{#snippet icon()}<Rows3 size={16} />{/snippet}
				</GroupedNavRow>
			</div>
		</GroupedList>

		<div class="plan-card">
			<DayPlanCard blocks={data.blocks} now={data.now} onedit={openBlockEdit} />
		</div>
	</div>
</div>

<Dialog bind:open={creatingQuest} title={t.quests.newQuest}>
	{#key questNonce}
		<QuestForm mode="create" form={questForm} ondone={() => (creatingQuest = false)} />
	{/key}
</Dialog>

<Dialog bind:open={backlogOpen} title={t.common.backlog} onclosed={() => (backlogMounted = false)}>
	{#if backlogMounted}
		<BacklogList
			tasks={data.backlog}
			otherTasks={data.otherBacklog}
			quests={data.quests}
			form={taskForm}
		/>
	{/if}
</Dialog>

<Dialog bind:open={planOpen} title={t.homeList.dailyPlan} onclosed={() => (planMounted = false)}>
	{#if planMounted}
		<DayTimeline blocks={data.blocks} now={data.now} range="day" onedit={openBlockEdit} />
		{#if data.blocks.length === 0}<p class="plan-hint">{t.homeList.planHint}</p>{/if}
	{/if}
</Dialog>

{#if blockEditor}
	<BlockDialog editor={blockEditor} form={blockForm} onclose={() => (blockEditor = null)} />
{/if}

<style>
	/*
	 * Variant A (O3a): one column of lists — header, Next up, Overdue, Today — and a slim
	 * right column (Backlog row, the daily plan around now). Narrower: one column, the right
	 * column's rows under the list, the daily plan as a row that opens a sheet.
	 */
	.home {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--home-side);
		gap: var(--space-10);
		align-items: start;
	}
	.main-col {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-6);
		min-width: 0;
	}
	.main-col > :global(.next) {
		margin-bottom: 0;
	}
	.side-col {
		display: grid;
		gap: var(--space-4);
		min-width: 0;
		padding-top: var(--space-2);
	}

	.hero {
		display: grid;
		gap: var(--space-1);
	}
	.greeting {
		color: var(--text-muted);
		font-size: var(--fs-md);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-2);
		margin-top: var(--space-1);
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.meta .item {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		white-space: nowrap;
	}
	.meta strong {
		display: inline-block;
		color: var(--text);
		font-weight: var(--fw-semibold);
	}
	.sep {
		color: var(--text-faint);
	}

	.form-error {
		color: var(--danger);
		font-size: var(--fs-sm);
	}

	.plan-row {
		display: none;
	}
	.plan-hint {
		padding-top: var(--space-2);
		color: var(--text-faint);
		font-size: var(--fs-xs);
	}

	@media (max-width: 1000px) {
		.home {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-6);
		}
		.side-col {
			padding-top: 0;
		}
		.plan-row {
			display: block;
		}
		.plan-card {
			display: none;
		}
	}

	/* Phones: less at once — no week total (Review has it). */
	@media (max-width: 720px) {
		.main-col,
		.home {
			gap: var(--space-5);
		}
		.greeting {
			font-size: var(--fs-sm);
		}
		.meta .week {
			display: none;
		}
	}
</style>
