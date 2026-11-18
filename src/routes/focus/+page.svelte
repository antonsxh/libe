<script lang="ts">
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
	import { DEFAULT_FOCUS_MIN, MAX_TIMER_MIN, type SimpleAction } from '#lib/timer.ts';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const timer = useTimer();
	const view = $derived(timer.view);
	const active = $derived(timer.timer);

	/* ── Back: to the page we came from (in-app), else Home ─────────────────── */
	let backHref = $state('/');
	afterNavigate(({ from }) => {
		if (from && from.url.pathname !== '/focus') backHref = from.url.pathname + from.url.search;
	});

	let settingsOpen = $state(false);

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
	const questLabel = $derived(active ? (active.task.questName ?? 'Other') : null);
	const pageTitle = $derived(
		view && active ? `${view.display} · ${active.task.title}` : 'Focus · libe'
	);
	const settings = $derived(timer.settings);
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
				Focus{#if questLabel}&nbsp;·&nbsp;{questLabel}{/if}
			</span>
		</p>
		<div class="top-actions">
			<button
				type="button"
				class="icon-btn"
				aria-label="Pomodoro settings"
				title="Pomodoro settings"
				onclick={() => (settingsOpen = true)}
			>
				<Settings size={18} strokeWidth={1.75} />
			</button>
			<a class="icon-btn" href={backHref} aria-label="Back" title="Back">
				<ArrowLeft size={18} strokeWidth={1.75} />
			</a>
		</div>
	</header>

	<main class="center">
		{#if active && view}
			<section class="running" aria-label="Active timer">
				{#if active.task.questName}
					<QuestPill color={active.task.questColor} label={active.task.questName} outlined />
				{:else}
					<QuestPill color="slate" label="Other" outlined />
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
				<p class="state" aria-live="polite">{view.label}</p>
				{#if view.dots.length > 0}
					<ol class="dots" aria-label="Pomodoro cycle">
						{#each view.dots as dot, i (i)}
							<li class={dot}><span class="sr-only">Round {i + 1}: {dot}</span></li>
						{/each}
					</ol>
				{/if}

				<div class="controls">
					{#if view.status === 'waiting'}
						{#if view.phase === 'focus'}
							{@render control('startPhase', 'Start focus', true)}
						{:else}
							{@render control('startPhase', 'Start break', true)}
							{@render control('skip', 'Skip')}
						{/if}
					{:else if view.isFocus}
						{@render control(
							view.status === 'paused' ? 'resume' : 'pause',
							view.status === 'paused' ? 'Resume' : 'Pause'
						)}
					{:else}
						{@render control('skip', 'Skip break')}
					{/if}
					{@render control('complete', 'Complete')}
					<span class="more">
						<Menu label="More timer actions">
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
									<Clock size={14} /> Log time…
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
									<Square size={14} /> Stop (keep task open)
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
									<Trash2 size={14} /> Discard session
								</button>
							{/snippet}
						</Menu>
					</span>
				</div>

				{#if switchCandidate}
					<p class="switch">
						<span>Start <strong>{switchCandidate.title}</strong> instead?</span>
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
							Stop current and start
						</button>
					</p>
				{/if}
				{#if errorText}<p class="error" role="alert">{errorText}</p>{/if}
			</section>
		{:else}
			<form class="picker" method="POST" action="/api/timer" onsubmit={start}>
				<input type="hidden" name="action" value="start" />
				<input type="hidden" name="redirectTo" value="/focus" />
				<h1 class="pick-title">What are you focusing on?</h1>

				<div class="modes" role="radiogroup" aria-label="Timer mode">
					<label class:on={mode === 'focus'}>
						<input type="radio" name="mode" value="focus" bind:group={mode} />
						Focus
					</label>
					<label class:on={mode === 'pomodoro'}>
						<input type="radio" name="mode" value="pomodoro" bind:group={mode} />
						Pomodoro
					</label>
				</div>

				{#if allTasks.length === 0}
					<p class="muted empty">
						No open tasks for today or in the backlog. <a href="/">Add one on Home</a>.
					</p>
				{:else}
					<fieldset class="tasks">
						<legend class="sr-only">Task</legend>
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
											{task.durationMin} min
										</span>{/if}
								</label>
							{/each}
						{/each}
					</fieldset>
				{/if}

				{#if mode === 'focus'}
					<label class="planned">
						<span class="label">Planned minutes</span>
						<input
							type="number"
							name="plannedMin"
							min="1"
							max={MAX_TIMER_MIN}
							step="1"
							placeholder="Open-ended"
							bind:value={planned}
						/>
						<span class="muted hint">Counts down, then into overtime. Empty = stopwatch.</span>
					</label>
				{:else}
					<p class="pomo muted">
						<span class="tabular">
							{settings.focusMin} min focus · {settings.shortBreakMin} min break · {settings.longBreakMin}
							min long break every {settings.longBreakEvery}
						</span>
						<button type="button" class="link" onclick={() => (settingsOpen = true)}>Change</button>
					</p>
				{/if}

				{#if errorText}<p class="error" role="alert">{errorText}</p>{/if}

				<div class="pick-actions">
					<button type="submit" class="ctl primary" disabled={!selected || timer.busy}>
						<Play size={18} /> Start
					</button>
					{#if selected}
						<button
							type="button"
							class="link"
							onclick={() => (timer.logTarget = { id: selected.id, title: selected.title })}
						>
							Log time afterwards…
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
		padding: var(--space-8) var(--space-8) 0 var(--space-10);
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
		padding: var(--space-8) var(--space-4) var(--space-16);
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
		color: var(--accent);
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
		color: var(--accent);
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
		background: var(--accent-soft);
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
		color: var(--accent);
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
			padding: var(--space-5) var(--space-4) 0;
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
