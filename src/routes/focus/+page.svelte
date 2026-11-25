<script lang="ts">
	import { formatDurationMin } from '#lib/duration.ts';
	import { afterNavigate } from '$app/navigation';
	import {
		ArrowLeft,
		Check,
		Clock,
		Pause,
		Play,
		Settings,
		SkipForward,
		Square,
		Trash2
	} from '@lucide/svelte';
	import Menu from '#lib/components/Menu.svelte';
	import QuestPill from '#lib/components/QuestPill.svelte';
	import PomodoroSettingsDialog from '#lib/components/focus/PomodoroSettingsDialog.svelte';
	import { questColorVar } from '#lib/quest-colors.ts';
	import {
		DEFAULT_FOCUS_MIN,
		MAX_TIMER_MIN,
		timerLabelText,
		type SimpleAction
	} from '#lib/timer.ts';
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

	/* ── Picker (no active timer) ────────────────────────────────────────────── */
	const allTasks = $derived(data.groups.flatMap((g) => g.tasks));
	/** Writable derived: follows `?task=` / fresh data, overridden by the user's pick. */
	let selectedId = $derived(data.selectedId ?? allTasks[0]?.id ?? null);
	const selected = $derived(allTasks.find((t) => t.id === selectedId) ?? null);
	let mode = $state<'focus' | 'pomodoro'>('focus');
	/** Planned minutes; empty (null) = open-ended stopwatch. Resets to the task's plan on selection. */
	let planned = $derived<number | null>(selected?.durationMin ?? DEFAULT_FOCUS_MIN);

	async function start(e: SubmitEvent) {
		e.preventDefault();
		if (!selected) return;
		await timer.start({
			task: { id: selected.id, title: selected.title },
			mode,
			plannedMin: mode === 'focus' ? (typeof planned === 'number' ? planned : null) : undefined
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
	<form method="POST" action="/api/timer" onsubmit={command(action)}>
		<input type="hidden" name="action" value={action} />
		<input type="hidden" name="redirectTo" value="/focus" />
		<button type="submit" class="ctl" class:primary disabled={timer.busy}>
			{#if action === 'pause'}<Pause size={18} />
			{:else if action === 'complete'}<Check size={18} />
			{:else if action === 'skip'}<SkipForward size={18} />
			{:else}<Play size={18} />{/if}
			{label}
		</button>
	</form>
{/snippet}

<div class="screen">
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
		{#if active && view}
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
					{#if view.status === 'waiting'}
						{#if view.phase === 'focus'}
							{@render control('startPhase', t.focus.startFocus, true)}
						{:else}
							{@render control('startPhase', t.focus.startBreak, true)}
							{@render control('skip', t.focus.skip)}
						{/if}
					{:else if view.isFocus}
						<!-- Paused: Resume is the obvious next tap → primary; running: the clock leads. -->
						{@render control(
							view.status === 'paused' ? 'resume' : 'pause',
							view.status === 'paused' ? t.focus.resume : t.focus.pause,
							view.status === 'paused'
						)}
					{:else}
						{@render control('skip', t.focus.skipBreak)}
					{/if}
					{@render control('complete', t.focus.complete)}
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
		{:else}
			<form class="picker" method="POST" action="/api/timer" onsubmit={start}>
				<input type="hidden" name="action" value="start" />
				<input type="hidden" name="redirectTo" value="/focus" />
				<h1 class="pick-title">{t.focus.pickTitle}</h1>

				<div class="modes" role="radiogroup" aria-label={t.focus.timerMode}>
					<label class:on={mode === 'focus'}>
						<input type="radio" name="mode" value="focus" bind:group={mode} />
						{t.focus.modeFocus}
					</label>
					<label class:on={mode === 'pomodoro'}>
						<input type="radio" name="mode" value="pomodoro" bind:group={mode} />
						{t.focus.modePomodoro}
					</label>
				</div>

				{#if allTasks.length === 0}
					<p class="muted empty">
						{t.focus.noTasks} <a href="/">{t.focus.addOnHome}</a>.
					</p>
				{:else}
					<fieldset class="tasks">
						<legend class="sr-only">{t.common.task}</legend>
						{#each data.groups as group (group.key)}
							<p class="label group">{group.label}</p>
							{#each group.tasks as task (task.id)}
								<label
									class="task"
									class:on={task.id === selectedId}
									style:--q={questColorVar(task.questColor)}
								>
									<input type="radio" name="taskId" value={task.id} bind:group={selectedId} />
									<span class="t-title">{task.title}</span>
									{#if task.questName}
										<span class="t-quest muted">
											<span class="qdot" aria-hidden="true"></span>{task.questName}
										</span>
									{/if}
									{#if task.durationMin}<span class="t-dur muted tabular">
											{formatDurationMin(task.durationMin, t.intl)}
										</span>{/if}
								</label>
							{/each}
						{/each}
					</fieldset>
				{/if}

				{#if mode === 'focus'}
					<label class="planned">
						<span class="label">{t.focus.plannedMinutes}</span>
						<input
							type="number"
							name="plannedMin"
							min="1"
							max={MAX_TIMER_MIN}
							step="1"
							placeholder={t.focus.openEnded}
							bind:value={planned}
						/>
						<span class="muted hint">{t.focus.plannedHint}</span>
					</label>
				{:else}
					<p class="pomo muted">
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
					</p>
				{/if}

				{#if errorText}<p class="error" role="alert">{errorText}</p>{/if}

				<div class="pick-actions">
					<button type="submit" class="ctl primary" disabled={!selected || timer.busy}>
						<Play size={18} />
						{t.focus.start}
					</button>
					{#if selected}
						<button
							type="button"
							class="link"
							onclick={() => (timer.logTarget = { id: selected.id, title: selected.title })}
						>
							{t.focus.logAfterwards}
						</button>
					{/if}
				</div>
			</form>
		{/if}
	</main>
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
		font-weight: var(--fw-medium);
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
		gap: var(--space-4);
		margin-top: var(--space-12);
	}
	.ctl {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		height: 56px;
		padding: 0 var(--space-6);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
		white-space: nowrap;
		transition:
			background var(--dur) var(--ease),
			border-color var(--dur) var(--ease);
	}
	.ctl:hover:not(:disabled) {
		background: var(--surface-hover);
		border-color: var(--text-faint);
	}
	.ctl.primary {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}
	.ctl.primary:hover:not(:disabled) {
		background: var(--accent-hover);
		border-color: var(--accent-hover);
	}
	.ctl:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.more :global(.trigger) {
		width: 44px;
		height: 44px;
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

	/* ── Picker ────────────────────────────────────────────────────────────── */
	.picker {
		display: grid;
		gap: var(--space-5);
		width: min(560px, 100%);
		min-width: 0;
	}
	.pick-title {
		font-size: var(--fs-xl);
		font-weight: var(--fw-regular);
		text-align: center;
	}
	.modes {
		justify-self: center;
		display: inline-flex;
		padding: 3px;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}
	.modes label {
		position: relative;
		padding: var(--space-2) var(--space-5);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-md);
		cursor: pointer;
	}
	.modes label.on {
		background: var(--surface-2);
		color: var(--text);
		font-weight: var(--fw-medium);
	}
	.modes label:has(:focus-visible) {
		box-shadow: var(--ring);
	}
	.modes input,
	.task input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.tasks {
		display: grid;
		gap: var(--space-1);
		max-height: min(46dvh, 460px);
		overflow-y: auto;
		margin: 0;
		padding: var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		min-width: 0;
	}
	.group {
		padding: var(--space-3) var(--space-3) var(--space-1);
	}
	.task {
		position: relative;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1) var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		cursor: pointer;
		min-width: 0;
	}
	.task:hover {
		background: var(--surface-hover);
	}
	.task.on {
		border-color: var(--running-border);
		background: var(--selected-bg);
	}
	.task:has(:focus-visible) {
		box-shadow: var(--ring);
	}
	.t-title {
		flex: 1 1 200px;
		min-width: 0;
		font-size: var(--fs-md);
		overflow-wrap: anywhere;
	}
	.t-quest {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font-size: var(--fs-xs);
	}
	.qdot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--q);
	}
	.t-dur {
		font-size: var(--fs-xs);
	}
	.empty {
		text-align: center;
	}
	.empty a {
		color: var(--accent-text);
	}
	.planned {
		display: grid;
		grid-template-columns: auto 120px;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
	.planned input {
		min-width: 0;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		font-size: var(--fs-md);
		padding: var(--space-2) var(--space-3);
	}
	.planned .hint {
		grid-column: 1 / -1;
		font-size: var(--fs-xs);
	}
	.pomo {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-3);
		font-size: var(--fs-sm);
	}
	.pick-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4);
	}

	@media (max-width: 600px) {
		.top {
			padding: calc(var(--space-5) + var(--safe-top)) calc(var(--space-4) + var(--safe-right)) 0
				calc(var(--space-4) + var(--safe-left));
		}
		.controls {
			gap: var(--space-2);
			margin-top: var(--space-8);
		}
		.ctl {
			height: 48px;
			padding: 0 var(--space-4);
			font-size: var(--fs-md);
		}
	}
</style>
