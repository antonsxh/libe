import { takeWelcomeCookie } from '#lib/server/auth.ts';
import { getTimerSnapshot } from '#lib/server/timer.ts';
import { DEFAULT_POMODORO, type TimerSnapshot } from '#lib/timer.ts';
import type { LayoutServerLoad } from './$types';

/**
 * The paired device (null on the public pairing pages), the UI language, the profile (null
 * without a device — public pages never get the owner's name) and the timer snapshot that
 * seeds the client store (SSR renders running cards / nav chip). Without a device there is
 * no timer to show and the store stays disconnected. `welcome`: the first page after a
 * pairing (one-time cookie) greets the new device.
 */
export const load = (async ({ locals, cookies, url }) => {
	const device = locals.device;
	const timer: TimerSnapshot = device
		? await getTimerSnapshot()
		: { now: Date.now(), timer: null, settings: DEFAULT_POMODORO };
	const welcome = device !== null && takeWelcomeCookie(cookies, url);
	return { device, timer, locale: locals.locale, profile: locals.profile, welcome };
}) satisfies LayoutServerLoad;
