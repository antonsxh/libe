<script lang="ts">
	import { formatDurationMin } from '#lib/duration.ts';
	import { Play, Plus } from '@lucide/svelte';
	import Button from '#lib/components/Button.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import { fadeScale } from '#lib/motion.ts';
	import { nextUp } from '#lib/next-up.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	type Props = {
		/** Home's lists in display order (open tasks first). */
		questTasks: TaskWithQuest[];
		otherTasks: TaskWithQuest[];
		/** Open overdue tasks (today's list may be done while these are still open). */
		overdueCount: number;
		/** Empty state: move focus to the add-task input. */
		onadd: () => void;
	};
	let { questTasks, otherTasks, overdueCount, onadd }: Props = $props();

	const timer = useTimer();
	const t = useI18n();
	const next = $derived(nextUp(questTasks, otherTasks));

	/** Same start as the task card's ▶, but stays on Home: the mini-player takes over. */
	function start(task: TaskWithQuest) {
		void timer.start({ task: { id: task.id, title: task.title }, mode: 'focus' });
	}
</script>

<!--
	Home's one primary "what now?" while no timer is active (phones and desktop) — with a timer
	the mini-player (phones) / the nav's timer chip (desktop) is the "now".
-->
{#if timer.timer === null}
	<section class="next" aria-labelledby="next-up-label" data-testid="next-up" transition:fadeScale>
		{#if next.kind === 'task'}
			{@const task = next.task}
			<div class="card task" style:--q={questColorVar(task.questColor)}>
				<p class="label" id="next-up-label">{t.home.nextUp.label}</p>
				<p class="title">{task.title}</p>
				{#if task.questName || task.durationMin}
					<p class="meta">
						{#if task.questId && task.questName}
							<QuestPill color={task.questColor} label={task.questName} />
						{/if}
						{#if task.durationMin}
							<span class="muted tabular">{formatDurationMin(task.durationMin, t.intl)}</span>
						{/if}
					</p>
				{/if}
				<div class="cta">
					<Button
						variant="primary"
						aria-label={t.home.nextUp.startAria(task.title)}
						disabled={timer.busy}
						onclick={() => start(task)}
					>
						<Play size={18} fill="currentColor" strokeWidth={0} />
						{t.home.nextUp.start}
					</Button>
				</div>
			</div>
		{:else}
			<div class="card empty">
				<p class="label" id="next-up-label">{t.home.nextUp.label}</p>
				<p class="title">
					{next.allDone ? t.home.nextUp.todayDoneTitle : t.home.nextUp.emptyTitle}
				</p>
				<p class="muted hint">
					{next.allDone && overdueCount > 0
						? t.home.nextUp.overdueLeft(overdueCount)
						: t.home.nextUp.emptyHint}
				</p>
				<div class="cta">
					<Button variant="primary" onclick={onadd}>
						<Plus size={18} />
						{t.home.nextUp.addTask}
					</Button>
				</div>
			</div>
		{/if}
	</section>
{/if}

<style>
	.next {
		margin-bottom: var(--space-5);
	}
	@media (max-width: 720px) {
		.next {
			margin-bottom: var(--space-3);
		}
	}

	.card {
		position: relative;
		display: grid;
		gap: var(--space-2);
		padding: var(--space-4) var(--space-4) var(--space-4) calc(var(--space-4) + 3px);
		overflow: hidden;
		border-color: var(--border-strong);
		border-radius: var(--radius-xl);
	}
	/* Quest colour on the left edge, like the task cards. */
	.task::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 3px;
		background: var(--q);
	}
	.empty {
		border-style: dashed;
		border-color: var(--border-dashed);
		background: transparent;
	}
	.title {
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
		overflow-wrap: anywhere;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		font-size: var(--fs-sm);
	}
	.hint {
		font-size: var(--fs-sm);
	}
	.cta {
		margin-top: var(--space-2);
	}
	.cta :global(.btn) {
		width: 100%;
	}
	/* Wider screens: the text on the left, the one primary action on the right. */
	@media (min-width: 721px) {
		.card {
			grid-template-columns: minmax(0, 1fr) auto;
			column-gap: var(--space-6);
			align-items: center;
			padding: var(--space-5) var(--space-5) var(--space-5) calc(var(--space-5) + 3px);
		}
		.card > :not(.cta) {
			grid-column: 1;
		}
		.cta {
			grid-column: 2;
			grid-row: 1 / span 4;
			margin-top: 0;
		}
		.cta :global(.btn) {
			width: auto;
		}
	}
</style>
