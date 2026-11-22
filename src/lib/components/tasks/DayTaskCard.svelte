<script lang="ts">
	import { formAction } from '#lib/form-action.ts';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import {
		ArrowDown,
		ArrowLeft,
		ArrowRight,
		ArrowUp,
		CalendarPlus,
		Check,
		Clock,
		Pause,
		Play,
		Trash2
	} from '@lucide/svelte';
	import Menu from '#lib/components/Menu.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import { formatDayLabel, formatDuration, weekDays } from '#lib/dates.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import type { TaskWithQuest } from '#lib/server/tasks.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { timerLabelText } from '#lib/timer.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	let {
		task,
		/** Milliseconds logged to this task via completed sessions. */
		loggedMs = 0,
		first = false,
		last = false,
		variant = 'home',
		dropBefore = false,
		dragging = false,
		ondragstart,
		ondragend,
		ontimeblock
	}: {
		task: TaskWithQuest;
		loggedMs?: number;
		/** Disable "move up" for the first row of its list. */
		first?: boolean;
		/** Disable "move down" for the last row of its list. */
		last?: boolean;
		/** `plan` = compact board card with prev/next-day menu entries. */
		variant?: 'home' | 'plan';
		/** Render the amber drop-indicator line above the card. */
		dropBefore?: boolean;
		/** This card is the one being dragged (rendered faded). */
		dragging?: boolean;
		/** When set, the card is an HTML5 drag source (plan board). */
		ondragstart?: (e: DragEvent, task: TaskWithQuest) => void;
		ondragend?: (e: DragEvent) => void;
		/** Opens the "Time-block…" dialog for this task (home only). */
		ontimeblock?: (task: TaskWithQuest) => void;
	} = $props();

	const done = $derived(task.doneAt !== null);
	const color = $derived(questColorVar(task.questColor));

	const timer = useTimer();
	const t = useI18n();
	/** Live timer view when this task owns the active timer. */
	const live = $derived(timer.view?.taskId === task.id ? timer.view : null);

	/** The check pops on the tap itself… */
	let popping = $state(false);
	/** …the tick draws and the title is struck once the server says the task is done. */
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
	class="task card"
	class:done
	class:struck={done}
	class:celebrate
	class:running={live !== null}
	class:plan={variant === 'plan'}
	class:drop-before={dropBefore}
	class:dragging
	data-task={task.id}
	style:--q={color}
	draggable={ondragstart ? 'true' : undefined}
	ondragstart={ondragstart && ((e) => ondragstart(e, task))}
	{ondragend}
>
	<div class="top">
		<span class="title"><span class="strike">{task.title}</span></span>
	</div>

	<div class="meta">
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

		{#if task.questId && task.questName}
			<QuestPill color={task.questColor} label={task.questName} />
		{/if}

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
					class="pause"
					aria-label={live.status === 'paused' ? t.tasks.resumeTimer : t.tasks.pauseTimer}
					disabled={timer.busy}
					onclick={() => timer.command(live.status === 'paused' ? 'resume' : 'pause')}
				>
					{#if live.status === 'paused'}<Play size={14} />{:else}<Pause size={14} />{/if}
				</button>
			{/if}
		{:else if loggedMs > 0}
			<span class="logged tabular">
				<span class="dot" aria-hidden="true"></span>{formatDuration(loggedMs)}
			</span>
		{:else if task.durationMin !== null}
			<span class="planned muted tabular">{formatDuration(task.durationMin * 60_000)}</span>
		{/if}

		<!-- Home: inline with the meta row; plan: its own row under the pill. -->
		<span class="tail">
			{#if !done && !live}
				<a
					class="play hit-target"
					href={`/focus?task=${task.id}`}
					aria-label={t.tasks.startFocus}
					onclick={play}
				>
					<Play size={14} />
				</a>
			{/if}

			<span class="ops">
				<form class="inline" method="POST" action={formAction('moveUp')} use:enhance>
					<input type="hidden" name="taskId" value={task.id} />
					<button type="submit" class="op" aria-label={t.common.moveUp} disabled={first}>
						<ArrowUp size={15} />
					</button>
				</form>
				<form class="inline" method="POST" action={formAction('moveDown')} use:enhance>
					<input type="hidden" name="taskId" value={task.id} />
					<button type="submit" class="op" aria-label={t.common.moveDown} disabled={last}>
						<ArrowDown size={15} />
					</button>
				</form>
			</span>

			<span class="menu-slot">
				<Menu label={t.common.actionsFor(task.title)}>
					{#snippet children(close)}
						{#if variant === 'home' && ontimeblock}
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
						{:else if variant === 'plan'}
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
													formatDayLabel(
														d,
														{ weekday: 'long', month: 'short', day: 'numeric' },
														t.intl
													)
												)}
											>
												<span>{formatDayLabel(d, { weekday: 'narrow' }, t.intl)}</span>
												<span class="tabular">{Number(d.slice(8))}</span>
											</button>
										{/each}
									</span>
								</form>
							{/if}
						{/if}
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
						<form method="POST" action={formAction('toBacklog')} use:enhance={() => close()}>
							<input type="hidden" name="taskId" value={task.id} />
							<button type="submit" class="item" role="menuitem">{t.tasks.moveToBacklog}</button>
						</form>
						{#if variant === 'home'}
							<form method="POST" action={formAction('toTomorrow')} use:enhance={() => close()}>
								<input type="hidden" name="taskId" value={task.id} />
								<button type="submit" class="item" role="menuitem">{t.tasks.moveToTomorrow}</button>
							</form>
						{/if}
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
	</div>

	{#if live && live.progress > 0}
		<span class="progress" style:--p={live.progress} aria-hidden="true"></span>
	{/if}
</li>

<style>
	.task {
		position: relative;
		display: grid;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4) var(--space-3) calc(var(--space-4) + 3px);
		min-width: 0;
		transition:
			border-color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.task:hover {
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}
	/* Quest colour bar on the left edge. */
	.task::before {
		content: '';
		position: absolute;
		left: -1px;
		top: -1px;
		bottom: -1px;
		width: 3px;
		border-radius: var(--radius-lg) 0 0 var(--radius-lg);
		background: var(--q);
	}
	/* Drop indicator: a 2px amber line centred in the gap above the card. */
	.drop-before::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: calc(-1 * var(--space-1) - 2px);
		height: 2px;
		border-radius: 1px;
		background: var(--accent);
		pointer-events: none;
	}
	.dragging {
		opacity: 0.4;
	}
	/* The task with the active timer: amber outline + progress line along the bottom. */
	.running,
	.running:hover {
		border-color: var(--running-border);
		box-shadow: 0 0 0 1px var(--running-border);
	}
	.progress {
		position: absolute;
		left: var(--space-1);
		bottom: -1px;
		height: 2px;
		width: calc((100% - 2 * var(--space-1)) * var(--p));
		border-radius: 1px;
		background: linear-gradient(90deg, var(--accent) 70%, transparent);
		pointer-events: none;
		transition: width var(--dur-tick) linear;
	}
	.live {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--fs-md);
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
	.pause {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		margin-left: calc(-1 * var(--space-2));
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
	}
	.pause:hover {
		color: var(--text);
		background: var(--surface-hover);
	}
	.plan .live {
		font-size: var(--fs-sm);
	}
	.plan .pause {
		width: 24px;
		height: 24px;
	}
	.task[draggable='true'] {
		cursor: grab;
	}
	/* Compact board card (plan). */
	.plan {
		padding: var(--space-2) var(--space-3) var(--space-2) calc(var(--space-3) + 3px);
		gap: var(--space-1);
		border-radius: var(--radius-md);
	}
	.plan .title {
		font-size: var(--fs-md);
	}
	.plan .meta {
		gap: var(--space-1) var(--space-2);
	}
	.tail {
		display: contents;
	}
	.plan .tail {
		display: flex;
		align-items: center;
		flex-basis: 100%;
		gap: var(--space-1);
		margin-left: calc(-1 * var(--space-1));
	}
	.plan .meta :global(.pill) {
		min-width: 0;
		height: 24px;
		padding: 0 var(--space-2);
		font-size: var(--fs-xs);
	}
	.plan .planned,
	.plan .logged {
		font-size: var(--fs-xs);
	}
	.plan .play {
		width: 24px;
		height: 24px;
	}
	.plan .check {
		width: 18px;
		height: 18px;
	}
	.plan .op {
		width: 24px;
		height: 24px;
	}
	/*
	 * Phones: a plan card is full width (day view) — ▶ ↑ ↓ ⋯ join the meta row instead of
	 * a row of their own (one row less per card, nothing removed).
	 */
	@media (max-width: 720px) {
		.plan .tail {
			display: contents;
		}
		/* One line: a long quest name gives way (ellipsis) before the controls wrap. */
		.plan .meta {
			flex-wrap: nowrap;
		}
		.plan .meta > :global(.pill) {
			flex: 0 1 auto;
		}
	}
	.done {
		opacity: 0.55;
	}
	.done .title {
		color: var(--text-faint);
	}
	/* Just completed (server-confirmed): the row settles into its done look. */
	.celebrate {
		animation: settle var(--dur-slow) var(--ease-out);
	}
	.celebrate .strike {
		animation: strike-in var(--dur-slow) var(--ease-out);
	}
	.celebrate .check :global(svg *) {
		stroke-dasharray: 24;
		animation: check-draw var(--dur-slow) var(--ease-out) both;
	}
	.check.popping {
		animation: check-pop var(--dur-pop) var(--ease-spring);
	}

	.top {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
	}
	.title {
		flex: 1;
		min-width: 0;
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
		overflow-wrap: anywhere;
	}
	.menu-slot {
		position: relative;
		z-index: 2;
		flex: none;
	}

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		min-width: 0;
	}
	.inline {
		display: contents;
	}

	.check {
		flex: none;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border: 1.5px solid var(--border-strong);
		border-radius: 50%;
		background: transparent;
		color: transparent;
		transition:
			border-color var(--dur) var(--ease),
			background var(--dur) var(--ease),
			color var(--dur) var(--ease);
	}
	.check:hover {
		border-color: var(--text-muted);
	}
	.done .check {
		border-color: var(--q);
		background: var(--q);
		color: var(--bg);
	}

	.logged {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--fs-sm);
		color: var(--text-2);
	}
	.logged .dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--q);
	}
	.planned {
		font-size: var(--fs-sm);
	}

	.play {
		flex: none;
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		color: var(--text-faint);
		transition:
			color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.play:hover {
		color: var(--text);
		background: var(--surface-hover);
	}

	.ops {
		flex: none;
		display: flex;
		gap: var(--space-1);
		margin-left: auto;
	}
	.op {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-faint);
		transition:
			color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.op:hover:not(:disabled) {
		color: var(--text);
		background: var(--surface-hover);
	}
	.op:disabled {
		opacity: 0.35;
		cursor: not-allowed;
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
	.item.danger {
		color: var(--danger);
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
