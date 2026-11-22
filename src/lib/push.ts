/**
 * Web Push — the pure rules (client-safe, unit-tested):
 * - which subscription endpoints the server may ever POST to (SSRF allowlist),
 * - validation of a subscription body (`POST /api/push`),
 * - which timer moments deserve a push (`nextPushEvent`, `lastPhaseEnd`) and their idempotency keys,
 * - the notification texts,
 * - the state of Settings → Notifications (`notificationsState`).
 *
 * Sending, keys and storage live in `server/push.ts`; the scheduler in `server/push-scheduler.ts`.
 */
import type { ErrorCode, I18n } from '#lib/i18n/index.ts';
import { deviceModelFromUA } from '#lib/auth.ts';
import {
	breakAfter,
	clockTargetAt,
	rolloverPomodoro,
	runClockOf,
	type PomodoroSettings,
	type RunClock,
	type TimerSnapshot
} from '#lib/timer.ts';

// ─── Endpoint allowlist (SSRF guard) ────────────────────────────────────────

/** Push services by exact host. */
export const PUSH_HOSTS = [
	'web.push.apple.com', // Safari / iOS home-screen apps
	'fcm.googleapis.com', // Chrome, Edge on Android, most Chromium browsers
	'updates.push.services.mozilla.com' // Firefox
] as const;
/** …and by host suffix (Apple documents `*.push.apple.com`; Edge uses `wns2-*.notify.windows.com`). */
export const PUSH_HOST_SUFFIXES = [
	'.push.apple.com',
	'.push.services.mozilla.com',
	'.notify.windows.com'
] as const;

export const ENDPOINT_MAX = 2048;

/**
 * May the server send pushes to `endpoint`? Only `https:` URLs on a known push service, on
 * the default port, without credentials. `testOrigin` (e2e only, `LIBE_PUSH_TEST_ENDPOINT_ORIGIN`)
 * additionally allows exactly that origin, e.g. `http://127.0.0.1:3129`.
 */
export function isAllowedPushEndpoint(endpoint: unknown, testOrigin?: string | null): boolean {
	if (typeof endpoint !== 'string' || endpoint.length > ENDPOINT_MAX) return false;
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return false;
	}
	if (url.username || url.password) return false;
	if (testOrigin && url.origin === testOrigin) return true;
	if (url.protocol !== 'https:' || url.port !== '') return false;
	const host = url.hostname.toLowerCase();
	return (
		(PUSH_HOSTS as readonly string[]).includes(host) ||
		PUSH_HOST_SUFFIXES.some((s) => host.endsWith(s) && host.length > s.length)
	);
}

// ─── Subscription body ──────────────────────────────────────────────────────

/** Byte length of a base64url string (padding optional), or null when it isn't one. */
export function base64urlLength(value: unknown): number | null {
	if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
	const n = value.replace(/=+$/, '').length;
	if (n % 4 === 1) return null;
	return Math.floor((n * 3) / 4);
}

/** First byte of a base64url string (0x04 marks an uncompressed EC point). */
function firstByte(value: string): number {
	const s = value.slice(0, 4).replace(/-/g, '+').replace(/_/g, '/');
	return atob(s.padEnd(4, '=')).charCodeAt(0);
}

export interface PushSubscriptionInput {
	endpoint: string;
	p256dh: string;
	auth: string;
}

/**
 * Validate `PushSubscription.toJSON()` (`{ endpoint, keys: { p256dh, auth } }`): an allowed
 * endpoint, a 65-byte uncompressed P-256 key and a 16-byte auth secret, all base64url.
 */
export function parsePushSubscription(
	raw: unknown,
	testOrigin?: string | null
): { ok: true; value: PushSubscriptionInput } | { ok: false; error: ErrorCode } {
	if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'invalidBody' };
	const body = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
	if (!isAllowedPushEndpoint(body.endpoint, testOrigin))
		return { ok: false, error: 'pushEndpointInvalid' };
	const p256dh = body.keys?.p256dh;
	const auth = body.keys?.auth;
	if (
		base64urlLength(p256dh) !== 65 ||
		firstByte(p256dh as string) !== 4 ||
		base64urlLength(auth) !== 16
	)
		return { ok: false, error: 'pushKeysInvalid' };
	return {
		ok: true,
		value: {
			endpoint: body.endpoint as string,
			p256dh: (p256dh as string).replace(/=+$/, ''),
			auth: (auth as string).replace(/=+$/, '')
		}
	};
}

// ─── Timer events ───────────────────────────────────────────────────────────

/**
 * - `countdownDone`  a focus countdown reached its planned minutes (it keeps counting as overtime)
 * - `breakStarted`   a pomodoro focus round ended and the break started on its own (auto-start)
 * - `breakWaiting`   a focus round ended; the break waits for "Start break"
 * - `focusStarted`   a short break ended and the next round started on its own
 * - `focusWaiting`   a break ended; the next round waits for "Start focus" (always after a long break)
 */
export type PushEventKind =
	'countdownDone' | 'breakStarted' | 'breakWaiting' | 'focusStarted' | 'focusWaiting';

export interface PushEvent {
	kind: PushEventKind;
	/** Server instant the phase ends (epoch ms). */
	at: number;
	/**
	 * Idempotency key — one push per key, ever: `<sessionId>:countdown` or
	 * `<runId>:<round>:<phase that ended>`.
	 */
	key: string;
	taskId: string;
	/** countdownDone: the planned minutes; breakStarted/breakWaiting: the break's length. */
	minutes: number;
	/** The break is a long one (breakStarted/breakWaiting). */
	long: boolean;
}

/** The end of a pomodoro run's current phase, if it ends on its own (running, not paused/waiting). */
export function phaseEndEvent(
	run: RunClock,
	runId: string,
	taskId: string,
	settings: PomodoroSettings
): PushEvent | null {
	if (run.phaseStartedAt === null) return null;
	const key = `${runId}:${run.round}:${run.phase}`;
	if (run.phase === 'focus') {
		const s = run.session;
		if (!s || s.state !== 'running') return null;
		const long = breakAfter(run.round, settings.longBreakEvery) === 'long_break';
		return {
			kind: settings.autoStart ? 'breakStarted' : 'breakWaiting',
			at: s.startedAt + (s.durationMin ?? run.phaseMin) * 60_000 + s.pausedMs,
			key,
			taskId,
			minutes: long ? settings.longBreakMin : settings.shortBreakMin,
			long
		};
	}
	const auto = settings.autoStart && run.phase !== 'long_break';
	return {
		kind: auto ? 'focusStarted' : 'focusWaiting',
		at: run.phaseStartedAt + run.phaseMin * 60_000,
		key,
		taskId,
		minutes: run.phaseMin,
		long: run.phase === 'long_break'
	};
}

/**
 * The latest phase end of `run` up to `now` — what a rollover (`rolloverPomodoro`) that moved
 * the run from `run` to `now` should announce. Earlier ends of the same rollover are skipped
 * on purpose: after a gap, one notification describing the current state beats a burst.
 */
export function lastPhaseEnd(
	run: RunClock,
	runId: string,
	taskId: string,
	settings: PomodoroSettings,
	now: number
): PushEvent | null {
	let state = run;
	let last: PushEvent | null = null;
	for (let i = 0; i < 500; i++) {
		const ev = phaseEndEvent(state, runId, taskId, settings);
		if (!ev || ev.at > now) break;
		last = ev;
		const next = rolloverPomodoro(state, settings, ev.at);
		if (!next.changed) break;
		state = next.run;
	}
	return last;
}

/**
 * The next push the timer in `snapshot` will need, or null (no timer, stopwatch, paused,
 * waiting phase). Its `at` may already be past: a countdown in overtime (sent once — the
 * key guards it) or a pomodoro phase the server hasn't rolled over yet.
 */
export function nextPushEvent(snapshot: TimerSnapshot): PushEvent | null {
	const timer = snapshot.timer;
	if (!timer) return null;
	const run = runClockOf(timer);
	if (run && timer.run) return phaseEndEvent(run, timer.run.id, timer.task.id, snapshot.settings);
	const s = timer.session;
	if (!s || s.durationMin === null) return null;
	const at = clockTargetAt(s);
	if (at === null) return null;
	return {
		kind: 'countdownDone',
		at,
		key: `${s.id}:countdown`,
		taskId: timer.task.id,
		minutes: s.durationMin,
		long: false
	};
}

/** `setTimeout` takes at most 2^31 − 1 ms (~24.8 days); longer waits re-arm in steps. */
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;
/** Fire a little after the instant, so the rollover (`end <= now`) has certainly happened. */
const SLACK_MS = 20;
/** A due event that didn't resolve on the first check is retried at most this often. */
const RETRY_MS = 1000;

/** Scheduler delay until `event` is checked: clamped to the timeout range, paced on retries. */
export function armDelay(event: Pick<PushEvent, 'at'>, now: number, retry = false): number {
	const wait = Math.max(0, event.at - now) + SLACK_MS;
	return Math.min(MAX_TIMEOUT_MS, retry ? Math.max(wait, RETRY_MS) : wait);
}

// ─── Payload ────────────────────────────────────────────────────────────────

/** Every timer notification shares this tag (and the Web Push `Topic`): a newer one replaces it. */
export const TIMER_TAG = 'libe-timer';
export const TEST_TAG = 'libe-test';
/** Phase-end pushes expire after 5 min — a late "Break over" is noise. */
export const TIMER_TTL_S = 300;

/** What the service worker receives (JSON, encrypted). */
export interface PushPayload {
	title: string;
	body: string;
	tag: string;
	/** In-app path the notification opens. */
	url: string;
	/** Today's open tasks → the app icon badge (0 clears it); null = leave it. */
	badge: number | null;
}

/** Title + body of a timer notification (`taskTitle` is the body). */
export function timerPushText(
	event: Pick<PushEvent, 'kind' | 'minutes' | 'long'>,
	taskTitle: string,
	t: I18n
): { title: string; body: string } {
	const p = t.push;
	const title =
		event.kind === 'countdownDone'
			? p.countdownDone
			: event.kind === 'breakStarted'
				? event.long
					? p.longBreakStarted(event.minutes)
					: p.breakStarted(event.minutes)
				: event.kind === 'breakWaiting'
					? p.breakWaiting
					: event.kind === 'focusStarted'
						? p.focusStarted
						: p.focusWaiting;
	return { title, body: taskTitle };
}

// ─── Settings → Notifications ───────────────────────────────────────────────

export type NotificationsState =
	/** Inside the Tauri desktop app (its webview has no Web Push) → the section is hidden. */
	| 'hidden'
	/** iPhone/iPad in a Safari tab: Web Push needs the home-screen app. */
	| 'install'
	/** No Push API / Notifications / service worker here. */
	| 'unsupported'
	| 'denied'
	| 'off'
	| 'on';

export interface NotificationsEnv {
	desktopApp: boolean;
	/** `navigator.userAgent` + `maxTouchPoints` (iPadOS reports a Mac). */
	userAgent: string;
	touchPoints: number;
	standalone: boolean;
	/** `PushManager`, `Notification` and a service worker are available. */
	pushSupported: boolean;
	permission: 'default' | 'granted' | 'denied';
	/** This browser holds a subscription the server knows for this device. */
	subscribed: boolean;
}

/** Is this an iPhone/iPad (incl. iPadOS with its desktop UA)? */
export function isAppleMobile(userAgent: string, touchPoints: number): boolean {
	const model = deviceModelFromUA(userAgent, { touch: touchPoints > 1 });
	return model === 'iphone' || model === 'ipad';
}

export function notificationsState(env: NotificationsEnv): NotificationsState {
	if (env.desktopApp) return 'hidden';
	if (isAppleMobile(env.userAgent, env.touchPoints) && !env.standalone) return 'install';
	if (!env.pushSupported) return 'unsupported';
	if (env.permission === 'denied') return 'denied';
	return env.subscribed && env.permission === 'granted' ? 'on' : 'off';
}
