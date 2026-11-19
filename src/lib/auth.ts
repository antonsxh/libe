/**
 * Device auth — pure rules shared by the server hook, the pairing pages and tests.
 *
 * Every client is a paired *device*: it holds a random token (cookie `libe_device` for
 * browsers/PWAs, `Authorization: Bearer` for the Tauri shell and API clients) and the server
 * stores only its SHA-256. New devices are paired with the setup secret (`/setup`) or a
 * short-lived 6-digit code generated on an already paired device (`/pair`).
 */

import type { ErrorCode, I18n } from '#lib/i18n/index.ts';

export const DEVICE_COOKIE = 'libe_device';
/** Cookie lifetime (browsers cap `Max-Age` at 400 days). */
export const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
/** Sliding expiry: re-issue the cookie at most once a day. */
export const COOKIE_RENEW_MS = 24 * 60 * 60 * 1000;
/** `devices.last_seen_at` is written at most once per minute per device. */
export const LAST_SEEN_THROTTLE_MS = 60 * 1000;

export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
export const PAIRING_CODE_DIGITS = 6;
/** Wrong guesses after which a code is invalidated. */
export const PAIRING_MAX_ATTEMPTS = 5;
/** Failed pairing/setup attempts per client IP and window. */
export const PAIR_RATE_LIMIT = { limit: 10, windowMs: 60 * 1000 } as const;

export const DEVICE_NAME_MAX = 60;
/** Minimum length of `LIBE_SETUP_SECRET`. */
export const SETUP_SECRET_MIN = 12;

export const DEVICE_KINDS = ['browser', 'pwa', 'tauri'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/** What `event.locals.device` holds for an authenticated request. */
export interface AuthDevice {
	id: string;
	name: string;
	kind: DeviceKind;
}

export function parseDeviceKind(raw: unknown, fallback: DeviceKind = 'browser'): DeviceKind {
	return typeof raw === 'string' && (DEVICE_KINDS as readonly string[]).includes(raw)
		? (raw as DeviceKind)
		: fallback;
}

// ─── Tokens ─────────────────────────────────────────────────────────────────

/** A device token is 32 random bytes in base64url (43 chars, no padding). */
export function isTokenFormat(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** Token from an `Authorization: Bearer <token>` header, if well-formed. */
export function bearerToken(header: string | null | undefined): string | null {
	const m = header?.match(/^Bearer\s+(\S+)\s*$/i);
	return m && isTokenFormat(m[1]) ? m[1] : null;
}

// ─── Pairing codes ──────────────────────────────────────────────────────────

/** "482 913", "482-913", " 482913 " → "482913"; anything else → null. */
export function normalizeCode(raw: unknown): string | null {
	if (typeof raw !== 'string') return null;
	const digits = raw.replace(/[\s-]/g, '');
	return new RegExp(`^\\d{${PAIRING_CODE_DIGITS}}$`).test(digits) ? digits : null;
}

/** "482913" → "482 913" (display form). */
export function formatCode(code: string): string {
	return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

export type CodeStatus = 'active' | 'used' | 'expired' | 'locked';

export interface CodeState {
	expiresAt: Date;
	usedAt: Date | null;
	attempts: number;
}

/** Whether a stored pairing code can still be redeemed at `now`. */
export function codeStatus(code: CodeState, now: Date): CodeStatus {
	if (code.usedAt) return 'used';
	if (code.attempts >= PAIRING_MAX_ATTEMPTS) return 'locked';
	if (code.expiresAt.getTime() <= now.getTime()) return 'expired';
	return 'active';
}

// ─── Routing ────────────────────────────────────────────────────────────────

const PUBLIC_EXACT = new Set([
	'/pair',
	'/setup',
	'/offline',
	'/api/pair',
	'/api/health',
	'/manifest.webmanifest',
	'/service-worker.js',
	'/robots.txt',
	'/favicon.ico',
	'/favicon.svg',
	'/favicon-32.png',
	'/apple-touch-icon.png',
	'/apple-touch-icon-precomposed.png',
	'/_app/version.json',
	'/_app/env.js'
]);

// Only the hashed build assets are public under `/_app/` — never `/_app/remote/…` (remote
// functions) or anything Kit may add there later.
const PUBLIC_PREFIXES = ['/pair/', '/api/pair/', '/_app/immutable/', '/icons/'];

/** Routes reachable without a paired device (pairing, health, PWA shell assets). */
export function isPublicPath(pathname: string): boolean {
	const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	return PUBLIC_EXACT.has(path) || PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

/**
 * Whether a request may skip device auth. `pathname` is `event.url.pathname`, `rawPathname`
 * the pathname of the URL actually requested. They differ for Kit's internal requests: for
 * remote-function calls (`/_app/remote/…`) Kit rewrites `event.url` from the client-supplied
 * `x-sveltekit-pathname` header, so the rewritten path alone must never grant access.
 */
export function isPublicRequest(pathname: string, rawPathname: string): boolean {
	if (isRemoteCall(rawPathname)) return false;
	return isPublicPath(pathname);
}

/** Remote-function endpoint (always behind device auth; answers 401 JSON). */
export function isRemoteCall(rawPathname: string): boolean {
	return rawPathname.startsWith('/_app/remote/');
}

/** API paths answer 401 JSON instead of redirecting to the pairing page. */
export function isApiPath(pathname: string): boolean {
	return pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * Where to go after pairing: a local path from `?next=`, never back to the pairing pages
 * (loop) and never another origin (`//evil.example`, `/\\evil`).
 */
export function safeNext(raw: unknown): string {
	if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) return '/';
	if (/[\\\u0000-\u001f]/.test(raw)) return '/';
	const path = raw.split(/[?#]/)[0];
	if (path === '/pair' || path.startsWith('/pair/') || path === '/setup' || path === '/offline')
		return '/';
	if (isApiPath(path)) return '/';
	return raw;
}

/** `/pair?next=…` (or `/setup?next=…`) for a request to `pathname + search`. */
export function pairRedirect(target: '/pair' | '/setup', pathname: string, search = ''): string {
	const next = safeNext(pathname + search);
	return next === '/' ? target : `${target}?next=${encodeURIComponent(next)}`;
}

// ─── Device names ───────────────────────────────────────────────────────────

export const DEVICE_MODELS = [
	'iphone',
	'ipad',
	'androidPhone',
	'androidTablet',
	'chromebook',
	'mac',
	'windows',
	'linux',
	'browser'
] as const;
export type DeviceModel = (typeof DEVICE_MODELS)[number];

/** English default device names (`Messages['deviceNames']` translates them). */
export const DEVICE_MODEL_NAMES: Record<DeviceModel, string> = {
	iphone: 'iPhone',
	ipad: 'iPad',
	androidPhone: 'Android phone',
	androidTablet: 'Android tablet',
	chromebook: 'Chromebook',
	mac: 'Mac',
	windows: 'Windows PC',
	linux: 'Linux PC',
	browser: 'Browser'
};

/**
 * The kind of device behind a user agent. iPadOS Safari reports a Mac user agent; pass
 * `touch: true` (client: `maxTouchPoints > 1`) to tell it apart.
 */
export function deviceModelFromUA(
	ua: string | null | undefined,
	opts: { touch?: boolean } = {}
): DeviceModel {
	const s = ua ?? '';
	if (/iPhone|iPod/.test(s)) return 'iphone';
	if (/iPad/.test(s)) return 'ipad';
	if (/Android/.test(s)) return /Mobile/.test(s) ? 'androidPhone' : 'androidTablet';
	if (/CrOS/.test(s)) return 'chromebook';
	if (/Macintosh|Mac OS X/.test(s)) return opts.touch ? 'ipad' : 'mac';
	if (/Windows/.test(s)) return 'windows';
	if (/Linux|X11/.test(s)) return 'linux';
	return 'browser';
}

/**
 * Friendly default name from a user agent: "iPhone", "iPad", "Mac", "Windows PC", …
 * (`names` = the translated names, `t.deviceNames`; English by default).
 */
export function deviceNameFromUA(
	ua: string | null | undefined,
	opts: { touch?: boolean; names?: Record<DeviceModel, string> } = {}
) {
	return (opts.names ?? DEVICE_MODEL_NAMES)[deviceModelFromUA(ua, opts)];
}

export type NameResult = { ok: true; value: string } | { ok: false; error: ErrorCode };

/** Trimmed, single-spaced, 1–60 characters. */
export function parseDeviceName(raw: unknown): NameResult {
	const value = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
	if (!value) return { ok: false, error: 'deviceNameRequired' };
	if ([...value].length > DEVICE_NAME_MAX) return { ok: false, error: 'deviceNameTooLong' };
	return { ok: true, value };
}

/** "just now", "3 min ago", "2 h ago", "yesterday", "5 days ago", then a date (in `t`'s language). */
export function formatAgo(then: Date, now: Date, t: I18n): string {
	const s = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
	if (s < 60) return t.ago.justNow;
	const min = Math.floor(s / 60);
	if (min < 60) return t.ago.minutes(min);
	const h = Math.floor(min / 60);
	if (h < 24) return t.ago.hours(h);
	const d = Math.floor(h / 24);
	if (d === 1) return t.ago.yesterday;
	if (d < 30) return t.ago.days(d);
	return then.toLocaleDateString(t.intl, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Request bookkeeping ────────────────────────────────────────────────────

export interface TouchState {
	lastSeenAt: Date | null;
	cookieRenewedAt: Date | null;
}

/**
 * What an authenticated request should write back: `seen` → update `last_seen_at`
 * (≤ 1/min), `renew` → re-issue the cookie (sliding expiry, ≤ 1/day; only for cookie auth).
 */
export function touchPlan(
	state: TouchState,
	now: Date,
	viaCookie: boolean
): { seen: boolean; renew: boolean } {
	const t = now.getTime();
	const renew =
		viaCookie && (!state.cookieRenewedAt || t - state.cookieRenewedAt.getTime() >= COOKIE_RENEW_MS);
	const seen =
		renew || !state.lastSeenAt || t - state.lastSeenAt.getTime() >= LAST_SEEN_THROTTLE_MS;
	return { seen, renew };
}
