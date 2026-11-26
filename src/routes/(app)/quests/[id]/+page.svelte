<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowDown, ArrowUp, CalendarClock, ChevronLeft, Sun, Trash2 } from '@lucide/svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Menu from '#lib/components/Menu.svelte';
	import QuestForm from '#lib/components/quests/QuestForm.svelte';
	import QuestTaskRow from '#lib/components/quests/QuestTaskRow.svelte';
	import TaskAddForm from '#lib/components/tasks/TaskAddForm.svelte';
	import { formatDayLabel, formatHours } from '#lib/dates.ts';
	import { formatDurationMin, formatDurationMs } from '#lib/duration.ts';
	import { formAction } from '#lib/form-action.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { QuestFormResult } from '#lib/quest-form.ts';
	import type { TaskFormResult } from '#lib/task-form.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import type { PageProps } from './$types';

	/**
	 * Quest detail (AB2): a toolbar (‹ Quests, Edit), the emoji in a tile tinted with the quest
	 * colour and the name as the large title, a summary card (this week / budget, a bar, this
	 * quarter), then the Backlog and Scheduled as inset grouped lists — ↑/↓, Today, Tomorrow and
	 * Delete in each backlog row's ⋯, "+ Add to backlog…" as its last row.
	 */
	let { data, form }: PageProps = $props();
	const t = useI18n();

	const quest = $derived(data.quest);
	const summary = $derived(data.summary);
	/** The page's one `form`: the add row's echo or the quest dialog's (by `intent`). */
	const taskForm = $derived(form as TaskFormResult | undefined);
	const questForm = $derived(form as QuestFormResult | undefined);

	/** "71.7h this quarter · 88% of target" (the percentage only with a budget). */
	const quarterLine = $derived(
		[
			t.quests.card.thisQuarter(formatHours(summary.quarterH, t.intl)),
			summary.quarterPct !== null ? t.common.pctOfTarget(summary.quarterPct) : null
		]
			.filter(Boolean)
			.join(' · ')
	);

	/** "Mon, Nov 23 · 1 h 30 min planned" — logged time wins over the plan (like Home). */
	function scheduledLine(task: (typeof data.scheduled)[number]): string {
		const day = formatDayLabel(
			task.day,
			{ weekday: 'short', month: 'short', day: 'numeric' },
			t.intl
		);
		const logged = data.loggedMs[task.id] ?? 0;
		const duration =
			logged > 0
				? t.tasks.loggedDuration(formatDurationMs(logged, t.intl))
				: task.durationMin !== null
					? t.tasks.plannedDuration(formatDurationMin(task.durationMin, t.intl))
					: null;
		return duration ? `${day} · ${duration}` : day;
	}

	let editing = $state(false);
	/** Bumped on every open so the edit form always starts from the saved quest values. */
	let editNonce = $state(0);
	function startEdit() {
		editing = true;
		editNonce += 1;
	}
</script>

<svelte:head><title>{quest.name} · libe</title></svelte:head>

<div class="detail" style:--q={questColorVar(quest.color)}>
	<div class="toolbar">
		<a class="tool-link" href="/quests">
			<ChevronLeft size={22} strokeWidth={2.25} aria-hidden="true" />{t.quests.backToQuests}
		</a>
		<button type="button" class="tool-link edit" onclick={startEdit}>{t.common.edit}</button>
	</div>

	<header class="head">
		<span class="tile" aria-hidden="true">{quest.icon}</span>
		<div class="head-text">
			<h1>{quest.name}</h1>
			{#if quest.description}<p class="desc">{quest.description}</p>{/if}
			{#if quest.closedAt !== null}<p class="closed label">{t.common.closedQuest}</p>{/if}
		</div>
	</header>

	<section class="summary" aria-label={t.quests.timeSummary} data-testid="quest-summary">
		<p class="figure tabular">
			<span class="big">{formatHours(summary.weekH, t.intl)}</span>
			<span class="of">
				{summary.budgetH !== null
					? t.quests.weekOfBudget(formatHours(summary.budgetH, t.intl))
					: t.quests.thisWeek}
			</span>
		</p>
		{#if summary.weekFill !== null}
			<span class="bar" aria-hidden="true"><i style:--fill={summary.weekFill}></i></span>
		{/if}
		<p class="quarter tabular">{quarterLine}</p>
	</section>

	<section class="group" aria-labelledby="backlog-head" data-testid="quest-backlog">
		<h2 class="group-head" id="backlog-head">{t.common.backlog}</h2>
		<ul class="rows">
			{#each data.backlog as task, i (task.id)}
				<QuestTaskRow {task}>
					{#snippet trail()}
						{#if task.durationMin !== null}
							{formatDurationMin(task.durationMin, t.intl)}
							<span class="sr-only">{t.tasks.planned}</span>
						{/if}
					{/snippet}
					{#snippet menu()}
						<Menu label={t.common.actionsFor(task.title)}>
							{#snippet children(close)}
								<form method="POST" action={formAction('moveUp')} use:enhance={() => close()}>
									<input type="hidden" name="taskId" value={task.id} />
									<button type="submit" class="item" role="menuitem" disabled={i === 0}>
										<ArrowUp size={14} />
										{t.common.moveUp}
									</button>
								</form>
								<form method="POST" action={formAction('moveDown')} use:enhance={() => close()}>
									<input type="hidden" name="taskId" value={task.id} />
									<button
										type="submit"
										class="item"
										role="menuitem"
										disabled={i === data.backlog.length - 1}
									>
										<ArrowDown size={14} />
										{t.common.moveDown}
									</button>
								</form>
								<span class="sep" aria-hidden="true"></span>
								<form method="POST" action={formAction('today')} use:enhance={() => close()}>
									<input type="hidden" name="taskId" value={task.id} />
									<button type="submit" class="item" role="menuitem">
										<Sun size={14} />
										{t.tasks.moveToToday}
									</button>
								</form>
								<form method="POST" action={formAction('tomorrow')} use:enhance={() => close()}>
									<input type="hidden" name="taskId" value={task.id} />
									<button type="submit" class="item" role="menuitem">
										<CalendarClock size={14} />
										{t.tasks.moveToTomorrow}
									</button>
								</form>
								<span class="sep" aria-hidden="true"></span>
								<form method="POST" action={formAction('delete')} use:enhance={() => close()}>
									<input type="hidden" name="taskId" value={task.id} />
									<button type="submit" class="item danger" role="menuitem">
										<Trash2 size={14} />
										{t.common.delete}
									</button>
								</form>
							{/snippet}
						</Menu>
					{/snippet}
				</QuestTaskRow>
			{/each}
			<li class="add-slot">
				<TaskAddForm
					action="add"
					placeholder={t.tasks.addToBacklog}
					row
					showDuration
					form={taskForm}
				/>
			</li>
		</ul>
		{#if data.backlog.length === 0}<p class="group-foot">{t.quests.backlogEmpty}</p>{/if}
	</section>

	<section class="group" aria-labelledby="scheduled-head" data-testid="quest-scheduled">
		<h2 class="group-head" id="scheduled-head">{t.quests.scheduled}</h2>
		{#if data.scheduled.length > 0}
			<ul class="rows">
				{#each data.scheduled as task (task.id)}
					<QuestTaskRow {task}>
						{#snippet sub()}
							{scheduledLine(task)}
						{/snippet}
					</QuestTaskRow>
				{/each}
			</ul>
		{:else}
			<p class="group-foot">{t.quests.scheduledEmpty}</p>
		{/if}
	</section>
</div>

<Dialog bind:open={editing} title={t.quests.editQuest}>
	{#key editNonce}
		<QuestForm mode="update" {quest} form={questForm} ondone={() => (editing = false)} />
	{/key}
</Dialog>

<style>
	.detail {
		display: grid;
		gap: var(--space-6);
		max-width: var(--detail-col);
		margin: 0 auto;
		min-width: 0;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin: calc(-1 * var(--space-3)) calc(-1 * var(--space-2)) calc(-1 * var(--space-2));
	}
	.tool-link {
		display: inline-flex;
		align-items: center;
		min-height: var(--hit-min);
		padding: 0 var(--space-2) 0 0;
		border: 0;
		background: transparent;
		color: var(--accent-text);
		font-size: var(--fs-md);
	}
	.tool-link.edit {
		padding: 0 var(--space-2);
	}
	@media (hover: hover) {
		.tool-link:hover {
			color: var(--text);
		}
	}

	.head {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		min-width: 0;
	}
	.tile {
		flex: none;
		display: grid;
		place-items: center;
		width: var(--detail-tile);
		height: var(--detail-tile);
		border-radius: var(--radius-cta);
		background: color-mix(in srgb, var(--q) var(--detail-tile-tint), var(--surface));
		font-size: var(--fs-detail-tile);
		line-height: 1;
	}
	.head-text {
		display: grid;
		gap: var(--space-1);
		min-width: 0;
	}
	.head-text h1 {
		overflow-wrap: anywhere;
	}
	.desc {
		max-width: 60ch;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.summary {
		display: grid;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg);
	}
	.figure {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
	}
	.big {
		font-size: var(--fs-2xl-phone);
		font-weight: var(--fw-figure);
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.of {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
	}
	.bar {
		display: block;
		height: var(--chart-track-h);
		border-radius: var(--radius-pill);
		background: var(--track-raised);
		overflow: hidden;
	}
	.bar i {
		display: block;
		width: calc(100% * var(--fill));
		height: 100%;
		border-radius: inherit;
		background: var(--q);
	}
	.quarter {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.group {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	.group-head {
		padding: 0 var(--grouped-inset);
		font-size: var(--fs-label);
		font-weight: var(--fw-semibold);
		color: var(--text-muted);
	}
	.group-foot {
		padding: 0 var(--grouped-inset);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow: hidden;
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg);
	}
	.rows > :global(li) {
		position: relative;
	}
	/* Hairline between rows, inset to the text (past the check ring) like Home's list. */
	.rows > :global(li + li)::before {
		content: '';
		position: absolute;
		top: 0;
		left: calc(var(--grouped-inset) + var(--row-check) + var(--space-3));
		right: 0;
		height: 1px;
		background: var(--grouped-separator);
		pointer-events: none;
	}

	/* menu items (as in Home's rows) */
	.item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		padding: var(--space-2) var(--space-3);
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: var(--text-2);
		font-size: var(--fs-sm);
		text-align: left;
		white-space: nowrap;
	}
	.item:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text);
	}
	.item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.item.danger {
		color: var(--danger);
	}
	.sep {
		display: block;
		height: 1px;
		margin: var(--space-1) var(--space-2);
		background: var(--border);
	}
</style>
