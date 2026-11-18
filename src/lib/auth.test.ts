import { describe, expect, test } from 'bun:test';
import {
	PAIRING_MAX_ATTEMPTS,
	bearerToken,
	codeStatus,
	deviceNameFromUA,
	formatAgo,
	formatCode,
	isApiPath,
	isPublicPath,
	isTokenFormat,
	normalizeCode,
	pairRedirect,
	parseDeviceKind,
	parseDeviceName,
	safeNext,
	touchPlan
} from './auth.ts';
import { RateLimiter } from './rate-limit.ts';
import { generatePairingCode, generateToken, secretsEqual, sha256Hex } from './server/tokens.ts';

const UA = {
	iphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
	ipadOld:
		'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
	ipadDesktop:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
	android:
		'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
	androidTab:
		'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
	windows:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
	linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
	cros: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
};

describe('tokens', () => {
	test('generateToken: 32 random bytes as base64url', () => {
		const a = generateToken();
		const b = generateToken();
		expect(isTokenFormat(a)).toBe(true);
		expect(a).not.toBe(b);
		expect(Buffer.from(a, 'base64url').length).toBe(32);
	});

	test('isTokenFormat rejects other shapes', () => {
		expect(isTokenFormat('x'.repeat(42))).toBe(false);
		expect(isTokenFormat('x'.repeat(44))).toBe(false);
		expect(isTokenFormat('a'.repeat(42) + '=')).toBe(false);
		expect(isTokenFormat('a'.repeat(42) + '+')).toBe(false);
		expect(isTokenFormat(null)).toBe(false);
	});

	test('sha256Hex is the stored hash (stable, hex, 64 chars)', () => {
		expect(sha256Hex('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
		expect(sha256Hex(generateToken())).toMatch(/^[0-9a-f]{64}$/);
	});

	test('bearerToken parses the Authorization header', () => {
		const t = generateToken();
		expect(bearerToken(`Bearer ${t}`)).toBe(t);
		expect(bearerToken(`bearer   ${t}`)).toBe(t);
		expect(bearerToken(`Basic ${t}`)).toBeNull();
		expect(bearerToken('Bearer nope')).toBeNull();
		expect(bearerToken(null)).toBeNull();
	});

	test('secretsEqual compares exactly', () => {
		expect(secretsEqual('dev-setup-secret', 'dev-setup-secret')).toBe(true);
		expect(secretsEqual('dev-setup-secret', 'dev-setup-secreT')).toBe(false);
		expect(secretsEqual('dev-setup-secret', 'dev-setup-secret ')).toBe(false);
		expect(secretsEqual('', 'x')).toBe(false);
	});
});

describe('pairing codes', () => {
	test('generatePairingCode: 6 digits incl. leading zeros', () => {
		for (let i = 0; i < 200; i++) expect(generatePairingCode()).toMatch(/^\d{6}$/);
	});

	test('normalizeCode accepts spaced / dashed input', () => {
		expect(normalizeCode('482913')).toBe('482913');
		expect(normalizeCode('482 913')).toBe('482913');
		expect(normalizeCode(' 482-913 ')).toBe('482913');
		expect(normalizeCode('048 213')).toBe('048213');
		expect(normalizeCode('48291')).toBeNull();
		expect(normalizeCode('4829134')).toBeNull();
		expect(normalizeCode('48a913')).toBeNull();
		expect(normalizeCode(482913)).toBeNull();
	});

	test('formatCode groups 3 + 3', () => {
		expect(formatCode('482913')).toBe('482 913');
		expect(formatCode(normalizeCode('482 913')!)).toBe('482 913');
	});

	test('codeStatus: used > locked > expired > active', () => {
		const now = new Date('2026-11-18T12:00:00Z');
		const later = new Date('2026-11-18T12:10:00Z');
		const base = { expiresAt: later, usedAt: null, attempts: 0 };
		expect(codeStatus(base, now)).toBe('active');
		expect(codeStatus({ ...base, attempts: PAIRING_MAX_ATTEMPTS - 1 }, now)).toBe('active');
		expect(codeStatus({ ...base, attempts: PAIRING_MAX_ATTEMPTS }, now)).toBe('locked');
		expect(codeStatus(base, later)).toBe('expired'); // expiry instant itself is expired
		expect(codeStatus({ ...base, usedAt: now }, now)).toBe('used');
		expect(codeStatus({ ...base, usedAt: now, attempts: 9 }, later)).toBe('used');
	});
});

describe('rate limiter', () => {
	test('blocks after `limit` failures within the window, then recovers', () => {
		const rl = new RateLimiter(3, 60_000);
		const t0 = 1_000_000;
		for (let i = 0; i < 3; i++) {
			expect(rl.check('ip', t0 + i).ok).toBe(true);
			rl.fail('ip', t0 + i);
		}
		const blocked = rl.check('ip', t0 + 10);
		expect(blocked.ok).toBe(false);
		expect(blocked.retryAfterMs).toBe(60_000 - 10);
		expect(rl.check('other', t0 + 10).ok).toBe(true);
		expect(rl.check('ip', t0 + 60_000).ok).toBe(true);
	});

	test('a new window starts after expiry; reset clears', () => {
		const rl = new RateLimiter(2, 1000);
		rl.fail('a', 0);
		rl.fail('a', 500);
		expect(rl.check('a', 999).ok).toBe(false);
		rl.fail('a', 1000); // new window
		expect(rl.check('a', 1001).ok).toBe(true);
		rl.fail('a', 1002);
		expect(rl.check('a', 1003).ok).toBe(false);
		rl.reset('a');
		expect(rl.check('a', 1004).ok).toBe(true);
	});

	test('expired entries are swept', () => {
		const rl = new RateLimiter(1, 1000);
		rl.fail('a', 0);
		rl.fail('b', 0);
		expect(rl.size).toBe(2);
		rl.check('c', 5000);
		expect(rl.size).toBe(0);
	});
});

describe('routing', () => {
	test('public paths', () => {
		for (const p of [
			'/pair',
			'/pair/',
			'/pair/session',
			'/setup',
			'/offline',
			'/api/pair',
			'/api/pair/session',
			'/api/health',
			'/manifest.webmanifest',
			'/service-worker.js',
			'/_app/immutable/entry/start.js',
			'/icons/icon-192.png',
			'/apple-touch-icon.png',
			'/favicon.ico'
		])
			expect([p, isPublicPath(p)]).toEqual([p, true]);
	});

	test('everything else needs a device', () => {
		for (const p of [
			'/',
			'/plan',
			'/settings',
			'/focus',
			'/pairing',
			'/setup-x',
			'/api/timer',
			'/api/timer/stream',
			'/api/devices/codes',
			'/api/healthz',
			'/offline/x'
		])
			expect([p, isPublicPath(p)]).toEqual([p, false]);
	});

	test('isApiPath', () => {
		expect(isApiPath('/api/timer')).toBe(true);
		expect(isApiPath('/api')).toBe(true);
		expect(isApiPath('/apiary')).toBe(false);
		expect(isApiPath('/plan')).toBe(false);
	});

	test('safeNext keeps local paths, rejects loops and other origins', () => {
		expect(safeNext('/plan?week=2026-11-16')).toBe('/plan?week=2026-11-16');
		expect(safeNext('/')).toBe('/');
		expect(safeNext(undefined)).toBe('/');
		expect(safeNext('https://evil.example/')).toBe('/');
		expect(safeNext('//evil.example/')).toBe('/');
		expect(safeNext('/\\evil.example')).toBe('/');
		expect(safeNext('/pair?next=/plan')).toBe('/');
		expect(safeNext('/setup')).toBe('/');
		expect(safeNext('/api/timer')).toBe('/');
	});

	test('pairRedirect', () => {
		expect(pairRedirect('/pair', '/')).toBe('/pair');
		expect(pairRedirect('/pair', '/plan', '?week=2026-11-16')).toBe(
			'/pair?next=%2Fplan%3Fweek%3D2026-11-16'
		);
		expect(pairRedirect('/setup', '/review')).toBe('/setup?next=%2Freview');
	});
});

describe('device names', () => {
	test('deviceNameFromUA', () => {
		expect(deviceNameFromUA(UA.iphone)).toBe('iPhone');
		expect(deviceNameFromUA(UA.ipadOld)).toBe('iPad');
		expect(deviceNameFromUA(UA.ipadDesktop)).toBe('Mac');
		expect(deviceNameFromUA(UA.ipadDesktop, { touch: true })).toBe('iPad');
		expect(deviceNameFromUA(UA.android)).toBe('Android phone');
		expect(deviceNameFromUA(UA.androidTab)).toBe('Android tablet');
		expect(deviceNameFromUA(UA.windows)).toBe('Windows PC');
		expect(deviceNameFromUA(UA.linux)).toBe('Linux PC');
		expect(deviceNameFromUA(UA.cros)).toBe('Chromebook');
		expect(deviceNameFromUA('')).toBe('Browser');
		expect(deviceNameFromUA(null)).toBe('Browser');
	});

	test('parseDeviceName trims and limits', () => {
		expect(parseDeviceName('  My   iPhone ')).toEqual({ ok: true, value: 'My iPhone' });
		expect(parseDeviceName('').ok).toBe(false);
		expect(parseDeviceName('   ').ok).toBe(false);
		expect(parseDeviceName(42).ok).toBe(false);
		expect(parseDeviceName('x'.repeat(60)).ok).toBe(true);
		expect(parseDeviceName('x'.repeat(61)).ok).toBe(false);
	});

	test('parseDeviceKind', () => {
		expect(parseDeviceKind('pwa')).toBe('pwa');
		expect(parseDeviceKind('tauri')).toBe('tauri');
		expect(parseDeviceKind('admin')).toBe('browser');
		expect(parseDeviceKind(undefined, 'tauri')).toBe('tauri');
	});

	test('formatAgo', () => {
		const now = new Date('2026-11-18T12:00:00Z');
		const ago = (ms: number) => formatAgo(new Date(now.getTime() - ms), now);
		expect(ago(5_000)).toBe('just now');
		expect(ago(-5_000)).toBe('just now');
		expect(ago(3 * 60_000)).toBe('3 min ago');
		expect(ago(2 * 3600_000)).toBe('2 h ago');
		expect(ago(30 * 3600_000)).toBe('yesterday');
		expect(ago(5 * 86400_000)).toBe('5 days ago');
		expect(ago(60 * 86400_000)).toBe('Sep 19, 2026');
	});
});

describe('touchPlan', () => {
	const now = new Date('2026-11-18T12:00:00Z');
	const ago = (ms: number) => new Date(now.getTime() - ms);
	test('last_seen at most once a minute', () => {
		expect(touchPlan({ lastSeenAt: null, cookieRenewedAt: now }, now, true)).toEqual({
			seen: true,
			renew: false
		});
		expect(touchPlan({ lastSeenAt: ago(59_000), cookieRenewedAt: now }, now, true).seen).toBe(
			false
		);
		expect(touchPlan({ lastSeenAt: ago(60_000), cookieRenewedAt: now }, now, true).seen).toBe(true);
	});
	test('cookie renewal at most once a day, only for cookie auth', () => {
		const fresh = { lastSeenAt: now, cookieRenewedAt: ago(23 * 3600_000) };
		const stale = { lastSeenAt: now, cookieRenewedAt: ago(24 * 3600_000) };
		expect(touchPlan(fresh, now, true)).toEqual({ seen: false, renew: false });
		expect(touchPlan(stale, now, true)).toEqual({ seen: true, renew: true });
		expect(touchPlan({ lastSeenAt: now, cookieRenewedAt: null }, now, true).renew).toBe(true);
		expect(touchPlan(stale, now, false)).toEqual({ seen: false, renew: false });
	});
});
