/**
 * Web Push (Mobile polish, phase 3) — the server side end to end against a local fake push
 * service (headless Chromium has no real one): subscriptions via the API, the phase-end
 * scheduler (countdown → "Time's up" exactly once, a pomodoro rollover → "Break time"),
 * RFC 8291 payloads that decrypt with the subscription's key, VAPID headers, expired
 * subscriptions (410), revocation, and the endpoint allowlist.
 */
import type { APIRequestContext } from '@playwright/test';
import { test, expect, discardTimer, timerCmd } from '../support/fixtures.ts';
import { createTask, today, uid, type Sql } from '../support/db.ts';
import { BASE, FAKE_PUSH_ORIGIN } from '../support/env.ts';
import { bearer, freshIp, pairWithSecret } from '../support/auth.ts';
import { FakePushService, type PushRequest } from '../support/fake-push.ts';
import {
	decryptPush,
	subscriptionKeys,
	verifyVapid,
	type SubscriptionKeys
} from '../support/web-push.ts';

const push = new FakePushService();
test.beforeAll(() => push.start());
test.afterAll(() => push.stop());

test.beforeEach(async ({ api, sql }) => {
	await discardTimer(api);
	await sql`delete from push_subscriptions`;
});
test.afterEach(async ({ api, sql }) => {
	await discardTimer(api);
	await sql`delete from push_subscriptions`;
	await sql`delete from settings`; // default pomodoro settings
});

async function subscribe(api: APIRequestContext, endpoint: string, keys: SubscriptionKeys) {
	const res = await api.post('/api/push', {
		data: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
	});
	expect(res.status()).toBe(200);
}

async function payloadOf(req: PushRequest, keys: SubscriptionKeys) {
	return JSON.parse(await decryptPush(req.body, keys)) as {
		title: string;
		body: string;
		tag: string;
		url: string;
		badge: number | null;
	};
}

const openToday = async (sql: Sql) =>
	Number(
		(
			await sql`select count(*)::int as n from tasks where day = ${await today(sql)} and done_at is null`
		)[0].n
	);

test('a countdown that reaches its target pushes "Time’s up" once — encrypted, VAPID-signed', async ({
	api,
	sql
}) => {
	const task = await createTask(sql, { title: `Push countdown ${uid()}`, day: await today(sql) });
	const keys = await subscriptionKeys();
	const endpoint = push.endpoint();
	await subscribe(api, endpoint, keys);

	expect((await timerCmd(api, { action: 'start', taskId: task.id, plannedMin: 1 })).status).toBe(
		200
	);
	// Two minutes ago → one minute into overtime; pause/resume re-arms the scheduler.
	await sql`update sessions set started_at = started_at - interval '2 minutes' where state = 'running'`;
	await timerCmd(api, { action: 'pause' });
	await timerCmd(api, { action: 'resume' });
	await expect.poll(() => push.to(endpoint).length).toBe(1);

	const [req] = push.to(endpoint);
	expect(req.method).toBe('POST');
	expect(req.headers).toMatchObject({
		'content-encoding': 'aes128gcm',
		ttl: '300',
		urgency: 'high',
		topic: 'libe-timer'
	});
	const { claims, publicKey } = await verifyVapid(req.headers.authorization);
	expect(claims.aud).toBe(FAKE_PUSH_ORIGIN);
	expect(claims.sub).toBe(BASE);
	expect(claims.exp * 1000).toBeGreaterThan(Date.now());
	expect(publicKey).toBe((await (await api.get('/api/push')).json()).publicKey);
	expect(await payloadOf(req, keys)).toEqual({
		title: 'Time’s up',
		body: task.title,
		tag: 'libe-timer',
		url: '/focus',
		badge: await openToday(sql)
	});
	await expect
		.poll(
			async () => (await sql`select last_success_at from push_subscriptions`)[0]?.last_success_at
		)
		.not.toBeNull();

	// Recomputing (still in overtime) must not send it again. The test notification acts as a
	// barrier: once it arrived, a duplicate queued by the recompute would have arrived too.
	await timerCmd(api, { action: 'pause' });
	await timerCmd(api, { action: 'resume' });
	expect((await api.post('/api/push/test', { data: {} })).status()).toBe(200);
	await expect.poll(() => push.to(endpoint).length).toBe(2);
	const titles = await Promise.all(
		push.to(endpoint).map(async (r) => (await payloadOf(r, keys)).title)
	);
	expect(titles).toEqual(['Time’s up', 'Notifications are on']);
});

test('a pomodoro focus round that ends rolls over and pushes "Break time"', async ({
	api,
	sql
}) => {
	const task = await createTask(sql, { title: `Push pomodoro ${uid()}`, day: await today(sql) });
	const keys = await subscriptionKeys();
	const endpoint = push.endpoint();
	await subscribe(api, endpoint, keys);
	await timerCmd(api, { action: 'start', taskId: task.id, mode: 'pomodoro' });

	// The 25-min round ended a minute ago; any read rolls the run over (here: a client's GET).
	await sql`update pomodoro_runs set phase_started_at = phase_started_at - interval '26 minutes' where ended_at is null`;
	await sql`update sessions set started_at = started_at - interval '26 minutes' where state = 'running'`;
	await api.get('/api/timer');
	await expect.poll(() => push.to(endpoint).length).toBe(1);
	expect(await payloadOf(push.to(endpoint)[0], keys)).toMatchObject({
		title: 'Break time · 5 min',
		body: task.title,
		url: '/focus'
	});
	const [run] = await sql`select phase from pomodoro_runs where ended_at is null`;
	expect(run.phase).toBe('short_break');
});

test('a push service answering 410 Gone removes the subscription', async ({ api, sql }) => {
	const keys = await subscriptionKeys();
	const endpoint = push.endpoint(410);
	await subscribe(api, endpoint, keys);
	expect(await sql`select 1 from push_subscriptions where endpoint = ${endpoint}`).toHaveLength(1);

	const res = await api.post('/api/push/test', { data: {} });
	expect(res.status()).toBe(502);
	expect(await res.json()).toMatchObject({ ok: false, gone: true });
	expect(push.to(endpoint)).toHaveLength(1);
	expect(await sql`select 1 from push_subscriptions where endpoint = ${endpoint}`).toHaveLength(0);
	expect((await (await api.get('/api/push')).json()).subscription).toBeNull();
});

test('revoking a device deletes its push subscription', async ({ sql }) => {
	const token = await pairWithSecret(BASE, { name: `Push phone ${uid()}`, ip: freshIp() });
	const keys = await subscriptionKeys();
	const endpoint = push.endpoint();
	const call = (method: string, path: string, body: unknown) =>
		fetch(`${BASE}${path}`, {
			method,
			headers: { ...bearer(token), 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
	expect((await call('POST', '/api/push', { endpoint, keys })).status).toBe(200);
	const [row] = await sql`select device_id from push_subscriptions where endpoint = ${endpoint}`;
	expect(row).toBeDefined();

	expect((await call('DELETE', '/api/pair/session', {})).status).toBe(200);
	expect(
		await sql`select revoked_at from devices where id = ${row.device_id} and revoked_at is not null`
	).toHaveLength(1);
	expect(
		await sql`select 1 from push_subscriptions where device_id = ${row.device_id}`
	).toHaveLength(0);
});

test('only known push services: other endpoints are refused', async ({ api, sql }) => {
	const keys = await subscriptionKeys();
	for (const endpoint of [
		'https://example.com/push',
		'http://10.0.0.1/push',
		'http://127.0.0.1:3124/api/timer', // the app itself
		'https://web.push.apple.com.example.com/x'
	]) {
		const res = await api.post('/api/push', {
			data: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
		});
		expect(res.status(), endpoint).toBe(400);
		expect((await res.json()).code).toBe('pushEndpointInvalid');
	}
	const bad = await api.post('/api/push', {
		data: { endpoint: push.endpoint(), keys: { p256dh: keys.p256dh, auth: 'AAAA' } }
	});
	expect((await bad.json()).code).toBe('pushKeysInvalid');
	expect(await sql`select 1 from push_subscriptions`).toHaveLength(0);
});
