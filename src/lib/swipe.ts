/**
 * Pure rules of the horizontal day swipe (phone day view of Plan and Calendar,
 * `DaySwipe.svelte`): when a gesture counts as horizontal, how far the content follows the
 * finger and whether letting go steps to the previous/next day.
 */

/** A gesture picks its axis once it has moved this far (px) in any direction. */
export const LOCK_PX = 10;
/** Released after this many px sideways → step… */
export const STEP_PX = 80;
/** …or this share of the swipe area's width, whichever is smaller. */
export const STEP_SHARE = 0.25;
/** A sideways flick faster than this (px/ms) steps even after a short swipe… */
export const FLICK_VELOCITY = 0.4;
/** …as long as it moved at least this far (jitter is not a flick). */
export const FLICK_MIN_PX = 30;
/** The content follows the finger at this ratio… */
export const FOLLOW_RATIO = 0.35;
/** …but never further than this (px). */
export const FOLLOW_MAX_PX = 72;

/**
 * The axis of a gesture after moving (dx, dy) from its start: `null` while it is still
 * within {@link LOCK_PX}, then `'x'` only when it is clearly sideways (|dx| > |dy|) — a
 * diagonal or vertical start is a scroll and stays one for the rest of the gesture.
 */
export function swipeAxis(dx: number, dy: number): 'x' | 'y' | null {
	if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
	const ax = Math.abs(dx);
	const ay = Math.abs(dy);
	if (Math.max(ax, ay) < LOCK_PX) return null;
	return ax > ay ? 'x' : 'y';
}

/** Offset (px) the content is drawn at while the finger is `dx` px sideways. */
export function swipeFollow(dx: number): number {
	if (!Number.isFinite(dx) || dx === 0) return 0;
	return Math.sign(dx) * Math.min(FOLLOW_MAX_PX, Math.abs(dx) * FOLLOW_RATIO);
}

export interface SwipeRelease {
	/** Sideways offset at release in px (+ = right). */
	dx: number;
	/** Sideways velocity at release in px/ms (+ = right). */
	velocity: number;
	/** Width of the swipe area in px. */
	width: number;
}

/**
 * Day step for a released sideways swipe: +1 (next day — the finger moved left), -1 (previous
 * day — moved right) or 0 (snap back). A flick against the drag direction never steps.
 */
export function swipeStep({ dx, velocity, width }: SwipeRelease): -1 | 0 | 1 {
	if (!Number.isFinite(dx) || dx === 0) return 0;
	const dir = dx < 0 ? 1 : -1;
	const distance = Math.abs(dx);
	const threshold = Math.min(STEP_PX, Math.max(0, width) * STEP_SHARE || STEP_PX);
	if (distance >= threshold) return dir;
	const v = Number.isFinite(velocity) ? velocity : 0;
	const flick = Math.abs(v) >= FLICK_VELOCITY && Math.sign(v) === Math.sign(dx);
	return flick && distance >= FLICK_MIN_PX ? dir : 0;
}
