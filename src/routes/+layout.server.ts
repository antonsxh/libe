import { takeWelcomeCookie } from '#lib/server/auth.ts';
import { todayLog } from '#lib/server/stats.ts';
import { loadStreakBase } from '#lib/server/streak.ts';
import { getTimerSnapshot } from '#lib/server/timer.ts';
import { taskCounts } from '#lib/server/tasks.ts';
import { nextDayStart, todayISO } from '#lib/dates.ts';
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
 * `badge` / `overdue`: today's open + overdue tasks — the app icon badge (`syncAppBadge`,
 * `#lib/push-client.ts`) — and the overdue ones alone (the nav's Home dot, the palette's
 * "Move overdue tasks to today"); one query on `tasks_day_idx` (`taskCounts`).
 * `today` / `dayEndsAt`: the server's day and when it ends (epoch ms, server clock) — the
 * layout refreshes all data once it has passed (an app left open over midnight).
 * `streak`: the streak through yesterday (`#lib/streak.ts`; pages add today live with
 * `pageStreak`) — one query over the completed sessions before today.
 * This load reads no tracked `url` property, so it re-runs only on `refreshAll` (form actions,
 * timer session changes, Log time / calendar edits), not on every navigation.
 */
export const load = (async ({ locals, cookies, url }) => {
	const device = locals.device;
	const now = new Date();
	const day = todayISO(undefined, now);
	const [timer, today, streak, counts] = device
		? await Promise.all([
				getTimerSnapshot(),
				todayLog(),
				loadStreakBase(locals.dailyGoalMin, locals.streakRestDays),
				taskCounts(day)
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
		badge: counts?.badge ?? null,
		overdueCount: counts?.overdue ?? null,
		today: day,
		dayEndsAt: nextDayStart(now),
		welcome
	};
}) satisfies LayoutServerLoad;
