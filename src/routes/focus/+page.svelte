<script lang="ts">
	import { formatDurationMin } from '#lib/duration.ts';
	import { afterNavigate } from '$app/navigation';
	import {
		ArrowLeft,
		ChevronLeft,
		Clock,
		Play,
		Settings,
		Square,
		Timer,
		Trash2
	} from '@lucide/svelte';
	import GroupedList from '#lib/components/GroupedList.svelte';
	import GroupedRow from '#lib/components/GroupedRow.svelte';
	import Menu from '#lib/components/Menu.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import SegmentedControl from '#lib/components/SegmentedControl.svelte';
	import PomodoroSettingsDialog from '#lib/components/focus/PomodoroSettingsDialog.svelte';
	import {
		DURATION_PRESETS,
		initialDuration,
		plannedMinFor,
		type DurationChoice
	} from '#lib/focus-setup.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { timerLabelText, type SimpleAction } from '#lib/timer.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';
	import { ScreenWakeLock, shouldHoldWakeLock } from '#lib/wake-lock.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const timer = useTimer();
	const t = useI18n();
	const view = $derived(timer.view);
	const active = $derived(timer.timer);

	/* ── Back: to the page we came from (in-app), else Home ─────────────────── */
	let backHref = $state('/');
	afterNavigate(({ from }) => {
		if (from && from.url.pathname !== '/focus') backHref = from.url.pathname + from.url.search;
	});

	let settingsOpen = $state(false);

	/* ── Keep the screen on while the clock runs and this page is visible ─────── */
	let visibility = $state<DocumentVisibilityState>('visible');
	$effect(() => {
		const sync = () => (visibility = document.visibilityState);
		sync();
		document.addEventListener('visibilitychange', sync);
		return () => document.removeEventListener('visibilitychange', sync);
	});
	let wakeLock: ScreenWakeLock | null = null;
	$effect(() => {
		wakeLock = new ScreenWakeLock(
			navigator as Navigator & ConstructorParameters<typeof ScreenWakeLock>[0]
		);
		return () => {
			void wakeLock?.set(false);
			wakeLock = null;
		};
	});
	$effect(() => {
		const hold = shouldHoldWakeLock(view?.status ?? null, visibility);
		void wakeLock?.set(hold);
	});

	/* ── Setup (no active timer) ─────────────────────────────────────────────── */
	const uid = $props.id();
	const allTasks = $derived(data.groups.flatMap((g) => g.tasks));
	const taskById = $derived(new Map(allTasks.map((task) => [task.id, task])));
	/*
	 * Writable deriveds that follow `?task=` and the selected task, overridden by the user's
	 * pick. They hang on primitives only: a background refresh (SSE, another tab's action)
	 * brings new arrays/objects but must not undo a pick.
	 */
	const firstId = $derived(allTasks[0]?.id);
	let selectedId = $derived<string | undefined>(data.selectedId ?? firstId);
	const selected = $derived((selectedId && taskById.get(selectedId)) || null);
	let mode = $state<'focus' | 'pomodoro'>('focus');

	/**
	 * Duration: the task's plan preselected (a preset, else "Other…" with its minutes); both
	 * reset to the plan when another task is picked. "Open" = stopwatch.
	 */
	const pickedId = $derived(selected?.id);
	const pickedPlan = $derived(selected?.durationMin ?? null);
	let choice = $derived.by<DurationChoice>(() => {
		void pickedId;
		return initialDuration(pickedPlan).choice;
	});
	let custom = $derived.by<number | null>(() => {
		void pickedId;
		return initialDuration(pickedPlan).customMin;
	});
	const durationOptions = $derived([
		...DURATION_PRESETS.map((m) => ({ value: `${m}`, label: `${m}` })),
		{ value: 'open', label: t.focus.durationOpen },
		{ value: 'other', label: t.focus.durationOther }
	]);

	/** "Keep learning · 45 min planned" under a task's title. */
	function taskMeta(task: (typeof allTasks)[number]): string {
		const quest = task.questName ?? t.common.other;
		return task.durationMin
			? `${quest} · ${t.tasks.plannedDuration(formatDurationMin(task.durationMin, t.intl))}`
			: quest;
	}

	async function start(e: SubmitEvent) {
		e.preventDefault();
		if (!selected) return;
		// "Other…" sends its raw minutes: the server validates them (and answers with an error).
		const planned = plannedMinFor(choice, custom);
		await timer.start({
			task: { id: selected.id, title: selected.title },
			mode,
			plannedMin:
				mode !== 'focus'
					? undefined
					: typeof planned === 'number'
						? planned
						: planned === ''
							? null
							: Number(planned)
		});
	}

	/** `?task=` names another task while a timer runs → offer to switch. */
	const switchCandidate = $derived(
		active && data.selectedId && data.selectedId !== active.task.id
			? (allTasks.find((t) => t.id === data.selectedId) ?? null)
			: null
	);

	/** Progressive enhancement: forms post to `/api/timer`; with JS they go through the store. */
	function command(action: SimpleAction) {
		return (e: SubmitEvent) => {
			e.preventDefault();
			void timer.command(action);
		};
	}

	const errorText = $derived(timer.error ?? data.timerError);
	const questLabel = $derived(active ? (active.task.questName ?? t.common.other) : null);
	const pageTitle = $derived(
		view && active ? `${view.display} · ${active.task.title}` : `${t.focus.title} · libe`
	);
	const settings = $derived(timer.settings);

	/**
	 * One short line when a countdown reaches its planned minutes or a pomodoro break begins,
	 * with the profile name as a vocative (root layout data; without a name the same sentence
	 * without it).
	 */
	const cheer = $derived.by(() => {
		if (!view || !active) return null;
		const name = data.profile?.displayName ?? null;
		if (view.phase === 'short_break') return t.focus.cheer.shortBreak(name);
		if (view.phase === 'long_break') return t.focus.cheer.longBreak(name);
		const planned = active.session?.durationMin ?? null;
		if (view.mode === 'focus' && view.overtime && planned !== null)
			return t.focus.cheer.targetReached(name, planned);
		return null;
	});
</script>

<svelte:head><title>{pageTitle}</title></svelte:head>

{#snippet control(action: SimpleAction, label: string, primary = false)}
	<!-- Round like the stopwatch in Apple's Clock: the likely next tap filled, the rest grey. -->
	<form method="POST" action="/api/timer" onsubmit={command(action)}>
		<input type="hidden" name="action" value={action} />
		<input type="hidden" name="redirectTo" value="/focus" />
		<button type="submit" class="round" class:primary disabled={timer.busy}>
			<span>{label}</span>
		</button>
	</form>
{/snippet}

{#snippet taskRow(option: { value: string; label: string })}
	{@const task = taskById.get(option.value)}
	{#if task}
		<span class="t-row" style:--q={questColorVar(task.questColor)}>
			<span class="t-title">{task.title}</span>
			<span class="t-sub">
				<span class="qdot" aria-hidden="true"></span>
				<span class="t-meta">{taskMeta(task)}</span>
			</span>
		</span>
	{/if}
{/snippet}

<div class="screen">
	{#if active && view}
		<header class="top">
			<p class="crumb">
				<span class="dot" aria-hidden="true"></span>
				<span>
					{t.focus.title}{#if questLabel}&nbsp;·&nbsp;{questLabel}{/if}
				</span>
			</p>
			<div class="top-actions">
				<button
					type="button"
					class="icon-btn"
					aria-label={t.focus.pomodoroSettings}
					title={t.focus.pomodoroSettings}
					onclick={() => (settingsOpen = true)}
				>
					<Settings size={18} strokeWidth={1.75} />
				</button>
				<a class="icon-btn" href={backHref} aria-label={t.focus.back} title={t.focus.back}>
					<ArrowLeft size={18} strokeWidth={1.75} />
				</a>
			</div>
		</header>
		<main class="center">
			<section class="running" aria-label={t.focus.activeTimer}>
				{#if active.task.questName}
					<QuestPill color={active.task.questColor} label={active.task.questName} outlined />
				{:else}
					<QuestPill color="slate" label={t.common.other} outlined />
				{/if}
				<h1 class="task-title">{active.task.title}</h1>
				<p
					class="clock tabular"
					class:long={view.display.length > 6}
					class:overtime={view.overtime}
					class:dim={view.status !== 'running'}
					aria-live="off"
				>
					{view.display}
				</p>
				<p class="state" aria-live="polite">{timerLabelText(view.label, t)}</p>
				<p class="cheer" role="status">{cheer ?? ''}</p>
				{#if view.dots.length > 0}
					<ol class="dots" aria-label={t.focus.cycle}>
						{#each view.dots as dot, i (i)}
							<li class={dot}>
								<span class="sr-only">{t.focus.roundDot(i + 1, t.focus.dots[dot])}</span>
							</li>
						{/each}
					</ol>
				{/if}

				<div class="controls">
					<!-- Left: Complete (and Skip before a break) in grey; middle: ⋯; right: the one
					     filled button — Start / Pause / Resume (a running break has none). -->
					{@render control('complete', t.focus.complete)}
					{#if view.status === 'waiting' && view.phase !== 'focus'}
						{@render control('skip', t.focus.skip)}
					{/if}
					<span class="more">
						<Menu label={t.focus.moreActions}>
							{#snippet children(close)}
								<button
									type="button"
									class="item"
									role="menuitem"
									onclick={() => {
										close();
										timer.logTarget = { id: active.task.id, title: active.task.title };
									}}
								>
									<Clock size={14} />
									{t.common.logTimeMenu}
								</button>
								<button
									type="button"
									class="item"
									role="menuitem"
									onclick={() => {
										close();
										void timer.command('stop');
									}}
								>
									<Square size={14} />
									{t.focus.stopKeepOpen}
								</button>
								<button
									type="button"
									class="item danger"
									role="menuitem"
									onclick={() => {
										close();
										void timer.command('discard');
									}}
								>
									<Trash2 size={14} />
									{t.focus.discard}
								</button>
							{/snippet}
						</Menu>
					</span>
					{#if view.status === 'waiting'}
						{@render control(
							'startPhase',
							view.phase === 'focus' ? t.focus.startFocus : t.focus.startBreak,
							true
						)}
					{:else if view.isFocus}
						{@render control(
							view.status === 'paused' ? 'resume' : 'pause',
							view.status === 'paused' ? t.focus.resume : t.focus.pause,
							true
						)}
					{:else}
						{@render control('skip', t.focus.skipBreak)}
					{/if}
				</div>

				{#if switchCandidate}
					<p class="switch">
						<span>
							{t.focus.switchBefore}<strong>{switchCandidate.title}</strong>{t.focus.switchAfter}
						</span>
						<button
							type="button"
							class="link"
							onclick={() =>
								(timer.switchRequest = {
									task: { id: switchCandidate.id, title: switchCandidate.title },
									mode: 'focus',
									navigate: false
								})}
						>
							{t.focus.stopAndStart}
						</button>
					</p>
				{/if}
				{#if errorText}<p class="error" role="alert">{errorText}</p>{/if}
			</section>
		</main>
	{:else}
		<main class="setup">
			<form class="picker" method="POST" action="/api/timer" onsubmit={start}>
				<input type="hidden" name="action" value="start" />
				<input type="hidden" name="redirectTo" value="/focus" />

				<div class="toolbar">
					<a class="tool-link" href={backHref}>
						<ChevronLeft size={22} strokeWidth={2.25} aria-hidden="true" />{t.focus.back}
					</a>
					<button
						type="button"
						class="tool-icon hit-target"
						aria-label={t.focus.pomodoroSettings}
						title={t.focus.pomodoroSettings}
						onclick={() => (settingsOpen = true)}
					>
						<Timer size={20} strokeWidth={2} />
					</button>
				</div>

				<h1>{t.focus.pickTitle}</h1>

				<SegmentedControl
					name="mode"
					label={t.focus.timerMode}
					options={[
						{ value: 'focus', label: t.focus.modeFocus },
						{ value: 'pomodoro', label: t.focus.modePomodoro }
					]}
					bind:value={mode}
				/>

				{#if allTasks.length === 0}
					<p class="muted empty">
						{t.focus.noTasks} <a href="/">{t.focus.addOnHome}</a>.
					</p>
				{:else}
					{#each data.groups as group (group.key)}
						<GroupedList
							header={group.label}
							name="taskId"
							options={group.tasks.map((task) => ({ value: task.id, label: task.title }))}
							bind:value={selectedId}
							optionRow={taskRow}
						/>
					{/each}
				{/if}

				{#if mode === 'focus'}
					<section
						class="duration"
						aria-labelledby="{uid}-dur"
						aria-describedby="{uid}-dur-foot"
						data-testid="focus-duration"
					>
						<h2 class="group-head" id="{uid}-dur">{t.focus.duration}</h2>
						<SegmentedControl
							name="duration"
							labelledby="{uid}-dur"
							options={durationOptions}
							bind:value={choice}
						/>
						<!-- Only for "Other…" (CSS, so it also unfolds without JS). -->
						<div class="custom">
							<GroupedList label={t.focus.durationOther}>
								<GroupedRow label={t.focus.customMinutes} for="{uid}-custom">
									<input
										id="{uid}-custom"
										class="custom-min tabular"
										type="number"
										name="customMin"
										step="1"
										inputmode="numeric"
										required={choice === 'other'}
										bind:value={custom}
									/>
								</GroupedRow>
							</GroupedList>
						</div>
						<p class="group-foot" id="{uid}-dur-foot">{t.focus.durationHint}</p>
					</section>
				{:else}
					<GroupedList header={t.focus.modePomodoro}>
						<GroupedRow>
							<span class="pomo">
								<span class="tabular">
									{t.focus.pomodoroSummary(
										settings.focusMin,
										settings.shortBreakMin,
										settings.longBreakMin,
										settings.longBreakEvery
									)}
								</span>
								<button type="button" class="link" onclick={() => (settingsOpen = true)}>
									{t.focus.change}
								</button>
							</span>
						</GroupedRow>
					</GroupedList>
				{/if}

				{#if errorText}<p class="error" role="alert">{errorText}</p>{/if}

				<!-- Thumb zone: sticks to the bottom while the lists scroll under it. -->
				<div class="pick-actions">
					<button type="submit" class="cta" disabled={!selected || timer.busy}>
						<Play size={18} fill="currentColor" aria-hidden="true" />
						{t.focus.startFocus}
					</button>
					{#if selected}
						<button
							type="button"
							class="link log"
							onclick={() => (timer.logTarget = { id: selected.id, title: selected.title })}
						>
							{t.focus.logAfterwards}
						</button>
					{/if}
				</div>
			</form>
		</main>
	{/if}
</div>

{#if settingsOpen}
	<PomodoroSettingsDialog {settings} {form} onclose={() => (settingsOpen = false)} />
{/if}

<style>
	.screen {
		min-height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr;
		background: var(--bg);
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		/* Full-screen, also as an iOS home-screen app: clear notch / status bar. */
		padding: calc(var(--space-8) + var(--safe-top)) calc(var(--space-8) + var(--safe-right)) 0
			calc(var(--space-10) + var(--safe-left));
	}
	.crumb {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
	}
	.crumb > span:last-child {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.crumb .dot {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--accent);
	}
	.top-actions {
		display: flex;
		gap: var(--space-1);
	}
	.icon-btn {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--text-muted);
		transition:
			color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}
	.icon-btn:hover {
		color: var(--text);
		background: var(--surface-hover);
	}

	.center {
		display: grid;
		place-items: center;
		padding: var(--space-8) calc(var(--space-4) + var(--safe-right))
			calc(var(--space-16) + var(--safe-bottom)) calc(var(--space-4) + var(--safe-left));
		min-width: 0;
	}

	/* ── Running ───────────────────────────────────────────────────────────── */
	.running {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		min-width: 0;
		max-width: 100%;
	}
	.running :global(.pill) {
		height: 44px;
		padding: 0 var(--space-5);
		font-size: var(--fs-md);
		background: transparent;
	}
	.task-title {
		margin-top: var(--space-6);
		font-size: var(--fs-xl);
		font-weight: var(--fw-regular);
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
	}
	.clock {
		margin-top: var(--space-4);
		font-size: min(var(--fs-timer), 25vw);
		font-weight: var(--fw-figure);
		line-height: 1.05;
		letter-spacing: -0.03em;
		color: var(--text);
		white-space: nowrap;
	}
	.clock.long {
		font-size: min(var(--fs-timer), 17vw);
	}
	.clock.overtime {
		color: var(--accent-text);
	}
	.clock.dim {
		color: var(--text-muted);
	}
	.state {
		margin-top: var(--space-3);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		letter-spacing: var(--tracking-label);
	}
	.cheer {
		max-width: 48ch;
		color: var(--text-2);
		font-size: var(--fs-md);
		text-align: center;
	}
	.cheer:not(:empty) {
		margin-top: var(--space-2);
	}
	.dots {
		display: flex;
		gap: var(--space-2);
		list-style: none;
		margin: var(--space-4) 0 0;
		padding: 0;
	}
	.dots li {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1.5px solid var(--border-strong);
	}
	.dots li.done {
		border-color: var(--accent);
		background: var(--accent);
	}
	.dots li.current {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-soft);
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: var(--space-6);
		margin-top: var(--space-12);
	}
	/* Stopwatch buttons (Apple's Clock): round, label inside; grey unless primary. */
	.round {
		display: grid;
		place-items: center;
		width: var(--round-btn);
		height: var(--round-btn);
		padding: var(--space-1);
		border: none;
		border-radius: 50%;
		background: var(--round-btn-bg);
		color: var(--text);
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		line-height: 1.15;
		text-align: center;
		hyphens: auto;
		transition: background var(--dur) var(--ease);
	}
	.round:hover:not(:disabled) {
		background: var(--round-btn-bg-hover);
	}
	.round.primary {
		background: var(--accent);
		color: var(--accent-ink);
	}
	.round.primary:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.round:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.more :global(.trigger) {
		width: var(--hit-min);
		height: var(--hit-min);
		border-radius: 50%;
	}
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
	.item:hover {
		background: var(--surface-hover);
		color: var(--text);
	}
	.item.danger {
		color: var(--danger);
	}

	.switch {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-2);
		margin-top: var(--space-8);
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.switch strong {
		color: var(--text-2);
		font-weight: var(--fw-medium);
	}
	.link {
		padding: 0;
		border: none;
		background: transparent;
		color: var(--accent-text);
		font-size: var(--fs-sm);
	}
	.link:hover {
		text-decoration: underline;
	}
	.error {
		margin-top: var(--space-4);
		color: var(--danger);
		font-size: var(--fs-sm);
	}

	/* ── Setup (before a timer runs): one centred column, Apple building blocks ── */
	.setup {
		display: flex;
		justify-content: center;
		padding: calc(var(--space-4) + var(--safe-top)) calc(var(--space-4) + var(--safe-right)) 0
			calc(var(--space-4) + var(--safe-left));
		min-width: 0;
	}
	.picker {
		display: grid;
		align-content: start;
		gap: var(--space-5);
		width: min(var(--focus-setup-w), 100%);
		min-width: 0;
	}
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: var(--hit-min);
		margin-inline: calc(-1 * var(--space-2));
	}
	.tool-link {
		display: inline-flex;
		align-items: center;
		min-height: var(--hit-min);
		padding-right: var(--space-2);
		color: var(--accent-text);
		font-size: var(--fs-md);
	}
	.tool-icon {
		display: grid;
		place-items: center;
		width: var(--hit-min);
		height: var(--hit-min);
		padding: 0;
		border: none;
		border-radius: 50%;
		background: transparent;
		color: var(--accent-text);
		transition: background var(--dur) var(--ease);
	}
	@media (hover: hover) {
		.tool-icon:hover {
			background: var(--surface-hover);
		}
	}
	.t-row {
		display: grid;
		gap: 1px;
		min-width: 0;
	}
	.t-title {
		color: var(--text);
		font-size: var(--fs-md);
	}
	.t-sub {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		min-width: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
	}
	.qdot {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--q);
	}
	.t-meta {
		min-width: 0;
	}
	.empty {
		text-align: center;
	}
	.empty a {
		color: var(--accent-text);
	}
	/* Duration: header, the segmented control, "Other…" minutes, the footer (GroupedList's look). */
	.duration {
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
	/* Six segments on a phone: less padding so "Other…" fits. */
	.duration :global(.thumb) {
		padding-inline: var(--space-1);
	}
	.duration:not(:has(input[value='other']:checked)) .custom {
		display: none;
	}
	.custom {
		animation: fade-in var(--dur) var(--ease-out);
	}
	.custom-min {
		width: 88px;
		padding: var(--space-1) var(--space-2);
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--surface-2);
		color: var(--text);
		font-size: var(--fs-md);
		text-align: right;
	}
	.pomo {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-1) var(--space-3);
		width: 100%;
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	/* The one primary, full width; the log link under it. */
	.pick-actions {
		display: grid;
		gap: var(--space-1);
		margin-top: var(--space-1);
		padding: var(--space-3) 0 calc(var(--space-6) + var(--safe-bottom));
		background: var(--bg);
	}
	.cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		width: 100%;
		height: var(--cta-h);
		border: none;
		border-radius: var(--radius-cta);
		background: var(--accent);
		color: var(--accent-ink);
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		transition: background var(--dur) var(--ease);
	}
	.cta:hover:not(:disabled) {
		background: var(--accent-hover);
	}
	.cta:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.link.log {
		justify-self: center;
		min-height: var(--hit-min);
		font-size: var(--fs-md);
	}

	/* Thumb zone on phones: the actions stick to the bottom while the lists scroll under them. */
	@media (max-width: 720px) {
		.pick-actions {
			position: sticky;
			bottom: 0;
			z-index: 1;
		}
	}

	@media (max-width: 600px) {
		.top {
			padding: calc(var(--space-5) + var(--safe-top)) calc(var(--space-4) + var(--safe-right)) 0
				calc(var(--space-4) + var(--safe-left));
		}
		.controls {
			gap: var(--space-4);
			margin-top: var(--space-8);
		}
		.round {
			width: var(--round-btn-phone);
			height: var(--round-btn-phone);
			font-size: var(--fs-sm);
		}
	}
</style>
