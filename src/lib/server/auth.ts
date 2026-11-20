/**
 * Request-level auth helpers: the device cookie, rate limiters and the setup secret.
 */
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { LIBE_SETUP_SECRET } from '$app/env/private';
import { COOKIE_MAX_AGE_S, DEVICE_COOKIE, PAIR_RATE_LIMIT } from '#lib/auth.ts';
import { RateLimiter } from '#lib/rate-limit.ts';
import { secretsEqual } from './tokens.ts';
import { i18n, type Locale } from '#lib/i18n/index.ts';

/**
 * `Secure` follows the request protocol. Behind a TLS-terminating proxy the adapter derives
 * it from `ORIGIN=https://…` (or `PROTOCOL_HEADER=x-forwarded-proto`), see README.
 */
function cookieOptions(url: URL) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: url.protocol === 'https:'
	};
}

export function setDeviceCookie(cookies: Cookies, url: URL, token: string): void {
	cookies.set(DEVICE_COOKIE, token, { ...cookieOptions(url), maxAge: COOKIE_MAX_AGE_S });
}

export function clearDeviceCookie(cookies: Cookies, url: URL): void {
	cookies.delete(DEVICE_COOKIE, cookieOptions(url));
}

/**
 * One-time "this device is now paired" welcome: set by the `/setup` and `/pair` form
 * actions, consumed (read + deleted) by the root layout's `load` on the first authenticated
 * page — whatever `next` the pairing redirects to. Short-lived, so a pairing that never
 * reaches a page doesn't greet much later.
 */
const WELCOME_COOKIE = 'libe_welcome';

export function setWelcomeCookie(cookies: Cookies, url: URL): void {
	cookies.set(WELCOME_COOKIE, '1', { ...cookieOptions(url), maxAge: 120 });
}

/** True once after a pairing (the cookie is deleted right away). */
export function takeWelcomeCookie(cookies: Cookies, url: URL): boolean {
	if (cookies.get(WELCOME_COOKIE) === undefined) return false;
	cookies.delete(WELCOME_COOKIE, cookieOptions(url));
	return true;
}

/** Failed pairing-code attempts (`/pair` page + `POST /api/pair`), per client IP. */
export const pairLimiter = new RateLimiter(PAIR_RATE_LIMIT.limit, PAIR_RATE_LIMIT.windowMs);
/** Failed setup-secret attempts, per client IP. */
export const setupLimiter = new RateLimiter(PAIR_RATE_LIMIT.limit, PAIR_RATE_LIMIT.windowMs);

/**
 * Rate-limit key. Behind a reverse proxy set `ADDRESS_HEADER=X-Forwarded-For` (+ `XFF_DEPTH`)
 * so the adapter reports the real client; otherwise every client shares the proxy's address
 * (still safe, just stricter).
 */
export function clientKey(event: Pick<RequestEvent, 'getClientAddress'>): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

export function retryMessage(retryAfterMs: number, locale: Locale): string {
	const s = Math.max(1, Math.ceil(retryAfterMs / 1000));
	return i18n(locale).auth.tooManyAttempts(s);
}

export const setupSecretConfigured = (): boolean => !!LIBE_SETUP_SECRET;

export function checkSetupSecret(raw: unknown): boolean {
	return (
		!!LIBE_SETUP_SECRET && typeof raw === 'string' && secretsEqual(raw.trim(), LIBE_SETUP_SECRET)
	);
}
