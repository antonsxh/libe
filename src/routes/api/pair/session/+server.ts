import { json } from '@sveltejs/kit';
import { bearerToken } from '#lib/auth.ts';
import { clearDeviceCookie, setDeviceCookie } from '#lib/server/auth.ts';
import { revokeDevice } from '#lib/server/devices.ts';
import { i18n, type Locale } from '#lib/i18n/index.ts';
import type { RequestHandler } from './$types';

const unauthorized = (locale: Locale) =>
	json(
		{ ok: false, code: 'unauthorized', error: i18n(locale).errors.notPaired },
		{ status: 401, headers: { 'cache-control': 'no-store' } }
	);

/** Who am I? `{ ok, device }` for a valid Bearer token or cookie, else 401 (Tauri start-up check). */
export const GET: RequestHandler = ({ locals }) =>
	locals.device
		? json({ ok: true, device: locals.device }, { headers: { 'cache-control': 'no-store' } })
		: unauthorized(locals.locale);

/**
 * Exchange a Bearer token for the `libe_device` cookie. Used by `/pair/session` (the Tauri
 * shell's webview opens it with the token in the URL fragment) — same-origin `fetch`, so the
 * cookie lands in the webview's own cookie store.
 */
export const POST: RequestHandler = ({ locals, request, cookies, url }) => {
	const token = bearerToken(request.headers.get('authorization'));
	if (!locals.device || !token) return unauthorized(locals.locale);
	setDeviceCookie(cookies, url, token);
	return json({ ok: true, device: locals.device });
};

/** Sign this device out: revoke it and drop the cookie. */
export const DELETE: RequestHandler = async ({ locals, cookies, url }) => {
	if (!locals.device) return unauthorized(locals.locale);
	await revokeDevice(locals.device.id);
	clearDeviceCookie(cookies, url);
	return json({ ok: true });
};
