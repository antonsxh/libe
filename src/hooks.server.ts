import { json, redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import {
	DEVICE_COOKIE,
	bearerToken,
	isApiPath,
	isPublicRequest,
	isRemoteCall,
	pairRedirect
} from '#lib/auth.ts';
import { clearDeviceCookie, setDeviceCookie } from '#lib/server/auth.ts';
import { authenticate, countActiveDevices } from '#lib/server/devices.ts';
import { getLanguageSetting } from '#lib/server/settings.ts';
import { i18n, negotiateLocale, resolveLocale } from '#lib/i18n/index.ts';

/**
 * Device auth for every request. The device token comes from `Authorization: Bearer` (Tauri
 * bootstrap, API clients) or the `libe_device` cookie (browsers, PWAs, the Tauri webview).
 * Without a valid, non-revoked device only the public routes (pairing, health, PWA shell)
 * are reachable: pages redirect to `/pair?next=…` (`/setup` while nothing is paired), API
 * routes answer 401 JSON.
 *
 * UI language (`locals.locale`, `<html lang>`): a paired device gets the `settings.language`
 * choice (`auto` → `Accept-Language`); requests without a device (pairing pages, public
 * assets) negotiate from `Accept-Language` only.
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

	const acceptLanguage = request.headers.get('accept-language');
	event.locals.locale = event.locals.device
		? resolveLocale(await getLanguageSetting(), acceptLanguage)
		: negotiateLocale(acceptLanguage);

	const rawPathname = new URL(request.url).pathname;
	if (!event.locals.device && !isPublicRequest(url.pathname, rawPathname)) {
		if (isApiPath(url.pathname) || isRemoteCall(rawPathname)) {
			return json(
				{ ok: false, code: 'unauthorized', error: i18n(event.locals.locale).errors.notPaired },
				{ status: 401, headers: { 'cache-control': 'no-store' } }
			);
		}
		const target = (await countActiveDevices()) > 0 ? '/pair' : '/setup';
		redirect(303, pairRedirect(target, url.pathname, url.search));
	}

	const lang = event.locals.locale;
	return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', lang) });
};
