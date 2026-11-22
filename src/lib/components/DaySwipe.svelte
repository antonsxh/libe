<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { dayDirection } from '#lib/day-view.ts';
	import { isPhoneViewport, motionEase, motionMs } from '#lib/motion.ts';
	import { releaseVelocity, type Sample } from '#lib/sheet.ts';
	import { swipeAxis, swipeFollow, swipeStep } from '#lib/swipe.ts';

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

	let area = $state<HTMLDivElement | undefined>();
	let track = $state<HTMLDivElement | undefined>();
	/** Drawn offset of the content (px) while following the finger / waiting for the step. */
	let dx = $state(0);
	let tracking = $state(false);

	let gesture: {
		id: number;
		x: number;
		y: number;
		axis: 'x' | 'y' | null;
		samples: Sample[];
	} | null = null;
	/** A step was asked for and the new day hasn't rendered yet (keep the offset till then). */
	let stepping = false;

	function onpointerdown(e: PointerEvent) {
		if (!e.isPrimary || e.button !== 0 || stepping || !isPhoneViewport()) return;
		if ((e.target as Element).closest('input, textarea, select, [contenteditable]')) return;
		gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, samples: [] };
	}

	function onpointermove(e: PointerEvent) {
		const g = gesture;
		if (!g || e.pointerId !== g.id) return;
		const mx = e.clientX - g.x;
		if (g.axis === null) {
			g.axis = swipeAxis(mx, e.clientY - g.y);
			if (g.axis === null) return;
			if (g.axis === 'y') {
				gesture = null; // a scroll: leave it alone for the rest of the gesture
				return;
			}
			area?.setPointerCapture(e.pointerId);
			tracking = true;
		}
		// `Sample.y` is just "the tracked coordinate" — here the x axis.
		g.samples.push({ t: e.timeStamp, y: e.clientX });
		if (g.samples.length > 16) g.samples.shift();
		dx = swipeFollow(mx);
	}

	async function onpointerup(e: PointerEvent) {
		const g = gesture;
		if (!g || e.pointerId !== g.id) return;
		gesture = null;
		if (g.axis !== 'x') return;
		tracking = false;
		swallowClick();
		g.samples.push({ t: e.timeStamp, y: e.clientX });
		const step = swipeStep({
			dx: e.clientX - g.x,
			velocity: releaseVelocity(g.samples),
			width: area?.clientWidth ?? 0
		});
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

	function onpointercancel(e: PointerEvent) {
		if (!gesture || e.pointerId !== gesture.id) return;
		gesture = null;
		tracking = false;
		dx = 0;
	}

	/** A mouse released over a control after a swipe still "clicks" it — swallow that one. */
	function swallowClick() {
		const stop = (ev: Event) => {
			ev.preventDefault();
			ev.stopPropagation();
		};
		window.addEventListener('click', stop, { capture: true, once: true });
		setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 50);
	}

	/** Pointer listeners (an attachment: the area is not a control itself). */
	function swipeArea(node: HTMLElement) {
		const up = (e: PointerEvent) => void onpointerup(e);
		node.addEventListener('pointerdown', onpointerdown);
		node.addEventListener('pointermove', onpointermove);
		node.addEventListener('pointerup', up);
		node.addEventListener('pointercancel', onpointercancel);
		return () => {
			node.removeEventListener('pointerdown', onpointerdown);
			node.removeEventListener('pointermove', onpointermove);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', onpointercancel);
		};
	}

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

<div class="area" class:tracking bind:this={area} {@attach swipeArea}>
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
