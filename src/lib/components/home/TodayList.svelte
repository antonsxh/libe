<script lang="ts">
	import { Eye, EyeOff } from '@lucide/svelte';
	import QuestFilter from '#lib/components/tasks/QuestFilter.svelte';
	import TaskAddForm from '#lib/components/tasks/TaskAddForm.svelte';
	import TodayRow from '#lib/components/home/TodayRow.svelte';
	import type { QuestOption } from '#lib/components/tasks/QuestPicker.svelte';
	import type { MergedRow } from '#lib/ordering.ts';
	import type { Quest } from '#lib/server/db/schema.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import type { TaskFormResult } from '#lib/task-form.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import { listFlip, tickIn } from '#lib/motion.ts';
	import { untrack } from 'svelte';

	/**
	 * Home's one "Today" list (variant A, O3a): quest work and Other in one inset grouped list
	 * (`mergeDayLists`), the quest filter funnel and the done toggle in its header, and one add
	 * row at its end — quest or Other from the picker, Enter/Add at the bottom, Shift+Enter on
	 * top (form action `add`).
	 */
	type Props = {
		rows: MergedRow<TaskWithQuest>[];
		byTaskMs: Record<string, number>;
		/** Open quests (the funnel); empty → no funnel. */
		quests: Quest[];
		/** Quests matching `?q=` — the add row's picker (plus Other). */
		pickable: QuestOption[];
		questFilter: string[] | null;
		onfilter: (ids: string[] | null) => void;
		hideDone: boolean;
		hideDoneHref: string;
		form?: TaskFormResult;
		ontimeblock: (task: TaskWithQuest) => void;
	};
	let {
		rows,
		byTaskMs,
		quests,
		pickable,
		questFilter,
		onfilter,
		hideDone,
		hideDoneHref,
		form,
		ontimeblock
	}: Props = $props();
	const t = useI18n();

	const open = $derived(rows.filter((r) => r.task.doneAt === null).length);

	/** A checked-off row glides to its new place (the done group) instead of jumping. */
	let list = $state<HTMLUListElement>();
	const flip = listFlip('task');
	$effect.pre(() => {
		void rows;
		untrack(() => flip.measure(list));
	});
	$effect(() => {
		void rows;
		untrack(() => flip.play(list));
	});
</script>

<section class="today" aria-labelledby="today-head">
	<div class="head">
		<h2 id="today-head">{t.common.today}</h2>
		<span class="count tabular">
			{#key open}<span class="tick" in:tickIn>{t.homeList.open(open)}</span>{/key}
		</span>
		<span class="tools">
			{#if quests.length > 0}
				<QuestFilter {quests} selected={questFilter} onchange={onfilter} />
			{/if}
			<a
				class="eye hit-target"
				href={hideDoneHref}
				data-sveltekit-reset="false"
				aria-label={hideDone ? t.common.showDone : t.common.hideDone}
				title={hideDone ? t.common.showDone : t.common.hideDone}
			>
				{#if hideDone}<EyeOff size={16} />{:else}<Eye size={16} />{/if}
			</a>
		</span>
	</div>

	<ul class="group" data-testid="today-list" bind:this={list}>
		{#each rows as row (row.task.id)}
			<TodayRow
				task={row.task}
				loggedMs={byTaskMs[row.task.id] ?? 0}
				first={row.first}
				last={row.last}
				{ontimeblock}
			/>
		{/each}
		<li class="add-slot">
			<TaskAddForm
				action="add"
				placeholder={t.tasks.addTask}
				quests={pickable}
				otherOption
				showDuration
				row
				{form}
			/>
		</li>
	</ul>
</section>

<style>
	.today {
		display: grid;
		gap: var(--space-2);
		min-width: 0;
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: 0 var(--space-1);
	}
	.head h2 {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		letter-spacing: -0.01em;
	}
	.count {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.tick {
		display: inline-block;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin-left: auto;
	}
	.eye {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		transition:
			color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.eye:hover {
			color: var(--text);
			background: var(--surface-hover);
		}
	}

	.group {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow: hidden;
		border-radius: var(--grouped-radius);
		background: var(--grouped-bg);
	}
	.group > :global(li) {
		position: relative;
	}
	/* Hairline between rows, inset to the text (past the round check). */
	.group > :global(li + li)::before {
		content: '';
		position: absolute;
		top: 0;
		left: calc(var(--grouped-inset) + var(--row-check) + var(--space-3));
		right: 0;
		height: 1px;
		background: var(--grouped-separator);
		pointer-events: none;
	}
</style>
