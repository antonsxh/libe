<script lang="ts">
	import { Pause, Play, SkipForward } from '@lucide/svelte';
	import { useTimer } from '#lib/timer-store.svelte.ts';
	import { primaryTimerAction, timerLabelText } from '#lib/timer.ts';
	import { questColorVar } from '#lib/quest-colors.ts';
	import { rise } from '#lib/motion.ts';
	import { useI18n } from '#lib/i18n/context.svelte.ts';

	/*
	 * Phones: the active timer as a compact bar just above the bottom tab bar — the task, its
	 * clock and one big pause/resume button; the rest of the bar opens Focus. Everything comes
	 * from the server snapshot (`timer.view`); the button only sends a command.
	 */
	type Props = {
		/** Styleguide: a static bar with this content (no timer, rendered in place at any width). */
		demo?: { title: string; color: string; display: string; paused: boolean; progress: number };
	};
	let { demo }: Props = $props();

	const timer = useTimer();
	const t = useI18n();
	const active = $derived.by(() => {
		if (demo) {
			const status: 'running' | 'paused' = demo.paused ? 'paused' : 'running';
			return {
				task: { title: demo.title, questColor: demo.color },
				view: {
					status,
					isFocus: true,
					display: demo.display,
					progress: demo.progress,
					label: { state: status }
				}
			};
		}
		return timer.timer && timer.view ? { task: timer.timer.task, view: timer.view } : null;
	});
</script>

{#if active}
	{@const view = active.view}
	{@const action = primaryTimerAction(view)}
	{@const state = timerLabelText(view.label, t).toLocaleLowerCase(t.intl)}
	<div
		class="player"
		class:live={!demo}
		class:paused={view.status !== 'running'}
		role="region"
		aria-label={t.miniPlayer.label}
		data-testid="mini-player"
		style:--q={questColorVar(active.task.questColor)}
		in:rise
		out:rise={{ enter: false }}
	>
		<a
			class="open"
			href="/focus"
			aria-label={t.miniPlayer.open(active.task.title, view.display, state)}
		>
			<span class="title">{active.task.title}</span>
			<span class="meta">
				<span class="rec" aria-hidden="true"></span>
				<span class="time tabular">{view.display}</span>
				{#if view.status !== 'running' || !view.isFocus}
					<span class="state">{state}</span>
				{/if}
			</span>
		</a>
		<button
			type="button"
			class="toggle"
			aria-label={t.miniPlayer[action]}
			disabled={timer.busy}
			onclick={() => (demo ? undefined : timer.command(action))}
		>
			{#key action}
				<span class="icon">
					{#if action === 'pause'}<Pause size={20} fill="currentColor" strokeWidth={0} />
					{:else if action === 'skip'}<SkipForward size={20} />
					{:else}<Play size={20} fill="currentColor" strokeWidth={0} />{/if}
				</span>
			{/key}
		</button>
		{#if view.progress > 0}
			<span class="progress" style:--p={view.progress} aria-hidden="true"></span>
		{/if}
	</div>
{/if}

<style>
	.player {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-2);
		height: var(--player-h);
		padding: 0 var(--space-2) 0 0;
		overflow: hidden;
		background: var(--surface-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-pop);
	}
	/* Quest colour on the left edge, like the task cards. */
	.player::before {
		content: '';
		flex: none;
		align-self: stretch;
		width: 3px;
		background: var(--q);
	}
	/* The real one: phones only, fixed just above the bottom tab bar. */
	.player.live {
		display: none;
	}
	@media (max-width: 720px) {
		.player.live {
			position: fixed;
			z-index: 19; /* under the tab bar/top bar (20), menus (40) and dialogs (top layer) */
			left: calc(var(--space-2) + var(--safe-left));
			right: calc(var(--space-2) + var(--safe-right));
			bottom: calc(var(--tabbar-h) + var(--safe-bottom) + var(--space-2));
			display: flex;
		}
	}

	.open {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		display: grid;
		align-content: center;
		gap: 2px;
		padding: 0 var(--space-2) 0 var(--space-3);
		border-radius: var(--radius-md);
		-webkit-touch-callout: none;
		-webkit-user-select: none;
		user-select: none;
		transition: background var(--dur) var(--ease);
	}
	.open:active {
		background: var(--surface-hover);
	}
	.title {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
		color: var(--text-2);
		font-size: var(--fs-sm);
	}
	.rec {
		flex: none;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--danger);
		animation: rec var(--dur-pulse) ease-in-out infinite;
	}
	.paused .rec {
		background: var(--text-faint);
		animation: none;
	}
	.paused .time {
		color: var(--text-muted);
	}
	.state {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--text-muted);
	}
	@keyframes rec {
		50% {
			opacity: 0.35;
		}
	}

	/* The one big control: a light disc (the bar's primary action). */
	.toggle {
		flex: none;
		display: grid;
		place-items: center;
		width: var(--hit-min);
		height: var(--hit-min);
		padding: 0;
		border: none;
		border-radius: 50%;
		background: var(--text);
		color: var(--bg);
		transition:
			scale var(--dur-press) var(--ease-out),
			opacity var(--dur) var(--ease);
	}
	.toggle:disabled {
		opacity: 0.6;
	}
	.icon {
		display: grid;
		place-items: center;
		animation: pop-in var(--dur-pop) var(--ease-spring);
	}

	.progress {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 2px;
		width: calc(100% * var(--p));
		background: var(--q);
		pointer-events: none;
		transition: width var(--dur-tick) linear;
	}
</style>
