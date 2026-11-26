<script lang="ts">
	import { formAction } from '#lib/form-action.ts';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		ArrowDown,
		ArrowUp,
		CalendarClock,
		CalendarPlus,
		Check,
		Clock,
		Inbox,
		Pause,
		Play,
		Trash2
	} from '@lucide/svelte';
	import Menu from '#lib/components/Menu.svelte';
	import { formatDurationMin, formatDurationMs } from '#lib/duration.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { timerLabelText } from '#lib/timer.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/**
	 * One row of Home's "Today" list (quest work and Other alike): a round check in the quest
	 * colour (slate for Other), the title over a small "● quest" line, the planned or logged
	 * duration (or the live timer), ▶ and a ⋯ menu with everything else — Time-block, Log time,
	 * ↑/↓ (inside the task's own list and open/done group), Backlog, Tomorrow, Delete. Every
	 * action is a shared form action (`task-actions.ts`) or the timer store.
	 */
	type Props = {
		task: TaskWithQuest;
		/** Milliseconds logged to this task via completed sessions. */
		loggedMs?: number;
		/** ↑ disabled: first of its list and open/done group (`mergeDayLists`). */
		first?: boolean;
		/** ↓ disabled: last of its list and open/done group. */
		last?: boolean;
		/** Opens the "Time-block…" dialog for this task. */
		ontimeblock: (task: TaskWithQuest) => void;
	};
	let { task, loggedMs = 0, first = false, last = false, ontimeblock }: Props = $props();

	const t = useI18n();
	const timer = useTimer();
	const done = $derived(task.doneAt !== null);
	/** Live timer view when this task owns the active timer. */
	const live = $derived(timer.view?.taskId === task.id ? timer.view : null);

	/** The check pops on the tap; the tick draws and the title is struck once the server agrees. */
	let popping = $state(false);
	let celebrate = $state(false);
	const onToggle: SubmitFunction = () => {
		const wasDone = done;
		popping = true;
		celebrate = false;
		return async ({ update }) => {
			await update();
			celebrate = !wasDone && done;
		};
	};

	/** ▶: start a focus timer for this task (or ask to stop the current one), then open Focus. */
	async function play(e: MouseEvent) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // new tab → picker
		e.preventDefault();
		const ok = await timer.start(
			{ task: { id: task.id, title: task.title }, mode: 'focus' },
			{ navigate: true }
		);
		if (ok) await goto('/focus');
	}
</script>

<li
	class="task"
	class:done
	class:struck={done}
	class:celebrate
	class:running={live !== null}
	data-task={task.id}
	style:--q={questColorVar(task.questColor)}
>
	<form class="inline" method="POST" action={formAction('toggle')} use:enhance={onToggle}>
		<input type="hidden" name="taskId" value={task.id} />
		<button
			type="submit"
			class="check"
			class:popping
			onanimationend={() => (popping = false)}
			aria-label={done ? t.common.markNotDone : t.common.markDone}
		>
			{#if done}<Check size={13} strokeWidth={3} />{/if}
		</button>
	</form>

	<span class="main">
		<span class="title"><span class="strike">{task.title}</span></span>
		<span class="sub">
			<span class="dot" aria-hidden="true"></span>
			<span class="quest">{task.questName ?? t.common.other}</span>
		</span>
	</span>

	{#if live}
		<a
			class="live tabular"
			class:paused={live.status !== 'running'}
			href="/focus"
			aria-label={t.tasks.timerLive(
				live.display,
				timerLabelText(live.label, t).toLocaleLowerCase(t.intl)
			)}
		>
			<span class="rec" aria-hidden="true"></span>{live.display}
		</a>
		{#if live.isFocus && live.status !== 'waiting'}
			<button
				type="button"
				class="icon-op"
				aria-label={live.status === 'paused' ? t.tasks.resumeTimer : t.tasks.pauseTimer}
				disabled={timer.busy}
				onclick={() => timer.command(live.status === 'paused' ? 'resume' : 'pause')}
			>
				{#if live.status === 'paused'}<Play size={15} />{:else}<Pause size={15} />{/if}
			</button>
		{/if}
	{:else if loggedMs > 0}
		<!-- Logged wins over planned; the word is for screen readers, the dot marks "logged". -->
		<span class="trail logged tabular">
			<span class="ldot" aria-hidden="true"></span>{formatDurationMs(loggedMs, t.intl)}
			<span class="sr-only">{t.tasks.logged}</span>
		</span>
	{:else if task.durationMin !== null}
		<span class="trail planned tabular">
			{formatDurationMin(task.durationMin, t.intl)}
			<span class="sr-only">{t.tasks.planned}</span>
		</span>
	{/if}

	{#if !done && !live}
		<a
			class="icon-op hit-target"
			href={`/focus?task=${task.id}`}
			aria-label={t.tasks.startFocus}
			onclick={play}
		>
			<Play size={15} />
		</a>
	{/if}

	<span class="menu-slot">
		<Menu label={t.common.actionsFor(task.title)}>
			{#snippet children(close)}
				<button
					type="button"
					class="item"
					role="menuitem"
					onclick={() => {
						close();
						ontimeblock(task);
					}}
				>
					<CalendarPlus size={14} />
					{t.tasks.timeBlock}
				</button>
				<button
					type="button"
					class="item"
					role="menuitem"
					onclick={() => {
						close();
						timer.logTarget = { id: task.id, title: task.title };
					}}
				>
					<Clock size={14} />
					{t.common.logTimeMenu}
				</button>
				<span class="sep" aria-hidden="true"></span>
				<form method="POST" action={formAction('moveUp')} use:enhance={() => close()}>
					<input type="hidden" name="taskId" value={task.id} />
					<button type="submit" class="item" role="menuitem" disabled={first}>
						<ArrowUp size={14} />
						{t.common.moveUp}
					</button>
				</form>
				<form method="POST" action={formAction('moveDown')} use:enhance={() => close()}>
					<input type="hidden" name="taskId" value={task.id} />
					<button type="submit" class="item" role="menuitem" disabled={last}>
						<ArrowDown size={14} />
						{t.common.moveDown}
					</button>
				</form>
				<span class="sep" aria-hidden="true"></span>
				<form method="POST" action={formAction('toBacklog')} use:enhance={() => close()}>
					<input type="hidden" name="taskId" value={task.id} />
					<button type="submit" class="item" role="menuitem">
						<Inbox size={14} />
						{t.tasks.moveToBacklog}
					</button>
				</form>
				<form method="POST" action={formAction('toTomorrow')} use:enhance={() => close()}>
					<input type="hidden" name="taskId" value={task.id} />
					<button type="submit" class="item" role="menuitem">
						<CalendarClock size={14} />
						{t.tasks.moveToTomorrow}
					</button>
				</form>
				<form method="POST" action={formAction('deleteTask')} use:enhance={() => close()}>
					<input type="hidden" name="taskId" value={task.id} />
					<button type="submit" class="item danger" role="menuitem">
						<Trash2 size={14} />
						{t.common.delete}
					</button>
				</form>
			{/snippet}
		</Menu>
	</span>

	{#if live && live.progress > 0}
		<span class="progress" style:--p={live.progress} aria-hidden="true"></span>
	{/if}
</li>

<style>
	.task {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: calc(var(--grouped-row-h) + var(--space-2));
		padding: var(--space-2) var(--space-2) var(--space-2) var(--grouped-inset);
		min-width: 0;
		transition: background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.task:hover {
			background: var(--surface-hover);
		}
	}
	.running {
		background: var(--accent-soft);
	}
	@media (hover: hover) {
		.running:hover {
			background: var(--accent-soft);
		}
	}
	.inline {
		display: contents;
	}

	.check {
		flex: none;
		display: grid;
		place-items: center;
		width: var(--row-check);
		height: var(--row-check);
		padding: 0;
		border: 1.5px solid var(--q);
		border-radius: 50%;
		background: transparent;
		color: transparent;
		transition:
			background var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.check:hover {
			background: color-mix(in srgb, var(--q) 18%, transparent);
		}
	}
	.done .check {
		background: var(--q);
		color: var(--bg);
	}
	.check.popping {
		animation: check-pop var(--dur-pop) var(--ease-spring);
	}
	.celebrate .check :global(svg *) {
		stroke-dasharray: 24;
		animation: check-draw var(--dur-slow) var(--ease-out) both;
	}
	.celebrate .strike {
		animation: strike-in var(--dur-slow) var(--ease-out);
	}

	.main {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 1px;
	}
	.title {
		min-width: 0;
		overflow-wrap: anywhere;
		color: var(--text);
		font-size: var(--fs-md);
	}
	.done .title {
		color: var(--text-faint);
	}
	.sub {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.dot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--q);
	}
	.quest {
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.done .sub {
		opacity: 0.6;
	}

	.trail {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		white-space: nowrap;
	}
	.logged {
		color: var(--text-2);
	}
	.ldot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--q);
	}

	.live {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text);
		font-size: var(--fs-md);
	}
	.live .rec {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--danger);
		animation: rec var(--dur-pulse) ease-in-out infinite;
	}
	.live.paused {
		color: var(--text-muted);
	}
	.live.paused .rec {
		background: var(--text-faint);
		animation: none;
	}
	@keyframes rec {
		50% {
			opacity: 0.35;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.live .rec {
			animation: none;
		}
	}

	.icon-op {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-faint);
		transition:
			color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.icon-op:hover {
			color: var(--text);
			background: var(--surface-2);
		}
	}
	.menu-slot {
		flex: none;
		display: inline-flex;
	}

	.progress {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 2px;
		width: calc(100% * var(--p));
		background: linear-gradient(90deg, var(--accent) 70%, transparent);
		pointer-events: none;
		transition: width var(--dur-tick) linear;
	}

	/* menu items */
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
