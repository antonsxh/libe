/**
 * Pure rules of the bottom sheet (phone `Dialog.svelte`): how a drag on its handle moves the
 * sheet and whether letting go dismisses it.
 */

/** Released after at least this share of the sheet's height → dismiss. */
export const DISMISS_SHARE = 0.3;
/** …but never more than this many px (tall sheets shouldn't need a marathon drag). */
export const DISMISS_MAX_PX = 160;
/** A downward flick faster than this (px/ms) dismisses even after a short drag… */
export const FLICK_VELOCITY = 0.5;
/** …as long as it moved at least this far (a tap with jitter is not a flick). */
export const FLICK_MIN_PX = 24;
/** Upward drags move the sheet at most this far (rubber band). */
export const RUBBER_MAX_PX = 24;

/**
 * Where the sheet is drawn for a finger offset `dy` (px, + = down): 1:1 downwards, with
 * growing resistance upwards (the sheet can't open further than its content).
 */
export function sheetOffset(dy: number): number {
	if (!Number.isFinite(dy) || dy === 0) return 0;
	if (dy > 0) return dy;
	const up = -dy;
	return -RUBBER_MAX_PX * (1 - 1 / (up / RUBBER_MAX_PX + 1));
}

export interface DragRelease {
	/** Offset at release in px (+ = down). */
	dy: number;
	/** Velocity at release in px/ms (+ = down). */
	velocity: number;
	/** Height of the sheet in px. */
	height: number;
}

/** Dismiss the sheet when it is let go after this drag? */
export function shouldDismissSheet({ dy, velocity, height }: DragRelease): boolean {
	if (!Number.isFinite(dy) || dy <= 0) return false;
	const distance = Math.min(DISMISS_MAX_PX, Math.max(0, height) * DISMISS_SHARE);
	if (dy >= distance) return true;
	return Number.isFinite(velocity) && velocity >= FLICK_VELOCITY && dy >= FLICK_MIN_PX;
}

/** A pointer sample: time in ms, y in px. */
export interface Sample {
	t: number;
	y: number;
}

/** Window of recent samples that the release velocity is measured over. */
export const VELOCITY_WINDOW_MS = 100;

/**
 * Release velocity (px/ms, + = down) from recent pointer samples (oldest first): the slope
 * over the last {@link VELOCITY_WINDOW_MS}. Fewer than two samples or no elapsed time → 0.
 */
export function releaseVelocity(samples: readonly Sample[]): number {
	if (samples.length < 2) return 0;
	const last = samples[samples.length - 1];
	let first = samples[samples.length - 2];
	for (let i = samples.length - 2; i >= 0; i--) {
		if (last.t - samples[i].t > VELOCITY_WINDOW_MS) break;
		first = samples[i];
	}
	const dt = last.t - first.t;
	return dt > 0 ? (last.y - first.y) / dt : 0;
}
