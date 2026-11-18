/**
 * M7 — device auth: redirects/401s, /setup, pairing codes (QR, single use, lockout, expiry,
 * per-client rate limit), rename/revoke (ends the SSE stream), sign out, Bearer + the Tauri
 * session bootstrap, and the remote-function path guard.
 *
 * Rate-limited endpoints are called with a fresh `X-Forwarded-For` (the server runs with
 * `ADDRESS_HEADER`, like behind the HTTPS proxy), so each test has its own budget.
 */
import { createHash } from 'node:crypto';
import jsQR from 'jsqr';
import type { Browser, Page } from '@playwright/test';
import { test, expect, live, gotoLive } from '../support/fixtures.ts';
import { bearer, freshIp, issueCode, pairWithSecret, storageStateFor } from '../support/auth.ts';
import { BASE, COOKIE, SETUP_SECRET } from '../support/env.ts';
import { uid } from '../support/db.ts';

const json = (body: unknown, headers: Record<string, string> = {}) => ({
	method: 'POST',
	headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
	body: JSON.stringify(body)
});
const pairApi = (body: unknown, ip: string) =>
	fetch(`${BASE}/api/pair`, json(body, { 'x-forwarded-for': ip }));

/** A logged-out browser context (no device cookie), optionally as another client address. */
async function anonymous(browser: Browser, opts: { ip?: string; userAgent?: string } = {}) {
	return browser.newContext({
		storageState: { cookies: [], origins: [] },
		serviceWorkers: 'block',
		userAgent: opts.userAgent,
		extraHTTPHeaders: opts.ip ? { 'x-forwarded-for': opts.ip } : undefined
	});
}

async function cookieOf(page: Page) {
	return (await page.context().cookies()).find((c) => c.name === COOKIE);
}

test('without a device: pages redirect to /pair?next=…, the API answers 401, a stale cookie is dropped', async () => {
	const page = await fetch(`${BASE}/plan?week=2026-11-16`, { redirect: 'manual' });
	expect(page.status).toBe(303);
	expect(page.headers.get('location')).toBe('/pair?next=%2Fplan%3Fweek%3D2026-11-16');
	expect((await fetch(`${BASE}/`, { redirect: 'manual' })).headers.get('location')).toBe('/pair');

	for (const path of ['/api/timer', '/api/timer/stream', '/api/sessions', '/api/devices/codes']) {
		const res = await fetch(`${BASE}${path}`);
		expect([path, res.status, (await res.json()).code]).toEqual([path, 401, 'unauthorized']);
	}
	expect((await fetch(`${BASE}/api/timer`, { headers: bearer('x'.repeat(43)) })).status).toBe(401);

	const stale = await fetch(`${BASE}/settings`, {
		redirect: 'manual',
		headers: { cookie: `${COOKIE}=${'y'.repeat(43)}` }
	});
	expect(stale.status).toBe(303);
	expect(stale.headers.get('set-cookie')).toMatch(new RegExp(`^${COOKIE}=;`));
	for (const path of ['/pair', '/setup', '/offline', '/api/health'])
		expect([path, (await fetch(`${BASE}${path}`, { redirect: 'manual' })).status]).toEqual([
			path,
			200
		]);
});

test('while no device is paired, pages send you to /setup', async ({ sql }) => {
	const revoked =
		await sql`update devices set revoked_at = now() where revoked_at is null returning id`;
	try {
		const res = await fetch(`${BASE}/review`, { redirect: 'manual' });
		expect(res.headers.get('location')).toBe('/setup?next=%2Freview');
	} finally {
		await sql`update devices set revoked_at = null where id in ${sql(revoked.map((r) => r.id))}`;
	}
});

test('/setup: a wrong secret is refused, the right one pairs and follows ?next; only a hash is stored', async ({
	browser,
	sql,
	console
}) => {
	const name = `Setup ${uid()}`;
	const ctx = await anonymous(browser, { ip: freshIp() });
	console.watch(ctx);
	console.allow(/status of 400/);
	const page = await ctx.newPage();
	await page.goto('/plan');
	await expect(page).toHaveURL(/\/pair\?next=%2Fplan$/);

	await page.goto('/setup?next=%2Fplan');
	await page.locator('input[name=secret]').fill('definitely-the-wrong-secret');
	await page.getByLabel('Device name').fill(name);
	await page.getByRole('button', { name: /pair/i }).click();
	await expect(page.getByRole('alert')).toHaveText('Wrong setup secret.');
	expect(await sql`select 1 from devices where name = ${name}`).toHaveLength(0);

	await page.locator('input[name=secret]').fill(SETUP_SECRET);
	await page.getByRole('button', { name: /pair/i }).click();
	await expect(page).toHaveURL(`${BASE}/plan`);
	await live(page);

	const cookie = (await cookieOf(page))!;
	expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: false });
	expect(cookie.expires - Date.now() / 1000).toBeGreaterThan(399 * 86_400);
	const [row] = await sql`select token_hash, kind from devices where name = ${name}`;
	expect(row).toEqual({
		token_hash: createHash('sha256').update(cookie.value).digest('hex'),
		kind: 'browser'
	});
	await ctx.close();
});

test('/setup is rate limited per client after 10 wrong secrets', async () => {
	const ip = freshIp();
	const attempt = (secret: string) =>
		fetch(`${BASE}/setup`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				origin: BASE,
				accept: 'text/html',
				'content-type': 'application/x-www-form-urlencoded',
				'x-forwarded-for': ip
			},
			body: new URLSearchParams({ secret, name: 'Brute force', next: '/' })
		});
	for (let i = 0; i < 10; i++) expect((await attempt('wrong-secret-guess')).status).toBe(400);
	const blocked = await attempt(SETUP_SECRET);
	expect(blocked.status).toBe(429);
	expect(blocked.headers.get('set-cookie')).toBeNull();
	// Another client is not affected.
	expect(await pairWithSecret(BASE, { ip: freshIp(), name: 'Other client' })).toMatch(
		/^[\w-]{43}$/
	);
});

test('pairing code: the dialog shows a code and its QR; a second device pairs with it once', async ({
	page,
	browser,
	sql,
	console
}) => {
	console.allow(/status of 401/);
	const name = `Phone ${uid()}`;
	await gotoLive(page, '/settings');
	await page.getByRole('button', { name: 'Pair new device' }).click();
	const dialog = page.getByRole('dialog', { name: 'Pair a new device' });
	const codeEl = dialog.locator('.code-box .code:not(.faint)');
	await expect(codeEl).toHaveText(/^\d{3} \d{3}$/);
	const code = (await codeEl.textContent())!.trim();

	// Decode the rendered QR (screenshot → canvas pixels → jsQR).
	const png = (await dialog.locator('.qr svg').screenshot()).toString('base64');
	const img = await page.evaluate(async (b64) => {
		const el = new Image();
		el.src = `data:image/png;base64,${b64}`;
		await el.decode();
		const canvas = Object.assign(document.createElement('canvas'), {
			width: el.width,
			height: el.height
		});
		const ctx = canvas.getContext('2d')!;
		ctx.drawImage(el, 0, 0);
		return {
			w: el.width,
			h: el.height,
			data: Array.from(ctx.getImageData(0, 0, el.width, el.height).data)
		};
	}, png);
	const url = jsQR(new Uint8ClampedArray(img.data), img.w, img.h)?.data;
	expect(url).toBe(`${BASE}/pair?code=${code.replace(' ', '')}`);

	const phone = await anonymous(browser, {
		ip: freshIp(),
		userAgent:
			'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
	});
	console.watch(phone);
	const p = await phone.newPage();
	await p.goto(url!);
	await expect(p.getByLabel('Pairing code')).toHaveValue(code);
	await expect(p.getByLabel('Device name')).toHaveValue('iPhone');
	await p.getByLabel('Device name').fill(name);
	await p.getByRole('button', { name: 'Pair device' }).click();
	await expect(p).toHaveURL(`${BASE}/`);
	await live(p);

	await expect(dialog.getByRole('status')).toContainText(`${name} is paired.`);
	expect(
		(await sql`select kind from devices where name = ${name} and revoked_at is null`)[0].kind
	).toBe('browser');
	const reuse = await pairApi({ code, name: 'Again' }, freshIp());
	expect([reuse.status, (await reuse.json()).code]).toEqual([401, 'used']);
	await phone.close();
});

test('pairing codes: 5 wrong guesses lock a code, expired codes are refused, failures are rate limited', async ({
	browser,
	sql,
	token,
	console
}) => {
	console.allow(/status of 400/, /status of 429/);
	const ip = freshIp();
	const c = await issueCode(BASE, token);
	const digits = c.code.replace(' ', '');
	const wrong = String((Number(digits) + 1) % 1_000_000).padStart(6, '0');
	for (let i = 0; i < 5; i++) {
		const r = await pairApi({ code: wrong, name: 'Guess' }, ip);
		expect([r.status, (await r.json()).code]).toEqual([401, 'wrong']);
	}
	const locked = await pairApi({ code: digits, name: 'Late' }, ip);
	expect((await locked.json()).code).toBe('locked');
	const status = await fetch(`${BASE}/api/devices/codes/${c.id}`, { headers: bearer(token) });
	expect((await status.json()).status).toBe('locked');

	const c2 = await issueCode(BASE, token);
	await sql`update pairing_codes set expires_at = now() - interval '1 second' where id = ${c2.id}`;
	expect((await (await pairApi({ code: c2.code, name: 'Late' }, freshIp())).json()).code).toBe(
		'expired'
	);

	// 6 failures so far from `ip` (limit: 10 per minute).
	for (let i = 0; i < 4; i++)
		expect((await pairApi({ code: '000000', name: 'Brute' }, ip)).status).toBe(401);
	const limited = await pairApi({ code: '000000', name: 'Brute' }, ip);
	expect(limited.status).toBe(429);
	expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
	expect((await pairApi({ code: '000000', name: 'Brute' }, freshIp())).status).toBe(401);

	const ctx = await anonymous(browser, { ip });
	console.watch(ctx);
	const page = await ctx.newPage();
	await page.goto('/pair');
	await page.getByLabel('Pairing code').fill('123456');
	await page.getByRole('button', { name: 'Pair device' }).click();
	await expect(page.getByRole('alert')).toContainText('Too many attempts');
	await ctx.close();
});

test('Settings: rename a device; revoking it closes its live stream and sends its page to /pair', async ({
	page,
	browser,
	sql
}) => {
	const name = `Tablet ${uid()}`;
	const tokenB = await pairWithSecret(BASE, { name, ip: freshIp() });
	const ctxB = await browser.newContext({
		storageState: storageStateFor(BASE, tokenB),
		serviceWorkers: 'block'
	});
	const b = await ctxB.newPage();
	await gotoLive(b, '/calendar');
	const stream = await fetch(`${BASE}/api/timer/stream`, { headers: bearer(tokenB) });
	let streamEnded = false;
	void (async () => {
		const reader = stream.body!.getReader();
		while (!(await reader.read()).done);
		streamEnded = true;
	})();

	await gotoLive(page, '/settings');
	const device = (n: string) => page.locator('li.device', { hasText: n });
	await device(name)
		.getByRole('button', { name: `Actions for ${name}` })
		.click();
	await page.getByRole('menuitem', { name: 'Rename…' }).click();
	const rename = page.locator('form.rename');
	await rename.getByLabel('Device name').fill(`${name} (renamed)`);
	await rename.getByRole('button', { name: 'Save' }).click();
	await expect(device(`${name} (renamed)`)).toBeVisible();
	expect(await sql`select 1 from devices where name = ${`${name} (renamed)`}`).toHaveLength(1);

	await device(`${name} (renamed)`)
		.getByRole('button', { name: /^Actions for/ })
		.click();
	await page.getByRole('menuitem', { name: 'Revoke…' }).click();
	await page
		.getByRole('dialog', { name: 'Revoke device?' })
		.getByRole('button', { name: 'Revoke' })
		.click();
	await expect(device(`${name} (renamed)`)).toHaveCount(0);

	await expect.poll(() => streamEnded, { timeout: 5_000 }).toBe(true);
	await expect(b).toHaveURL(/\/pair\?next=%2Fcalendar$/, { timeout: 10_000 });
	expect(
		(await sql`select revoked_at from devices where name = ${`${name} (renamed)`}`)[0].revoked_at
	).not.toBeNull();
	await b.goto('/review');
	await expect(b).toHaveURL(/\/pair\?next=%2Freview$/);
	await ctxB.close();
});

test('"Sign out this device" revokes it: back to /pair, its token stops working', async ({
	browser,
	sql
}) => {
	const name = `Laptop ${uid()}`;
	const tokenC = await pairWithSecret(BASE, { name, ip: freshIp() });
	const ctx = await browser.newContext({
		storageState: storageStateFor(BASE, tokenC),
		serviceWorkers: 'block'
	});
	const page = await ctx.newPage();
	await gotoLive(page, '/');
	await page.getByRole('button', { name: 'Account and devices' }).click();
	await page.getByRole('menuitem', { name: 'Sign out this device' }).click();
	await expect(page).toHaveURL(`${BASE}/pair`);
	expect(await cookieOf(page)).toBeUndefined();
	expect(
		(await sql`select revoked_at from devices where name = ${name}`)[0].revoked_at
	).not.toBeNull();
	expect((await fetch(`${BASE}/api/timer`, { headers: bearer(tokenC) })).status).toBe(401);
	await ctx.close();
});

test('Bearer clients: /api/pair → token, whoami, and /pair/session turns it into the cookie', async ({
	browser,
	token,
	console
}) => {
	console.allow(/status of 401/);
	const name = `Desktop app ${uid()}`;
	expect((await fetch(`${BASE}/api/timer`, { headers: bearer(token) })).status).toBe(200);

	const c = await issueCode(BASE, token);
	const res = await pairApi({ code: c.code, name, kind: 'tauri' }, freshIp());
	const body = await res.json();
	expect(body).toMatchObject({ ok: true, device: { name, kind: 'tauri' } });
	const who = await fetch(`${BASE}/api/pair/session`, { headers: bearer(body.token) });
	expect((await who.json()).device.name).toBe(name);

	const ctx = await anonymous(browser);
	console.watch(ctx);
	const page = await ctx.newPage();
	await page.goto(`/pair/session#token=${body.token}&next=/plan`);
	await expect(page).toHaveURL(`${BASE}/plan`);
	await live(page);
	expect((await cookieOf(page))?.value).toBe(body.token);
	expect(page.url()).not.toContain('token');

	const bad = await fetch(`${BASE}/api/pair/session`, json({}, bearer('z'.repeat(43))));
	expect(bad.status).toBe(401);
	await ctx.close();
});

test('an active cookie is re-issued at most once a day (sliding expiry)', async ({ sql }) => {
	const name = `Sliding ${uid()}`;
	const token = await pairWithSecret(BASE, { name, ip: freshIp() });
	const get = () => fetch(`${BASE}/api/timer`, { headers: { cookie: `${COOKIE}=${token}` } });
	const renewedAt = async () =>
		(await sql`select cookie_renewed_at from devices where name = ${name}`)[0]
			.cookie_renewed_at as Date;
	expect((await get()).headers.get('set-cookie')).toBeNull();

	await sql`update devices set cookie_renewed_at = now() - interval '25 hours' where name = ${name}`;
	const before = await renewedAt();
	const renewed = await get();
	expect(renewed.headers.get('set-cookie')).toMatch(
		new RegExp(`^${COOKIE}=${token};.*Max-Age=34560000`)
	);
	await expect.poll(async () => (await renewedAt()).getTime()).toBeGreaterThan(before.getTime());
	expect((await get()).headers.get('set-cookie')).toBeNull();
});

test('remote-function calls always need a device, even with a forged x-sveltekit-pathname', async () => {
	for (const method of ['GET', 'POST']) {
		const res = await fetch(`${BASE}/_app/remote/abc123/doSomething`, {
			method,
			headers: {
				'x-sveltekit-pathname': '/pair',
				'content-type': 'application/json',
				origin: BASE
			},
			body: method === 'POST' ? '{}' : undefined
		});
		expect([method, res.status, (await res.json()).code]).toEqual([method, 401, 'unauthorized']);
	}
});
