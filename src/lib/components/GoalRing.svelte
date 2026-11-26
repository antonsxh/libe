<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Check } from '@lucide/svelte';

	/**
	 * Today's daily-goal progress as a thin ring (Apple Fitness): the accent while it fills,
	 * `--success` with a check once the goal is reached. Decorative — the control it sits in
	 * names the progress (the nav's Home link).
	 *
	 * - `sm`: a small ring with nothing inside (desktop nav, before the word "Home"); the check
	 *   sits inside once reached.
	 * - `tab`: a ring around the phone tab bar's Home icon (`children`); the check is a small
	 *   badge on the ring once reached, so the icon stays.
	 */
	type Props = {
		/** `fraction` 0‥1 of the goal, `done` = reached. */
		progress: { fraction: number; done: boolean };
		size?: 'sm' | 'tab';
		children?: Snippet;
	};
	let { progress, size = 'sm', children }: Props = $props();

	/** Filled share in percent (`pathLength` 100 makes the dash a percentage). */
	const pct = $derived(Math.round(Math.min(1, Math.max(0, progress.fraction)) * 1000) / 10);
</script>

<span
	class="goal-ring {size}"
	class:done={progress.done}
	data-progress={pct}
	data-done={progress.done}
	data-testid="goal-ring"
	aria-hidden="true"
>
	<svg class="ring">
		<circle class="track" cx="50%" cy="50%" pathLength="100" />
		{#if pct > 0}
			<circle class="fill" cx="50%" cy="50%" pathLength="100" stroke-dasharray={`${pct} 100`} />
		{/if}
	</svg>
	{#if children}<span class="inner">{@render children()}</span>{/if}
	{#if progress.done}
		<span class="check"><Check strokeWidth={size === 'sm' ? 3.5 : 4} /></span>
	{/if}
</span>

<style>
	.goal-ring {
		position: relative;
		flex: none;
		display: inline-grid;
		place-items: center;
		width: var(--goal-box);
		height: var(--goal-box);
	}
	.sm {
		--goal-box: var(--goal-ring-sm);
		--goal-bleed: 0px;
		--goal-ring-stroke: var(--goal-ring-sm-stroke);
	}
	/*
	 * The tab ring keeps the icon's layout box (so the Home label lines up with the other tabs'
	 * labels) and bleeds past it; the icon inside gets a little smaller.
	 */
	.tab {
		--goal-box: var(--tab-icon);
		--goal-bleed: calc((var(--tab-icon) - var(--goal-ring-tab)) / 2);
		--goal-ring-stroke: var(--goal-ring-tab-stroke);
	}
	.ring {
		position: absolute;
		inset: var(--goal-bleed);
		width: calc(100% - 2 * var(--goal-bleed));
		height: calc(100% - 2 * var(--goal-bleed));
		transform: rotate(-90deg);
		overflow: visible;
		fill: none;
	}
	/* Centred on the edge band, in CSS px at every size. */
	.ring circle {
		r: calc(50% - var(--goal-ring-stroke) / 2);
		stroke-width: var(--goal-ring-stroke);
	}
	.track {
		stroke: var(--goal-track);
	}
	.fill {
		stroke: var(--goal-ring);
		stroke-linecap: round;
		/* Off under reduced motion (the global rule zeroes transition durations). */
		transition:
			stroke-dasharray var(--dur-slow) var(--ease),
			stroke var(--dur) var(--ease);
	}
	.done .fill {
		stroke: var(--goal-done);
	}
	.inner {
		display: grid;
		place-items: center;
	}
	.tab .inner :global(svg) {
		width: var(--goal-ring-tab-icon);
		height: var(--goal-ring-tab-icon);
	}

	/* Reached: a check inside the small ring … */
	.check {
		display: grid;
		place-items: center;
		color: var(--goal-done);
	}
	.sm .check {
		position: absolute;
		inset: 0;
	}
	.sm .check :global(svg) {
		width: 60%;
		height: 60%;
	}
	/* … or a small badge on the tab ring's lower right (45°, clear of the label), so the Home icon stays. */
	.tab .check {
		position: absolute;
		left: calc(50% + var(--goal-badge-offset) - var(--goal-badge) / 2);
		top: calc(50% + var(--goal-badge-offset) - var(--goal-badge) / 2);
		width: var(--goal-badge);
		height: var(--goal-badge);
		border-radius: 50%;
		background: var(--goal-done);
		color: var(--success-ink);
		box-shadow: 0 0 0 1.5px var(--glass-bg-solid);
	}
	.tab .check :global(svg) {
		width: 70%;
		height: 70%;
	}
</style>
