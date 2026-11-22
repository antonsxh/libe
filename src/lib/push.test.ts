import { describe, expect, test } from 'bun:test';
import {
	MAX_TIMEOUT_MS,
	armDelay,
	base64urlLength,
	isAllowedPushEndpoint,
	lastPhaseEnd,
	nextPushEvent,
	notificationsState,
	parsePushSubscription,
	phaseEndEvent,
	timerPushText,
	type NotificationsEnv
} from './push.ts';
import {
	DEFAULT_POMODORO,
	pauseClock,
	resumeClock,
	rolloverPomodoro,
	type ActiveTimer,
	type PomodoroSettings,
	type RunClock,
	type TimerSnapshot
} from './timer.ts';
import { i18n } from './i18n/index.ts';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 22, 9, 0);

// ─── Allowlist ──────────────────────────────────────────────────────────────

describe('isAllowedPushEndpoint', () => {
	test.each([
		'https://web.push.apple.com/QGuQyavXutnMH-1/abc',
		'https://api.push.apple.com/x',
		'https://fcm.googleapis.com/fcm/send/dXk:APA91b',
		'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
		'https://push.services.mozilla.com/x'.replace('push.', 'a.push.'),
		'https://wns2-par02p.notify.windows.com/w/?token=BQYAAAA'
	])('allows %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(true));

	test.each([
		'http://web.push.apple.com/x', // not https
		'https://web.push.apple.com:8443/x', // other port
		'https://user:pw@fcm.googleapis.com/x', // credentials
		'https://example.com/x',
		'https://push.apple.com.evil.com/x',
		'https://evilpush.apple.com.example/x',
		'https://.push.apple.com/x',
		'https://notify.windows.com/x', // suffix needs a label in front
		'http://10.0.0.1/x',
		'http://127.0.0.1:3129/push',
		'https://169.254.169.254/latest',
		'javascript:alert(1)',
		'not a url',
		42,
		null,
		`https://fcm.googleapis.com/${'a'.repeat(2048)}`
	])('rejects %s', (url) => expect(isAllowedPushEndpoint(url)).toBe(false));

	test('the e2e test origin allows exactly that origin', () => {
		const origin = 'http://127.0.0.1:3129';
		expect(isAllowedPushEndpoint('http://127.0.0.1:3129/push/abc', origin)).toBe(true);
		expect(isAllowedPushEndpoint('http://127.0.0.1:3130/push/abc', origin)).toBe(false);
		expect(isAllowedPushEndpoint('http://127.0.0.1:3129/push/abc', null)).toBe(false);
		expect(isAllowedPushEndpoint('https://example.com/x', origin)).toBe(false);
	});
});

// ─── Subscription body ──────────────────────────────────────────────────────

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const p256dh = b64url(new Uint8Array([4, ...new Uint8Array(64).fill(7)]));
const auth = b64url(new Uint8Array(16).fill(9));
const endpoint = 'https://web.push.apple.com/QGuQ';

describe('parsePushSubscription', () => {
	test('accepts PushSubscription.toJSON() and strips padding', () => {
		expect(parsePushSubscription({ endpoint, keys: { p256dh, auth: `${auth}==` } })).toEqual({
			ok: true,
			value: { endpoint, p256dh, auth }
		});
	});
	test('endpoint outside the allowlist', () => {
		expect(
			parsePushSubscription({ endpoint: 'https://example.com/x', keys: { p256dh, auth } })
		).toEqual({ ok: false, error: 'pushEndpointInvalid' });
	});
	test.each([
		[{ p256dh: p256dh.slice(0, -2), auth }], // 64 bytes
		[{ p256dh: b64url(new Uint8Array(65).fill(3)), auth }], // not an uncompressed point
		[{ p256dh, auth: b64url(new Uint8Array(15)) }],
		[{ p256dh, auth: b64url(new Uint8Array(32)) }],
		[{ p256dh: p256dh.replace(/./, '+'), auth }], // base64, not base64url
		[{ p256dh }],
		[undefined]
	])('bad keys %#', (keys) => {
		expect(parsePushSubscription({ endpoint, keys })).toEqual({
			ok: false,
			error: 'pushKeysInvalid'
		});
	});
	test('not an object', () => {
		expect(parsePushSubscription(null)).toEqual({ ok: false, error: 'invalidBody' });
		expect(parsePushSubscription('x')).toEqual({ ok: false, error: 'invalidBody' });
	});
	test('base64urlLength', () => {
		expect(base64urlLength(p256dh)).toBe(65);
		expect(base64urlLength(auth)).toBe(16);
		expect(base64urlLength('a')).toBeNull();
		expect(base64urlLength('')).toBeNull();
		expect(base64urlLength('ab/c')).toBeNull();
	});
});

// ─── Events ─────────────────────────────────────────────────────────────────

const task = {
	id: 'task-1',
	title: 'Deep work',
	kind: 'quest' as const,
	questId: 'q',
	questName: 'Q',
	questColor: 'teal',
	durationMin: 40
};

function countdown(
	over: Partial<NonNullable<ActiveTimer['session']>> = {},
	now = T0
): TimerSnapshot {
	return {
		now,
		settings: DEFAULT_POMODORO,
		timer: {
			mode: 'focus',
			task,
			run: null,
			session: {
				id: 'sess-1',
				source: 'focus',
				state: 'running',
				startedAt: T0,
				pausedMs: 0,
				pausedAt: null,
				durationMin: 25,
				...over
			}
		}
	};
}

/** A pomodoro snapshot from a pure run clock (as the server builds it). */
function pomodoro(run: RunClock, settings: PomodoroSettings, now: number): TimerSnapshot {
	return {
		now,
		settings,
		timer: {
			mode: 'pomodoro',
			task,
			run: {
				id: 'run-1',
				phase: run.phase,
				round: run.round,
				phaseStartedAt: run.phaseStartedAt,
				phaseMin: run.phaseMin
			},
			session: run.session ? { ...run.session, id: `s-${run.round}`, source: 'pomodoro' } : null
		}
	};
}

const startRun = (settings: PomodoroSettings): RunClock => ({
	phase: 'focus',
	round: 1,
	phaseStartedAt: T0,
	phaseMin: settings.focusMin,
	session: {
		state: 'running',
		startedAt: T0,
		pausedMs: 0,
		pausedAt: null,
		durationMin: settings.focusMin
	}
});

/** Walk a run through its phases the way the server does: event, then rollover at its time. */
function sequence(settings: PomodoroSettings, steps: number) {
	let run = startRun(settings);
	const events = [];
	for (let i = 0; i < steps; i++) {
		const ev = nextPushEvent(pomodoro(run, settings, T0));
		if (!ev) break;
		events.push(ev);
		run = rolloverPomodoro(run, settings, ev.at).run;
	}
	return events;
}

describe('nextPushEvent — countdown', () => {
	test('due at start + planned minutes, keyed by the session', () => {
		expect(nextPushEvent(countdown())).toEqual({
			kind: 'countdownDone',
			at: T0 + 25 * MIN,
			key: 'sess-1:countdown',
			taskId: 'task-1',
			minutes: 25,
			long: false
		});
	});
	test('overtime keeps the same (past) event — sent once thanks to the key', () => {
		const late = nextPushEvent(countdown({}, T0 + 90 * MIN))!;
		expect(late.at).toBe(T0 + 25 * MIN);
		expect(late.key).toBe('sess-1:countdown');
	});
	test('paused → nothing; a resume shifts the due time by the pause', () => {
		const s = countdown().timer!.session!;
		const paused = pauseClock(s, T0 + 10 * MIN);
		if (!paused.ok) throw new Error();
		expect(nextPushEvent(countdown(paused.value))).toBeNull();
		const resumed = resumeClock(paused.value, T0 + 17 * MIN);
		if (!resumed.ok) throw new Error();
		expect(nextPushEvent(countdown(resumed.value))!.at).toBe(T0 + 32 * MIN);
	});
	test('stopwatch, no timer → nothing', () => {
		expect(nextPushEvent(countdown({ durationMin: null }))).toBeNull();
		expect(nextPushEvent({ now: T0, timer: null, settings: DEFAULT_POMODORO })).toBeNull();
	});
});

describe('nextPushEvent — pomodoro', () => {
	test('auto-start: focus → break started → focus started …, long break then waits', () => {
		const settings = { ...DEFAULT_POMODORO, longBreakEvery: 2 };
		const events = sequence(settings, 10);
		expect(events.map((e) => [e.kind, e.key, (e.at - T0) / MIN])).toEqual([
			['breakStarted', 'run-1:1:focus', 25],
			['focusStarted', 'run-1:1:short_break', 30],
			['breakStarted', 'run-1:2:focus', 55],
			['focusWaiting', 'run-1:2:long_break', 70]
		]);
		expect(events[0]).toMatchObject({ minutes: 5, long: false });
		expect(events[2]).toMatchObject({ minutes: 15, long: true });
		// Every phase has its own key.
		expect(new Set(events.map((e) => e.key)).size).toBe(events.length);
	});

	test('without auto-start every phase end waits — and nothing is due while waiting', () => {
		const settings = { ...DEFAULT_POMODORO, autoStart: false };
		const run = startRun(settings);
		const ev = nextPushEvent(pomodoro(run, settings, T0))!;
		expect(ev).toMatchObject({ kind: 'breakWaiting', key: 'run-1:1:focus', at: T0 + 25 * MIN });
		const waiting = rolloverPomodoro(run, settings, ev.at).run;
		expect(waiting.phaseStartedAt).toBeNull();
		expect(nextPushEvent(pomodoro(waiting, settings, ev.at))).toBeNull();
		// The user starts the break → its end is announced as "start the next round".
		const brk = { ...waiting, phaseStartedAt: T0 + 40 * MIN };
		expect(nextPushEvent(pomodoro(brk, settings, T0 + 40 * MIN))).toMatchObject({
			kind: 'focusWaiting',
			key: 'run-1:1:short_break',
			at: T0 + 45 * MIN
		});
	});

	test('a paused focus round has no due time; resuming shifts it', () => {
		const run = startRun(DEFAULT_POMODORO);
		const paused = {
			...run,
			session: { ...run.session!, state: 'paused' as const, pausedAt: T0 + 5 * MIN }
		};
		expect(nextPushEvent(pomodoro(paused, DEFAULT_POMODORO, T0 + 6 * MIN))).toBeNull();
		const resumed = { ...run, session: { ...run.session!, pausedMs: 3 * MIN } };
		expect(nextPushEvent(pomodoro(resumed, DEFAULT_POMODORO, T0 + 8 * MIN))!.at).toBe(
			T0 + 28 * MIN
		);
	});
});

describe('lastPhaseEnd (what a rollover announces)', () => {
	const settings = { ...DEFAULT_POMODORO, longBreakEvery: 2 };
	const run = startRun(settings);

	test('nothing before the first end', () => {
		expect(lastPhaseEnd(run, 'run-1', 'task-1', settings, T0 + 25 * MIN - 1)).toBeNull();
	});
	test('exactly the event the scheduler predicted', () => {
		const predicted = phaseEndEvent(run, 'run-1', 'task-1', settings)!;
		expect(lastPhaseEnd(run, 'run-1', 'task-1', settings, predicted.at)).toEqual(predicted);
	});
	test('after a gap only the latest end (one notification, the current state)', () => {
		expect(lastPhaseEnd(run, 'run-1', 'task-1', settings, T0 + 31 * MIN)).toMatchObject({
			kind: 'focusStarted',
			key: 'run-1:1:short_break'
		});
		// Hours later the run waits after its long break.
		expect(lastPhaseEnd(run, 'run-1', 'task-1', settings, T0 + 5 * 60 * MIN)).toMatchObject({
			kind: 'focusWaiting',
			key: 'run-1:2:long_break'
		});
	});
});

describe('armDelay', () => {
	test('just after the due time; immediately when past; paced when a check is repeated', () => {
		expect(armDelay({ at: T0 + 5000 }, T0)).toBe(5020);
		expect(armDelay({ at: T0 - 9000 }, T0)).toBe(20);
		expect(armDelay({ at: T0 - 9000 }, T0, true)).toBe(1000);
	});
	test('clamped to the setTimeout maximum (re-armed in steps)', () => {
		expect(armDelay({ at: T0 + 40 * 24 * 60 * MIN }, T0)).toBe(MAX_TIMEOUT_MS);
	});
});

// ─── Texts ──────────────────────────────────────────────────────────────────

describe('timerPushText', () => {
	const en = i18n('en');
	const de = i18n('de');
	const ev = (kind: Parameters<typeof timerPushText>[0]['kind'], minutes = 5, long = false) => ({
		kind,
		minutes,
		long
	});
	test('English', () => {
		expect(timerPushText(ev('countdownDone', 25), 'Deep work', en)).toEqual({
			title: 'Time’s up',
			body: 'Deep work'
		});
		expect(timerPushText(ev('breakStarted'), 'x', en).title).toBe('Break time · 5 min');
		expect(timerPushText(ev('breakStarted', 15, true), 'x', en).title).toBe('Long break · 15 min');
		expect(timerPushText(ev('breakWaiting'), 'x', en).title).toBe('Round done — start your break');
		expect(timerPushText(ev('focusStarted'), 'x', en).title).toBe('Break over — back to focus');
		expect(timerPushText(ev('focusWaiting'), 'x', en).title).toBe(
			'Break over — start the next round'
		);
	});
	test('German', () => {
		expect(timerPushText(ev('countdownDone', 25), 'Tiefe Arbeit', de)).toEqual({
			title: 'Zeit ist um',
			body: 'Tiefe Arbeit'
		});
		expect(timerPushText(ev('breakStarted'), 'x', de).title).toBe('Pause · 5 Min.');
		expect(timerPushText(ev('focusWaiting'), 'x', de).title).toBe(
			'Pause vorbei – starte die nächste Runde'
		);
	});
});

// ─── Settings state ─────────────────────────────────────────────────────────

describe('notificationsState', () => {
	const iphone =
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
	const ipadDesktopUA =
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
	const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';
	const base: NotificationsEnv = {
		desktopApp: false,
		userAgent: chrome,
		touchPoints: 0,
		standalone: false,
		pushSupported: true,
		permission: 'default',
		subscribed: false
	};
	test('desktop app → hidden, before anything else', () => {
		expect(notificationsState({ ...base, desktopApp: true, subscribed: true })).toBe('hidden');
	});
	test('iPhone / iPad (desktop UA + touch) in a Safari tab → install first', () => {
		expect(notificationsState({ ...base, userAgent: iphone, pushSupported: false })).toBe(
			'install'
		);
		expect(notificationsState({ ...base, userAgent: ipadDesktopUA, touchPoints: 5 })).toBe(
			'install'
		);
		expect(notificationsState({ ...base, userAgent: ipadDesktopUA, touchPoints: 0 })).toBe('off'); // a Mac
		expect(notificationsState({ ...base, userAgent: iphone, standalone: true })).toBe('off');
	});
	test('unsupported, denied, off, on', () => {
		expect(notificationsState({ ...base, pushSupported: false })).toBe('unsupported');
		expect(notificationsState({ ...base, permission: 'denied', subscribed: true })).toBe('denied');
		expect(notificationsState({ ...base, permission: 'granted' })).toBe('off');
		expect(notificationsState({ ...base, subscribed: true })).toBe('off'); // permission reset
		expect(notificationsState({ ...base, permission: 'granted', subscribed: true })).toBe('on');
	});
});
