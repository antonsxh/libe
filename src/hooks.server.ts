import { json, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { DEVICE_COOKIE, bearerToken, isApiPath, isPublicPath, pairRedirect } from '#lib/auth.ts';
import { clearDeviceCookie, setDeviceCookie } from '#lib/server/auth.ts';
import { authenticate, countActiveDevices } from '#lib/server/devices.ts';

/**
 * Device auth for every request. The device token comes from `Authorization: Bearer` (Tauri
 * bootstrap, API clients) or the `libe_device` cookie (browsers, PWAs, the Tauri webview).
 * Without a valid, non-revoked device only the public routes (pairing, health, PWA shell)
 * are reachable: pages redirect to `/pair?next=…` (`/setup` while nothing is paired), API
 * routes answer 401 JSON.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const { url, cookies, request } = event;
	const bearer = bearerToken(request.headers.get('authorization'));
	const cookieToken = cookies.get(DEVICE_COOKIE);
	const token = bearer ?? cookieToken ?? null;

	event.locals.device = null;
	if (token) {
		const auth = await authenticate(token, !bearer);
		if (auth) {
			event.locals.device = auth.device;
			if (auth.renewCookie) setDeviceCookie(cookies, url, token);
		} else if (!bearer && cookieToken) {
			// Revoked or unknown — drop the cookie so we stop looking it up.
			clearDeviceCookie(cookies, url);
		}
	}

	if (!event.locals.device && !isPublicPath(url.pathname)) {
		if (isApiPath(url.pathname)) {
			return json(
				{ ok: false, code: 'unauthorized', error: 'This device is not paired.' },
				{ status: 401, headers: { 'cache-control': 'no-store' } }
			);
		}
		const target = (await countActiveDevices()) > 0 ? '/pair' : '/setup';
		redirect(303, pairRedirect(target, url.pathname, url.search));
	}

	return resolve(event);
};
