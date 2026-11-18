/** Device pairing for tests: every client of libe must be a paired device. */
import { COOKIE, SETUP_SECRET } from './env.ts';

/** Pair a new device with the setup secret → its token (= the `libe_device` cookie value). */
export async function pairWithSecret(
	base: string,
	opts: { name?: string; kind?: string; ip?: string } = {}
): Promise<string> {
	const res = await fetch(`${base}/setup`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			origin: base,
			accept: 'text/html',
			'content-type': 'application/x-www-form-urlencoded',
			...(opts.ip ? { 'x-forwarded-for': opts.ip } : {})
		},
		body: new URLSearchParams({
			secret: SETUP_SECRET,
			name: opts.name ?? 'e2e',
			kind: opts.kind ?? 'browser',
			next: '/'
		})
	});
	const cookie = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`));
	if (res.status !== 303 || !cookie) throw new Error(`pairing via /setup failed: ${res.status}`);
	return cookie.slice(COOKIE.length + 1).split(';')[0];
}

/** A Playwright `storageState` holding the device cookie. */
export function storageStateFor(base: string, token: string) {
	return {
		cookies: [
			{
				name: COOKIE,
				value: token,
				domain: new URL(base).hostname,
				path: '/',
				expires: Math.floor(Date.now() / 1000) + 86_400,
				httpOnly: true,
				secure: false,
				sameSite: 'Lax' as const
			}
		],
		origins: []
	};
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Issue a 6-digit pairing code as the device `token` → `{ id, code: "123 456", url, … }`. */
export async function issueCode(
	base: string,
	token: string
): Promise<{ id: string; code: string; url: string }> {
	const res = await fetch(`${base}/api/devices/codes`, {
		method: 'POST',
		headers: { ...bearer(token), 'content-type': 'application/json' },
		body: '{}'
	});
	if (!res.ok) throw new Error(`issueCode: ${res.status}`);
	return (await res.json()) as { id: string; code: string; url: string };
}

let ipCounter = Math.floor(Math.random() * 200);
/** A fresh client address for `X-Forwarded-For` → its own rate-limit bucket. */
export function freshIp(): string {
	ipCounter = (ipCounter + 1) % 250;
	return `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${ipCounter + 1}`;
}
