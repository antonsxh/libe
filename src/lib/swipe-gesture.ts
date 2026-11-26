/**
 * The pointer plumbing of a sideways swipe (phone day view: `DaySwipe` steps days, the
 * `DayStrip` steps weeks), on top of the pure rules in `#lib/swipe.ts`: the axis locks after
 * a few px (a vertical start stays a scroll for the whole gesture), the content follows the
 * finger, and the release decides the step from distance and velocity. The element should be
 * `touch-action: pan-y` so the browser keeps vertical scrolling and hands sideways moves over.
 */
import { releaseVelocity, type Sample } from './sheet.ts';
import { swipeAxis, swipeFollow, swipeStep } from './swipe.ts';

export interface SwipeHandlers {
	/** May a gesture start now (e.g. phones only, not while a step is pending)? */
	canStart: (e: PointerEvent) => boolean;
	/** The gesture locked sideways (start following the finger). */
	onLock?: () => void;
	/** Offset (px) to draw the content at while following the finger (`swipeFollow`). */
	onFollow: (dx: number) => void;
	/** Released after a sideways gesture: -1 (previous), 1 (next) or 0 (snap back). */
	onRelease: (step: -1 | 0 | 1) => void;
	/** Cancelled by the browser: snap back. */
	onCancel: () => void;
}

/** An attachment (`{@attach swipeGesture({...})}`) that reports sideways swipes. */
export function swipeGesture(h: SwipeHandlers) {
	return (node: HTMLElement) => {
		let gesture: {
			id: number;
			x: number;
			y: number;
			axis: 'x' | 'y' | null;
			samples: Sample[];
		} | null = null;

		function down(e: PointerEvent) {
			if (!e.isPrimary || e.button !== 0 || !h.canStart(e)) return;
			if ((e.target as Element).closest('input, textarea, select, [contenteditable]')) return;
			gesture = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, samples: [] };
		}

		function move(e: PointerEvent) {
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
				node.setPointerCapture(e.pointerId);
				h.onLock?.();
			}
			// `Sample.y` is just "the tracked coordinate" — here the x axis.
			g.samples.push({ t: e.timeStamp, y: e.clientX });
			if (g.samples.length > 16) g.samples.shift();
			h.onFollow(swipeFollow(mx));
		}

		function up(e: PointerEvent) {
			const g = gesture;
			if (!g || e.pointerId !== g.id) return;
			gesture = null;
			if (g.axis !== 'x') return;
			swallowClick();
			g.samples.push({ t: e.timeStamp, y: e.clientX });
			h.onRelease(
				swipeStep({
					dx: e.clientX - g.x,
					velocity: releaseVelocity(g.samples),
					width: node.clientWidth
				})
			);
		}

		function cancel(e: PointerEvent) {
			if (!gesture || e.pointerId !== gesture.id) return;
			gesture = null;
			h.onCancel();
		}

		node.addEventListener('pointerdown', down);
		node.addEventListener('pointermove', move);
		node.addEventListener('pointerup', up);
		node.addEventListener('pointercancel', cancel);
		return () => {
			node.removeEventListener('pointerdown', down);
			node.removeEventListener('pointermove', move);
			node.removeEventListener('pointerup', up);
			node.removeEventListener('pointercancel', cancel);
		};
	};
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
