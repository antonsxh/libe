import { takeWelcomeCookie } from '#lib/server/auth.ts';
import { todayLog } from '#lib/server/stats.ts';
import { loadStreakBase } from '#lib/server/streak.ts';
import { getTimerSnapshot } from '#lib/server/timer.ts';
import { openTodayCount } from '#lib/server/push.ts';
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
 * `openToday`: today's open tasks — the app icon badge (`syncAppBadge`, `#lib/push-client.ts`), one count on the
 * `tasks_day_idx` index.
 * `streak`: the streak through yesterday (`#lib/streak.ts`; pages add today live with
 * `pageStreak`) — one query over the completed sessions before today.
 * This load reads no tracked `url` property, so it re-runs only on `refreshAll` (form actions,
 * timer session changes, Log time / calendar edits), not on every navigation.
 */
export const load = (async ({ locals, cookies, url }) => {
	const device = locals.device;
	const [timer, today, streak, openToday] = device
		? await Promise.all([
				getTimerSnapshot(),
				todayLog(),
				loadStreakBase(locals.dailyGoalMin, locals.streakRestDays),
				openTodayCount()
			])
		: [
				{ now: Date.now(), timer: null, settings: DEFAULT_POMODORO } satisfies TimerSnapshot,
				null,
				null,
				null
			];
	const welcome = device !== null && takeWelcomeCookie(cookies, url);
	return {
		device,
		timer,
		locale: locals.locale,
		profile: locals.profile,
		dailyGoalMin: locals.dailyGoalMin,
		todayLog: today,
		streak,
		openToday,
		welcome
	};
}) satisfies LayoutServerLoad;
