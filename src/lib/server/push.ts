/**
 * Web Push — keys, subscriptions and sending (server only). Pure rules (allowlist, body
 * validation, events, texts) live in `#lib/push.ts`, the crypto in `push-crypto.ts`, the timer
 * scheduler in `push-scheduler.ts`.
 *
 * - VAPID keys are generated on first use and stored in `push_config` (no setup, no env var).
 * - Sending never throws: a 404/410 from the push service deletes the subscription, other
 *   failures are recorded (`last_failure_at` / `_status`) and logged once — no retries.
 */
import { and, count, eq, isNull, ne, or, sql } from 'drizzle-orm';
import { LIBE_PUSH_TEST_ENDPOINT_ORIGIN } from '$app/env/private';
import { db } from '#lib/server/db/index.ts';
import {
	pushConfig,
	pushSubscriptions,
	tasks,
	type PushSubscriptionRow
} from '#lib/server/db/schema.ts';
import { getLanguageSetting } from '#lib/server/settings.ts';
import { todayISO } from '#lib/dates.ts';
import { i18n, isLocale, type Locale } from '#lib/i18n/index.ts';
import {
	TEST_TAG,
	TIMER_TAG,
	TIMER_TTL_S,
	isAllowedPushEndpoint,
	timerPushText,
	type PushEvent,
	type PushPayload,
	type PushSubscriptionInput
} from '#lib/push.ts';
import {
	encryptPayload,
	generateVapidKeys,
	vapidAuthorization,
	type KeyPair
} from '#lib/server/push-crypto.ts';

/** The e2e fake push endpoint's origin (unset in production). */
export const testEndpointOrigin = (): string | null => LIBE_PUSH_TEST_ENDPOINT_ORIGIN ?? null;

// ─── Keys ───────────────────────────────────────────────────────────────────

let keysCache: KeyPair | null = null;

/** The VAPID key pair — created (race-safe) on first use. */
export async function getVapidKeys(): Promise<KeyPair> {
	if (keysCache) return keysCache;
	let [row] = await db
		.select({ publicKey: pushConfig.vapidPublicKey, privateKey: pushConfig.vapidPrivateKey })
		.from(pushConfig)
		.where(eq(pushConfig.id, 1));
	if (!row) {
		const fresh = await generateVapidKeys();
		await db
			.insert(pushConfig)
			.values({ id: 1, vapidPublicKey: fresh.publicKey, vapidPrivateKey: fresh.privateKey })
			.onConflictDoNothing();
		[row] = await db
			.select({ publicKey: pushConfig.vapidPublicKey, privateKey: pushConfig.vapidPrivateKey })
			.from(pushConfig)
			.where(eq(pushConfig.id, 1));
	}
	keysCache = row;
	return row;
}

/** Fallback VAPID contact while no subscribe request has told us the app's origin. */
const FALLBACK_SUBJECT = 'mailto:libe@localhost';

async function vapidSubject(): Promise<string> {
	const [row] = await db
		.select({ subject: pushConfig.subject })
		.from(pushConfig)
		.where(eq(pushConfig.id, 1));
	return row?.subject ?? FALLBACK_SUBJECT;
}

/**
 * Remember the app's origin as the VAPID `sub` contact. Called by the subscribe endpoint with
 * `url.origin` — adapter-node derives it from `ORIGIN` (or `Host` + `PROTOCOL_HEADER`), so it
 * is the https URL the device actually uses. Apple accepts an https subject.
 */
async function rememberSubject(origin: string): Promise<void> {
	await db
		.update(pushConfig)
		.set({ subject: origin })
		.where(
			and(eq(pushConfig.id, 1), or(isNull(pushConfig.subject), ne(pushConfig.subject, origin)))
		);
}

// ─── Subscriptions ──────────────────────────────────────────────────────────

/** This device's subscription (at most one). */
export async function getDeviceSubscription(deviceId: string): Promise<PushSubscriptionRow | null> {
	const [row] = await db
		.select()
		.from(pushSubscriptions)
		.where(eq(pushSubscriptions.deviceId, deviceId));
	return row ?? null;
}

/**
 * Store a device's subscription (already validated: `parsePushSubscription`). Replaces the
 * device's previous one and takes over an endpoint another device row still held (the same
 * browser re-paired).
 */
export async function saveSubscription(
	deviceId: string,
	input: PushSubscriptionInput,
	locale: Locale,
	origin: string
): Promise<void> {
	await getVapidKeys();
	await db.transaction(async (tx) => {
		await tx
			.delete(pushSubscriptions)
			.where(
				or(eq(pushSubscriptions.deviceId, deviceId), eq(pushSubscriptions.endpoint, input.endpoint))
			);
		await tx.insert(pushSubscriptions).values({ deviceId, ...input, locale });
	});
	if (origin.startsWith('https://')) await rememberSubject(origin);
	else if ((await vapidSubject()) === FALLBACK_SUBJECT) await rememberSubject(origin);
}

export async function deleteDeviceSubscriptions(deviceId: string): Promise<number> {
	const rows = await db
		.delete(pushSubscriptions)
		.where(eq(pushSubscriptions.deviceId, deviceId))
		.returning({ id: pushSubscriptions.id });
	return rows.length;
}

export async function hasSubscriptions(): Promise<boolean> {
	const [row] = await db.select({ n: count() }).from(pushSubscriptions);
	return (row?.n ?? 0) > 0;
}

// ─── Badge ──────────────────────────────────────────────────────────────────

/** Today's open tasks (quest + other, scheduled for today, not done) — the app icon badge. */
export async function openTodayCount(): Promise<number> {
	const [row] = await db
		.select({ n: count() })
		.from(tasks)
		.where(and(eq(tasks.day, todayISO()), isNull(tasks.doneAt)));
	return row?.n ?? 0;
}

// ─── Sending ────────────────────────────────────────────────────────────────

export type SendOutcome = 'sent' | 'gone' | 'failed';

/** Give up on a push service after this long (never blocks a timer request — see the scheduler). */
const SEND_TIMEOUT_MS = 10_000;

/**
 * Encrypt and POST one message to one subscription. Never throws. 404/410 → the subscription
 * is deleted ("gone"); other errors → `last_failure_*` recorded ("failed").
 */
export async function sendToSubscription(
	sub: PushSubscriptionRow,
	payload: PushPayload,
	opts: { ttl: number; topic?: string; urgency?: 'high' | 'normal' }
): Promise<SendOutcome> {
	const host = safeHost(sub.endpoint);
	// Defence in depth: the endpoint was checked on the way in; check again before any request.
	if (!isAllowedPushEndpoint(sub.endpoint, testEndpointOrigin())) {
		console.warn(`[libe] push: endpoint not allowed any more (${host}) — subscription removed`);
		await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
		return 'gone';
	}
	let status = 0;
	try {
		const keys = await getVapidKeys();
		const body = await encryptPayload(
			new TextEncoder().encode(JSON.stringify(payload)),
			sub.p256dh,
			sub.auth
		);
		const headers: Record<string, string> = {
			authorization: await vapidAuthorization(sub.endpoint, keys, await vapidSubject()),
			'content-encoding': 'aes128gcm',
			'content-type': 'application/octet-stream',
			ttl: String(opts.ttl),
			urgency: opts.urgency ?? 'high'
		};
		if (opts.topic) headers.topic = opts.topic;
		const res = await fetch(sub.endpoint, {
			method: 'POST',
			headers,
			body,
			redirect: 'manual',
			signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
		});
		status = res.status;
		await res.body?.cancel().catch(() => {});
		if (res.ok) {
			await db
				.update(pushSubscriptions)
				.set({ lastSuccessAt: new Date() })
				.where(eq(pushSubscriptions.id, sub.id));
			return 'sent';
		}
		if (status === 404 || status === 410) {
			await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
			console.info(`[libe] push: subscription expired (${status} from ${host}) — removed`);
			return 'gone';
		}
		console.warn(`[libe] push: ${host} answered ${status}`);
	} catch (err) {
		console.warn(`[libe] push: sending to ${host} failed:`, (err as Error)?.message ?? err);
	}
	await db
		.update(pushSubscriptions)
		.set({ lastFailureAt: new Date(), lastFailureStatus: status })
		.where(eq(pushSubscriptions.id, sub.id))
		.catch(() => {});
	return 'failed';
}

function safeHost(endpoint: string): string {
	try {
		return new URL(endpoint).host;
	} catch {
		return '?';
	}
}

/** Notification language: the fixed UI language, else the device's at subscribe time. */
function localeFor(sub: PushSubscriptionRow, language: string): Locale {
	if (isLocale(language)) return language;
	return isLocale(sub.locale) ? sub.locale : 'en';
}

/** The test notification from Settings → Notifications, to this device only. */
export async function sendTestPush(deviceId: string): Promise<SendOutcome | 'none'> {
	const sub = await getDeviceSubscription(deviceId);
	if (!sub) return 'none';
	const [language, badge] = await Promise.all([getLanguageSetting(), openTodayCount()]);
	const t = i18n(localeFor(sub, language));
	return sendToSubscription(
		sub,
		{ title: t.push.testTitle, body: t.push.testBody, tag: TEST_TAG, url: '/settings', badge },
		{ ttl: 60, urgency: 'high' }
	);
}

/**
 * Claim a timer event: true exactly once per key (atomic compare-and-set on
 * `push_config.last_event_key`, so recomputes, races and restarts never send it twice).
 */
export async function claimEvent(key: string): Promise<boolean> {
	await getVapidKeys(); // the row exists from here on
	const rows = await db
		.update(pushConfig)
		.set({ lastEventKey: key, lastEventAt: new Date() })
		.where(and(eq(pushConfig.id, 1), sql`${pushConfig.lastEventKey} is distinct from ${key}`))
		.returning({ id: pushConfig.id });
	return rows.length > 0;
}

/** Send a timer event to every subscribed device (each in its language). Never throws. */
export async function sendTimerPush(event: PushEvent): Promise<SendOutcome[]> {
	const subs = await db.select().from(pushSubscriptions);
	if (subs.length === 0) return [];
	const [language, badge, task] = await Promise.all([
		getLanguageSetting(),
		openTodayCount(),
		db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, event.taskId))
	]);
	const title = task[0]?.title ?? 'libe';
	return Promise.all(
		subs.map((sub) => {
			const text = timerPushText(event, title, i18n(localeFor(sub, language)));
			return sendToSubscription(
				sub,
				{ ...text, tag: TIMER_TAG, url: '/focus', badge },
				{ ttl: TIMER_TTL_S, topic: TIMER_TAG, urgency: 'high' }
			);
		})
	);
}
