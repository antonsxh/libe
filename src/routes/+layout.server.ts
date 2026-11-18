import { getTimerSnapshot } from '#lib/server/timer.ts';
import { DEFAULT_POMODORO, type TimerSnapshot } from '#lib/timer.ts';
import type { LayoutServerLoad } from './$types';

/**
 * The paired device (null on the public pairing pages) and the timer snapshot that seeds
 * the client store (SSR renders running cards / nav chip). Without a device there is no
 * timer to show and the store stays disconnected.
 */
export const load = (async ({ locals }) => {
	const device = locals.device;
	const timer: TimerSnapshot = device
		? await getTimerSnapshot()
		: { now: Date.now(), timer: null, settings: DEFAULT_POMODORO };
	return { device, timer };
}) satisfies LayoutServerLoad;
