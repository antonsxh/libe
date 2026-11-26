<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { dayDirection } from '#lib/day-view.ts';
	import { isPhoneViewport, motionEase, motionMs } from '#lib/motion.ts';
	import { swipeGesture } from '#lib/swipe-gesture.ts';

	/**
	 * Phones only (≤ 720px): the day view's content. Swiping it sideways steps to the previous /
	 * next day (`onstep`, the page navigates); the content follows the finger a little and the
	 * new day slides in from the side it came from — also when the day changes any other way
	 * (day strip, week arrows). Vertical scrolling is never taken over: the gesture's axis is
	 * locked after its first few px (`#lib/swipe.ts`) and the area is `touch-action: pan-y`.
	 * Tap equivalents: the day strip and the week arrows.
	 */
	type Props = {
		/** The shown day (ISO) — a change slides the content in. */
		day: string;
		/** Step by ±1 day; resolves once the navigation is done. */
		onstep: (delta: -1 | 1) => Promise<unknown> | void;
		children: Snippet;
	};
	let { day, onstep, children }: Props = $props();

	let track = $state<HTMLDivElement | undefined>();
	/** Drawn offset of the content (px) while following the finger / waiting for the step. */
	let dx = $state(0);
	let tracking = $state(false);

	/** A step was asked for and the new day hasn't rendered yet (keep the offset till then). */
	let stepping = false;

	async function release(step: -1 | 0 | 1) {
		tracking = false;
		if (step === 0) {
			dx = 0; // springs back (CSS transition)
			return;
		}
		stepping = true;
		try {
			await onstep(step);
		} finally {
			// Navigation failed or kept the day: don't leave the content hanging aside.
			if (stepping) {
				stepping = false;
				dx = 0;
			}
		}
	}

	const swipeArea = swipeGesture({
		canStart: () => !stepping && isPhoneViewport(),
		onLock: () => (tracking = true),
		onFollow: (x) => (dx = x),
		onRelease: (step) => void release(step),
		onCancel: () => {
			tracking = false;
			dx = 0;
		}
	});

	/* The day changed (swipe, strip, week arrows): slide the new day in from its side. */
	let shown = untrack(() => day);
	$effect(() => {
		const next = day;
		const from = shown;
		if (next === from) return;
		shown = next;
		stepping = false;
		dx = 0;
		const dir = dayDirection(from, next);
		const ms = motionMs('--dur-pop');
		if (!track || dir === 0 || ms === 0 || !isPhoneViewport()) return;
		const dist = parseFloat(getComputedStyle(track).getPropertyValue('--day-slide')) || 40;
		track.animate(
			[
				{ transform: `translateX(${dir * dist}px)`, opacity: 0.35 },
				{ transform: 'translateX(0)', opacity: 1 }
			],
			{ duration: ms, easing: motionEase('--ease-out') }
		);
	});
</script>

<div class="area" class:tracking {@attach swipeArea}>
	<div class="track" bind:this={track} style:transform={dx ? `translateX(${dx}px)` : undefined}>
		{@render children()}
	</div>
</div>

<style>
	@media (max-width: 720px) {
		.area,
		.area :global(*) {
			/* Vertical scrolling (and zoom) stay the browser's; sideways moves come to us. */
			touch-action: pan-y pinch-zoom;
		}
		.area {
			/* A short or empty day is still swipeable below its content. */
			min-height: var(--day-swipe-min-h);
			/* The content moving aside must never widen the page. */
			overflow-x: clip;
		}
		/* Native drag (draggable cards, links) would steal a sideways drag. */
		.area :global(*) {
			-webkit-user-drag: none;
		}
		.track {
			transition: transform var(--dur-pop) var(--ease-out);
		}
		.tracking .track {
			transition: none;
			-webkit-user-select: none;
			user-select: none;
		}
	}
</style>
