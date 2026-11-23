<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Eye, EyeOff } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { formatHours, formatMinutes } from '#lib/dates.ts';
	import { nextHalfHourMinutes, type BlockEditor, type BlockFormResult } from '#lib/timeline.ts';
	import QuestFilter from '#lib/components/tasks/QuestFilter.svelte';
	import TaskAddForm from '#lib/components/tasks/TaskAddForm.svelte';
	import DayTaskCard from '#lib/components/tasks/DayTaskCard.svelte';
	import BacklogList from '#lib/components/home/BacklogList.svelte';
	import DayTimeline from '#lib/components/home/DayTimeline.svelte';
	import BlockDialog from '#lib/components/home/BlockDialog.svelte';
	import StreakStatus from '#lib/components/home/StreakStatus.svelte';
	import NextUpCard from '#lib/components/home/NextUpCard.svelte';
	import OverdueCard from '#lib/components/home/OverdueCard.svelte';
	import FirstQuestCard from '#lib/components/home/FirstQuestCard.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import QuestForm from '#lib/components/quests/QuestForm.svelte';
	import type { QuestFormResult } from '#lib/quest-form.ts';
	import { prefersReducedMotion, tickIn } from '#lib/motion.ts';
	import { groupEdges } from '#lib/ordering.ts';
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
	 * active session's running time — the same value as the avatar's goal ring.
	 */
	const todayMin = $derived(
		data.todayLog
			? Math.round(
					liveLoggedMin(data.todayLog, runningSpan(timer.timer, timer.view), timer.serverNow)
				)
			: 0
	);

	const todayLabel = $derived(formatHours(todayMin / 60, t.intl));

	/**
	 * "Next up" empty state: jump to the first add input that works right now — quest work,
	 * or Other while there is no open quest (keyboard opens in the tap).
	 */
	let mainCol = $state<HTMLElement>();
	function focusAdd() {
		const input = mainCol?.querySelector<HTMLInputElement>(
			'form.add:is([data-intent=addQuest], [data-intent=addOther]) input[name=title]'
		);
		if (!input) return;
		input.focus({ preventScroll: true });
		input.scrollIntoView({
			block: 'center',
			behavior: prefersReducedMotion() ? 'auto' : 'smooth'
		});
	}

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

	/** No open quest yet: the quest work add row gives way to "Create your first quest". */
	const noQuests = $derived(data.quests.length === 0);
	let creatingQuest = $state(false);
	/** Bumped on every open: a fresh create form (not reset while the sheet slides out). */
	let questNonce = $state(0);
	function startCreateQuest() {
		creatingQuest = true;
		questNonce += 1;
	}
	const questForm = $derived(form as QuestFormResult | undefined);

	/** The open "Time-block" dialog target (null = closed). */
	let blockEditor = $state<BlockEditor | null>(null);

	const taskForm = $derived(form as TaskFormResult | undefined);
	const blockForm = $derived(form as BlockFormResult | undefined);

	const weekPct = $derived(
		data.weekBudgetMin > 0
			? Math.min(100, Math.round((data.weekMin / data.weekBudgetMin) * 100))
			: 0
	);

	/** Fallback notice if a block submit failed while the dialog is closed (no-JS). */
	const blockFailed = $derived(
		blockEditor === null &&
			form != null &&
			form.ok === false &&
			(form.intent === 'block' || form.intent === 'blockUpdate')
	);

	/** `?q=` / `?hideDone=1` helpers — keep the other params and the scroll position. */
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

	function openTaskBlock(task: TaskWithQuest) {
		blockEditor = {
			taskId: task.id,
			taskTitle: task.title,
			start: formatMinutes(nextHalfHourMinutes()),
			duration: String(task.durationMin ?? 30)
		};
	}
	function openBlockEdit(block: BlockWithTask) {
		blockEditor = {
			taskId: block.taskId,
			blockId: block.id,
			taskTitle: block.taskTitle,
			start: formatMinutes(block.startMin),
			duration: String(block.endMin - block.startMin)
		};
	}
</script>

<p class="greeting">
	{t.home.greeting[data.greeting](data.profile?.displayName ?? null)}
</p>
<PageHeader title={data.title}>
	{#snippet actions()}
		<div class="day-stats">
			{#if streak}
				<StreakStatus {streak} name={data.profile?.displayName ?? null} />
			{/if}
			<p class="today tabular">
				{#key todayLabel}<strong in:tickIn>{todayLabel}</strong>{/key}
				<span>
					{data.dailyGoalMin
						? t.home.ofGoalToday(formatHours(data.dailyGoalMin / 60, t.intl))
						: t.home.today}
				</span>
			</p>
			<div class="week">
				<div
					class="bar"
					role="progressbar"
					aria-label={t.home.budgetBar}
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={weekPct}
				>
					<div class="bar-fill" style={`width: ${weekPct}%`}></div>
				</div>
				<span class="week-label tabular">
					{t.home.thisWeek(formatHours(data.weekMin / 60, t.intl))}
				</span>
			</div>
		</div>
	{/snippet}
</PageHeader>

{#if blockFailed}
	<p class="form-error" role="alert">
		{t.home.blockFailed}
	</p>
{/if}

<div class="overdue-slot">
	<OverdueCard tasks={data.overdue} today={data.day} />
</div>

<div class="today-grid">
	<div class="main-col" bind:this={mainCol}>
		<!-- Top of the task column: the timeline beside it keeps its place (now-line scroll). -->
		<NextUpCard questTasks={data.questTasks} otherTasks={data.otherTasks} onadd={focusAdd} />

		<div class="col-head">
			<h2 class="label">{t.home.questWork}</h2>
			{#if !noQuests}
				<QuestFilter quests={data.quests} selected={data.questFilter} onchange={setQuestFilter} />
			{/if}
		</div>

		{#if noQuests}
			<FirstQuestCard oncreate={startCreateQuest} />
		{:else}
			<TaskAddForm
				action="addQuest"
				placeholder={t.home.addQuestWork}
				quests={data.visibleQuests}
				showDuration
				form={taskForm}
			/>
		{/if}

		{#if data.questTasks.length > 0}
			<ul class="tasks">
				{#each data.questTasks as task, i (task.id)}
					<DayTaskCard
						{task}
						loggedMs={data.byTaskMs[task.id] ?? 0}
						{...groupEdges(data.questTasks, i)}
						ontimeblock={openTaskBlock}
					/>
				{/each}
			</ul>
		{/if}

		<BacklogList
			tasks={data.backlog}
			otherTasks={data.otherBacklog}
			quests={data.quests}
			form={taskForm}
		/>

		<div class="other-head">
			<h2 class="label">{t.common.other}</h2>
			<span class="rule" aria-hidden="true"></span>
			<a
				class="eye"
				href={hideDoneHref}
				aria-label={data.hideDone ? t.common.showDone : t.common.hideDone}
				title={data.hideDone ? t.common.showDone : t.common.hideDone}
			>
				{#if data.hideDone}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
			</a>
		</div>

		<TaskAddForm action="addOther" placeholder={t.tasks.addTask} form={taskForm} />

		{#if data.otherTasks.length > 0}
			<ul class="tasks">
				{#each data.otherTasks as task, i (task.id)}
					<DayTaskCard
						{task}
						loggedMs={data.byTaskMs[task.id] ?? 0}
						{...groupEdges(data.otherTasks, i)}
						ontimeblock={openTaskBlock}
					/>
				{/each}
			</ul>
		{/if}
	</div>

	<aside class="side-col" aria-label={t.home.timeline}>
		<DayTimeline blocks={data.blocks} now={data.now} onedit={openBlockEdit} />
	</aside>
</div>

<Dialog bind:open={creatingQuest} title={t.quests.newQuest}>
	{#key questNonce}
		<QuestForm mode="create" form={questForm} ondone={() => (creatingQuest = false)} />
	{/key}
</Dialog>

{#if blockEditor}
	<BlockDialog editor={blockEditor} form={blockForm} onclose={() => (blockEditor = null)} />
{/if}

<style>
	.greeting {
		margin-bottom: var(--space-2);
		color: var(--text-muted);
		font-size: var(--fs-lg);
	}
	.day-stats {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-6);
		padding-bottom: var(--space-1);
	}
	/*
	 * Phones: one compact summary row — today vs. goal and the streak chip. The streak hint
	 * and the week budget bar stay on wider screens (details live in Review / the menu).
	 */
	@media (max-width: 720px) {
		.greeting {
			margin-bottom: var(--space-1);
			font-size: var(--fs-md);
		}
		.day-stats {
			flex-wrap: nowrap;
			column-gap: var(--space-4);
			padding-bottom: 0;
		}
		.day-stats > :global(.streak) {
			order: 1;
			min-width: 0;
		}
		.day-stats :global(.streak .hint),
		.day-stats .week {
			display: none;
		}
	}
	.today {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		white-space: nowrap;
	}
	.today strong {
		display: inline-block;
		color: var(--text);
		font-size: var(--fs-xl);
		font-weight: var(--fw-semibold);
		letter-spacing: -0.01em;
	}
	.week {
		display: grid;
		justify-items: start;
		gap: 4px;
		width: 92px;
	}
	.bar {
		width: 100%;
		height: 5px;
		border-radius: 99px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
		border-radius: 99px;
		background: var(--accent);
		transition: width var(--dur) var(--ease);
	}
	.week-label {
		color: var(--text-faint);
		font-size: var(--fs-xs);
		white-space: nowrap;
	}

	.form-error {
		color: var(--danger);
		font-size: var(--fs-sm);
		margin: calc(-1 * var(--space-6)) 0 var(--space-4);
	}

	/* The overdue card lines up with the task column (desktop), above the grid. */
	.overdue-slot {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		column-gap: var(--space-10);
	}
	.today-grid {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		gap: var(--space-10);
		align-items: start;
	}
	.main-col {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: var(--space-3);
		min-width: 0;
	}
	.main-col > :global(.section) {
		margin-top: var(--space-5);
	}

	.col-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-1);
	}

	.tasks {
		display: grid;
		gap: var(--space-3);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.other-head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-6);
	}
	.other-head .rule {
		flex: 1;
		border-top: 1px solid var(--border);
	}
	.eye {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text-muted);
		transition:
			color var(--dur) var(--ease),
			border-color var(--dur) var(--ease);
	}
	.eye:hover {
		color: var(--text);
		border-color: var(--border-strong);
	}

	.side-col {
		min-width: 0;
	}

	@media (max-width: 1000px) {
		.today-grid,
		.overdue-slot {
			grid-template-columns: 1fr;
		}
	}
</style>
