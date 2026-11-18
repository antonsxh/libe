/**
 * Request-level auth helpers: the device cookie, rate limiters and the setup secret.
 */
import type { Cookies, RequestEvent } from '@sveltejs/kit';
import { LIBE_SETUP_SECRET } from '$app/env/private';
import { COOKIE_MAX_AGE_S, DEVICE_COOKIE, PAIR_RATE_LIMIT } from '#lib/auth.ts';
import { RateLimiter } from '#lib/rate-limit.ts';
import { secretsEqual } from './tokens.ts';

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

export function retryMessage(retryAfterMs: number): string {
	const s = Math.max(1, Math.ceil(retryAfterMs / 1000));
	return `Too many attempts. Try again in ${s} s.`;
}

export const setupSecretConfigured = (): boolean => !!LIBE_SETUP_SECRET;

export function checkSetupSecret(raw: unknown): boolean {
	return (
		!!LIBE_SETUP_SECRET && typeof raw === 'string' && secretsEqual(raw.trim(), LIBE_SETUP_SECRET)
	);
}
