<script lang="ts">
	import { formatDayLabel, weekDays } from '#lib/dates.ts';
	import { formAction } from '#lib/form-action.ts';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		ArrowDown,
		ArrowLeft,
		ArrowRight,
		ArrowUp,
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
	 * One task of a Plan day (AB3): a row of the day's inset grouped list — like Home's Today
	 * rows. A round check in the quest colour (slate for Other), the title, under it the planned
	 * or logged duration (board) / "● quest" with the duration at the end (phones), ▶ and a ⋯
	 * menu with everything the old board card offered: Log time, ↑/↓ (inside the task's own
	 * list and open/done group), previous/next day, any day of the week (touch has no drag &
	 * drop), Backlog, Delete. On the board it is an HTML5 drag source.
	 */
	type Props = {
		task: TaskWithQuest;
		/** Milliseconds logged to this task via completed sessions. */
		loggedMs?: number;
		/** ↑ disabled: first of its list and open/done group. */
		first?: boolean;
		/** ↓ disabled: last of its list and open/done group. */
		last?: boolean;
		/** The accent drop line above the row (drag & drop). */
		dropBefore?: boolean;
		/** This row is the one being dragged (rendered faded). */
		dragging?: boolean;
		/** Open task of a past day (`#lib/overdue.ts`): a small overdue marker by the title. */
		overdue?: boolean;
		ondragstart?: (e: DragEvent, task: TaskWithQuest) => void;
		ondragend?: (e: DragEvent) => void;
	};
	let {
		task,
		loggedMs = 0,
		first = false,
		last = false,
		dropBefore = false,
		dragging = false,
		overdue = false,
		ondragstart,
		ondragend
	}: Props = $props();

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
	class:drop-before={dropBefore}
	class:dragging
	data-task={task.id}
	style:--q={questColorVar(task.questColor)}
	draggable={ondragstart ? 'true' : undefined}
	ondragstart={ondragstart && ((e) => ondragstart(e, task))}
	{ondragend}
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

	<span class="head">
		<span class="title"><span class="strike">{task.title}</span></span>
		{#if overdue}
			<span class="overdue" title={t.overdue.marker}>
				<span class="sr-only">{t.overdue.marker}</span>
			</span>
		{/if}
	</span>

	<!-- Phones: "● quest" under the title (the board shows the quest by the check's colour). -->
	<span class="qline">
		<span class="dot" aria-hidden="true"></span>
		<span class="quest">{task.questName ?? t.common.other}</span>
	</span>

	{#if live}
		<span class="trail live-wrap">
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
					{#if live.status === 'paused'}<Play size={14} />{:else}<Pause size={14} />{/if}
				</button>
			{/if}
		</span>
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

	<span class="ops">
		{#if !done && !live}
			<a
				class="icon-op hit-target"
				href={`/focus?task=${task.id}`}
				aria-label={t.tasks.startFocus}
				onclick={play}
			>
				<Play size={14} />
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
					<form method="POST" action={formAction('prevDay')} use:enhance={() => close()}>
						<input type="hidden" name="taskId" value={task.id} />
						<button type="submit" class="item" role="menuitem">
							<ArrowLeft size={14} />
							{t.tasks.movePrevDay}
						</button>
					</form>
					<form method="POST" action={formAction('nextDay')} use:enhance={() => close()}>
						<input type="hidden" name="taskId" value={task.id} />
						<button type="submit" class="item" role="menuitem">
							<ArrowRight size={14} />
							{t.tasks.moveNextDay}
						</button>
					</form>
					{#if task.day}
						<!-- Touch has no drag & drop: jump straight to any day of this week. -->
						<form
							class="days"
							method="POST"
							action={formAction('moveTo')}
							use:enhance={() => close()}
						>
							<input type="hidden" name="taskId" value={task.id} />
							<input type="hidden" name="beforeId" value="" />
							<span class="days-label">{t.tasks.moveToDay}</span>
							<span class="day-grid">
								{#each weekDays(task.day) as d (d)}
									<button
										type="submit"
										name="day"
										value={d}
										class="day"
										role="menuitem"
										disabled={d === task.day}
										aria-label={t.tasks.moveToDate(
											formatDayLabel(d, { weekday: 'long', month: 'short', day: 'numeric' }, t.intl)
										)}
									>
										<span>{formatDayLabel(d, { weekday: 'narrow' }, t.intl)}</span>
										<span class="tabular">{Number(d.slice(8))}</span>
									</button>
								{/each}
							</span>
						</form>
					{/if}
					<form method="POST" action={formAction('toBacklog')} use:enhance={() => close()}>
						<input type="hidden" name="taskId" value={task.id} />
						<button type="submit" class="item" role="menuitem">
							<Inbox size={14} />
							{t.tasks.moveToBacklog}
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
	</span>

	{#if live && live.progress > 0}
		<span class="progress" style:--p={live.progress} aria-hidden="true"></span>
	{/if}
</li>

<style>
	/*
	 * Board (wider than 720px): check | title / duration | ▶ ⋯ (▶ ⋯ show on hover/focus where
	 * there is a hover, always on touch). Phones: check | title / ● quest | duration | ▶ ⋯.
	 */
	.task {
		position: relative;
		display: grid;
		grid-template-columns: var(--row-check) minmax(0, 1fr) auto;
		grid-template-areas:
			'check title ops'
			'check sub ops';
		align-items: center;
		align-content: center;
		column-gap: var(--space-3);
		row-gap: 1px;
		min-height: calc(var(--grouped-row-h) + var(--space-2));
		padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
		min-width: 0;
		transition: background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.task:hover {
			background: var(--surface-hover);
		}
	}
	.task[draggable='true'] {
		cursor: grab;
	}
	.running,
	.running:hover {
		background: var(--accent-soft);
	}
	.dragging {
		opacity: 0.4;
	}
	/* Drop indicator: a 2px accent line on the row's top edge. */
	.drop-before::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: -1px;
		height: 2px;
		background: var(--accent);
		pointer-events: none;
		z-index: 1;
	}
	.inline {
		display: contents;
	}
	.inline .check {
		grid-area: check;
	}

	.check {
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

	.head {
		grid-area: title;
		min-width: 0;
	}
	.title {
		min-width: 0;
		overflow-wrap: anywhere;
		color: var(--text);
		font-size: var(--fs-sm);
		line-height: 1.3;
	}
	.done .title {
		color: var(--text-faint);
	}
	.overdue {
		display: inline-block;
		width: 7px;
		height: 7px;
		margin-left: var(--space-1);
		border-radius: 50%;
		background: var(--overdue);
		vertical-align: 1px;
	}

	/* Board: the quest is the check's colour — its name only for screen readers. */
	.qline {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
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

	.trail {
		grid-area: sub;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		white-space: nowrap;
	}
	.done .trail {
		opacity: 0.6;
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
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--text);
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

	.ops {
		grid-area: ops;
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
	/*
	 * Pointer with hover (board): ▶ ⋯ step back until the row is hovered or focused (or its
	 * menu open) — laid over the row's end, so titles use the column's full width.
	 */
	@media (hover: hover) and (min-width: 721px) {
		.task {
			grid-template-columns: var(--row-check) minmax(0, 1fr);
			grid-template-areas:
				'check title'
				'check sub';
			padding-right: var(--space-3);
		}
		.ops {
			position: absolute;
			top: 50%;
			right: var(--space-1);
			translate: 0 -50%;
			padding-left: var(--space-2);
			border-radius: var(--radius-sm);
			background: var(--surface-hover);
			box-shadow: -10px 0 8px -2px var(--surface-hover);
			opacity: 0;
			transition: opacity var(--dur) var(--ease);
		}
		/* The running task keeps its ⋯ in the row (always shown, next to the live clock). */
		.task.running {
			grid-template-columns: var(--row-check) minmax(0, 1fr) auto;
			grid-template-areas:
				'check title ops'
				'check sub ops';
		}
		.running .ops {
			position: static;
			translate: none;
			background: none;
			box-shadow: none;
		}
		.task:hover .ops,
		.task:focus-within .ops,
		.running .ops,
		.ops:has(:global([aria-expanded='true'])) {
			opacity: 1;
		}
	}
	.icon-op {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
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

	/* Phones: the day view, full width — like Home's Today rows. */
	@media (max-width: 720px) {
		.task {
			grid-template-columns: var(--row-check) minmax(0, 1fr) auto auto;
			grid-template-areas:
				'check title trail ops'
				'check sub trail ops';
			padding: var(--space-2) var(--space-2) var(--space-2) var(--grouped-inset);
		}
		.title {
			font-size: var(--fs-md);
		}
		.qline {
			position: static;
			width: auto;
			height: auto;
			overflow: visible;
			clip-path: none;
			grid-area: sub;
			display: flex;
			align-items: center;
			gap: var(--space-1);
			min-width: 0;
			color: var(--text-muted);
			font-size: var(--fs-xs);
		}
		.done .qline {
			opacity: 0.6;
		}
		.trail {
			grid-area: trail;
			font-size: var(--fs-sm);
		}
		.live {
			font-size: var(--fs-md);
		}
		.icon-op {
			width: 28px;
			height: 28px;
		}
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
	.days {
		display: grid;
		gap: var(--space-1);
		padding: var(--space-2) var(--space-3);
		border-block: 1px solid var(--border);
		margin-block: var(--space-1);
	}
	.days-label {
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.day-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(28px, 1fr));
		gap: 2px;
	}
	.day {
		display: grid;
		justify-items: center;
		padding: var(--space-1) 0;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		color: var(--text-2);
		font-size: var(--fs-xs);
		line-height: 1.3;
	}
	.day:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text);
	}
	.day:disabled {
		border-color: var(--border-strong);
		color: var(--text-faint);
		cursor: default;
	}
</style>
