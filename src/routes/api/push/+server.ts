import { error, json } from '@sveltejs/kit';
import { i18n } from '#lib/i18n/index.ts';
import { parsePushSubscription } from '#lib/push.ts';
import {
	deleteDeviceSubscriptions,
	getDeviceSubscription,
	getVapidKeys,
	saveSubscription,
	testEndpointOrigin
} from '#lib/server/push.ts';
import type { RequestHandler } from './$types';

const noStore = { 'cache-control': 'no-store' };

/**
 * `{ ok, publicKey, subscription }`: the VAPID public key (the browser's
 * `applicationServerKey`, generated on first use) and whether this device has a subscription
 * (`endpoint` lets the client compare it with the browser's own).
 */
export const GET: RequestHandler = async ({ locals }) => {
	const [keys, sub] = await Promise.all([getVapidKeys(), getDeviceSubscription(locals.device!.id)]);
	return json(
		{
			ok: true,
			publicKey: keys.publicKey,
			subscription: sub
				? {
						endpoint: sub.endpoint,
						createdAt: sub.createdAt.getTime(),
						lastSuccessAt: sub.lastSuccessAt?.getTime() ?? null
					}
				: null
		},
		{ headers: noStore }
	);
};

/**
 * Subscribe this device: JSON `PushSubscription.toJSON()` (`{ endpoint, keys: { p256dh, auth } }`)
 * → `{ ok: true }`; replaces the device's previous subscription. 400 `{ ok: false, code, error }`
 * for an endpoint outside the push-service allowlist or malformed keys.
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	const t = i18n(locals.locale);
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, t.errors.invalidJson);
	}
	const parsed = parsePushSubscription(body, testEndpointOrigin());
	if (!parsed.ok)
		return json(
			{ ok: false, code: parsed.error, error: t.errors[parsed.error] },
			{ status: 400, headers: noStore }
		);
	await saveSubscription(locals.device!.id, parsed.value, locals.locale, url.origin);
	return json({ ok: true }, { headers: noStore });
};

/** Unsubscribe this device (JSON body, e.g. `{}`) → `{ ok: true, removed }`. */
export const DELETE: RequestHandler = async ({ locals }) => {
	const removed = await deleteDeviceSubscriptions(locals.device!.id);
	return json({ ok: true, removed }, { headers: noStore });
};
