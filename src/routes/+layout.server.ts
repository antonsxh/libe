import { takeWelcomeCookie } from '#lib/server/auth.ts';
import { todayLog } from '#lib/server/stats.ts';
import { getTimerSnapshot } from '#lib/server/timer.ts';
import { DEFAULT_POMODORO, type TimerSnapshot } from '#lib/timer.ts';
import type { LayoutServerLoad } from './$types';

/**
 * The paired device (null on the public pairing pages), the UI language, the profile and the
 * daily goal (null without a device — public pages never get the owner's data) and the timer
 * snapshot that seeds the client store (SSR renders running cards / nav chip). Without a
 * device there is no timer to show and the store stays disconnected. `welcome`: the first
 * page after a pairing (one-time cookie) greets the new device.
 *
 * `todayLog`: minutes logged today (Home's stat, the avatar's goal ring) — one indexed query.
 * This load reads no tracked `url` property, so it re-runs only on `refreshAll` (form actions,
 * timer session changes, Log time / calendar edits), not on every navigation.
 */
export const load = (async ({ locals, cookies, url }) => {
	const device = locals.device;
	const [timer, today] = device
		? await Promise.all([getTimerSnapshot(), todayLog()])
		: [{ now: Date.now(), timer: null, settings: DEFAULT_POMODORO } satisfies TimerSnapshot, null];
	const welcome = device !== null && takeWelcomeCookie(cookies, url);
	return {
		device,
		timer,
		locale: locals.locale,
		profile: locals.profile,
		dailyGoalMin: locals.dailyGoalMin,
		todayLog: today,
		welcome
	};
}) satisfies LayoutServerLoad;
