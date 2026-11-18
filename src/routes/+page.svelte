<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Eye, EyeOff } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { formatHours, formatMinutes } from '#lib/dates.ts';
	import { nextHalfHourMinutes, type BlockEditor, type BlockFormResult } from '#lib/timeline.ts';
	import QuestFilter from '#lib/components/home/QuestFilter.svelte';
	import TaskAddForm from '#lib/components/home/TaskAddForm.svelte';
	import DayTaskCard from '#lib/components/home/DayTaskCard.svelte';
	import BacklogList from '#lib/components/home/BacklogList.svelte';
	import DayTimeline from '#lib/components/home/DayTimeline.svelte';
	import BlockDialog from '#lib/components/home/BlockDialog.svelte';
	import type { TaskFormResult } from '#lib/task-form.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import type { BlockWithTask } from '#lib/server/blocks.ts';

	let { data, form } = $props();

	/** Open and done tasks are separate groups: ↑/↓ never crosses between them (see `moveTask`). */
	const isDone = (t: { doneAt: Date | string | null }) => t.doneAt !== null;
	function groupEdges(list: TaskWithQuest[], i: number) {
		return {
			first: i === 0 || isDone(list[i - 1]) !== isDone(list[i]),
			last: i === list.length - 1 || isDone(list[i + 1]) !== isDone(list[i])
		};
	}

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

<PageHeader title={data.title}>
	{#snippet actions()}
		<div class="day-stats">
			<p class="today tabular">
				<strong>{formatHours(data.todayMin / 60)}</strong> <span>today</span>
			</p>
			<div class="week">
				<div
					class="bar"
					role="progressbar"
					aria-label="Share of this week's quest budget used"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={weekPct}
				>
					<div class="bar-fill" style={`width: ${weekPct}%`}></div>
				</div>
				<span class="week-label tabular">{formatHours(data.weekMin / 60)} this week</span>
			</div>
		</div>
	{/snippet}
</PageHeader>

{#if blockFailed}
	<p class="form-error" role="alert">
		That time block could not be saved — start before end, and keep it within 00:00–24:00.
	</p>
{/if}

<div class="today-grid">
	<div class="main-col">
		<div class="col-head">
			<h2 class="label">Quest work</h2>
			<QuestFilter quests={data.quests} selected={data.questFilter} onchange={setQuestFilter} />
		</div>

		<TaskAddForm
			action="addQuest"
			placeholder="Add quest work…"
			quests={data.visibleQuests}
			topBottom
			showDuration
			form={taskForm}
		/>

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

		<BacklogList tasks={data.backlog} quests={data.quests} form={taskForm} />

		<div class="other-head">
			<h2 class="label">Other</h2>
			<span class="rule" aria-hidden="true"></span>
			<a
				class="eye"
				href={hideDoneHref}
				aria-label={data.hideDone ? 'Show done tasks' : 'Hide done tasks'}
				title={data.hideDone ? 'Show done tasks' : 'Hide done tasks'}
			>
				{#if data.hideDone}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
			</a>
		</div>

		<TaskAddForm action="addOther" placeholder="Add a task…" topBottom form={taskForm} />

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

	<aside class="side-col" aria-label="Timeline">
		<DayTimeline blocks={data.blocks} now={data.now} onedit={openBlockEdit} />
	</aside>
</div>

{#if blockEditor}
	<BlockDialog editor={blockEditor} form={blockForm} onclose={() => (blockEditor = null)} />
{/if}

<style>
	.day-stats {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding-bottom: var(--space-1);
	}
	.today {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		white-space: nowrap;
	}
	.today strong {
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
		.today-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
