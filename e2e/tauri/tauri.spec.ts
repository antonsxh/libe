/**
 * The Tauri 2 shell end to end (Linux/WebKitGTK): bundled pairing page, pairing over
 * `POST /api/pair` from Rust, session bootstrap into the webview, token reuse on restart,
 * revocation and the native "Change server / Unpair…" menu, and the unreachable-server view.
 *
 * Headless boxes have no Secret Service, so the debug build stores its credentials in
 * `LIBE_TAURI_CREDENTIALS_FILE` (honoured only in debug builds).
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { Builder, By, until, type WebDriver } from 'selenium-webdriver';
import { test, expect } from '@playwright/test';
import { OUTPUT, ROOT } from '../support/env.ts';
import { bearer, issueCode, pairWithSecret } from '../support/auth.ts';
import { connect, type Sql } from '../support/db.ts';
import { AppServer } from '../support/server.ts';

const BIN = `${ROOT}src-tauri/target/debug/libe`;
const DB = 'libe_e2e_tauri';
const server = new AppServer(3125, DB);
const BASE = server.base;
const STATE = `${OUTPUT}/tauri-state/`;
const CREDS = `${STATE}credentials.json`;
const DRIVER_PORT = 4444;

let driver: ChildProcess;
let sql: Sql;
let admin: string;
let wd: WebDriver | null = null;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	test.skip(!process.env.DISPLAY, 'needs an X display — run via `bun run test:tauri` (xvfb-run)');
	expect(
		existsSync(BIN),
		`${BIN} — build it with \`bun run tauri build --debug --no-bundle\``
	).toBe(true);
	rmSync(STATE, { recursive: true, force: true });
	mkdirSync(STATE, { recursive: true });
	await server.start({ reset: true });
	sql = connect(DB);
	admin = await pairWithSecret(BASE, { name: 'Admin browser' });
	driver = spawn(`${homedir()}/.cargo/bin/tauri-driver`, ['--port', String(DRIVER_PORT)], {
		env: {
			...process.env,
			HOME: STATE, // window state + WebKit data land here, not in the real home
			XDG_DATA_HOME: `${STATE}data`,
			XDG_CONFIG_HOME: `${STATE}config`,
			XDG_CACHE_HOME: `${STATE}cache`,
			LIBE_TAURI_CREDENTIALS_FILE: CREDS,
			WEBKIT_DISABLE_DMABUF_RENDERER: '1',
			LIBGL_ALWAYS_SOFTWARE: '1'
		},
		stdio: 'ignore'
	});
	await expect
		.poll(() =>
			fetch(`http://127.0.0.1:${DRIVER_PORT}/status`).then(
				(r) => r.ok,
				() => false
			)
		)
		.toBe(true);
});

test.afterAll(async () => {
	await wd?.quit().catch(() => {});
	driver?.kill();
	await sql?.end();
	await server.stop();
});

async function launch(): Promise<WebDriver> {
	await wd?.quit().catch(() => {});
	wd = await new Builder()
		.usingServer(`http://127.0.0.1:${DRIVER_PORT}/`)
		.withCapabilities({ browserName: 'wry', 'tauri:options': { application: BIN } })
		.build();
	return wd;
}
const visible = async (d: WebDriver, id: string, ms = 20_000) =>
	d.wait(until.elementIsVisible(await d.wait(until.elementLocated(By.id(id)), ms)), ms);
async function onLibe(d: WebDriver, path = '/') {
	await d.wait(async () => (await d.getCurrentUrl()) === `${BASE}${path}`, 20_000);
	await d.wait(until.elementLocated(By.css('html[data-timer=live]')), 20_000);
}
async function pair(d: WebDriver, name?: string) {
	const { code } = await issueCode(BASE, admin);
	const field = await d.findElement(By.id('code'));
	await field.clear();
	await field.sendKeys(code.replace(' ', ''));
	if (name) {
		const n = await d.findElement(By.id('name'));
		await n.clear();
		await n.sendKeys(name);
	}
	await d.findElement(By.id('submit')).click();
	await onLibe(d);
}
/** Click at screen coordinates through libxdo (no xdotool binary on this box). */
function xclick(x: number, y: number) {
	execFileSync('python3', [
		'-c',
		`import ctypes,time; x=ctypes.CDLL('libxdo.so.3'); d=x.xdo_new(None); x.xdo_move_mouse(ctypes.c_void_p(d),${x},${y},0); time.sleep(0.2); x.xdo_click_window(ctypes.c_void_p(d),0,1)`
	]);
}

test("first start shows the bundled pairing page; a wrong code shows the server's message", async () => {
	const d = await launch();
	await visible(d, 'view-pair');
	expect(await d.getCurrentUrl()).toMatch(/^tauri:\/\/localhost/);
	expect(await d.findElement(By.id('name')).getAttribute('value')).toBe('Linux app');
	await d.findElement(By.id('server')).sendKeys(BASE);
	await d.findElement(By.id('code')).sendKeys('000000');
	await d.findElement(By.id('submit')).click();
	expect(await (await visible(d, 'error')).getText()).toContain('Wrong code');
});

test('pairing opens libe with a live stream, as a "tauri" device; the token stays out of the URL', async () => {
	const d = wd!;
	await pair(d, 'Tauri e2e');
	const [dev] = await sql`select kind from devices where name = 'Tauri e2e' and revoked_at is null`;
	expect(dev.kind).toBe('tauri');
	const stored = JSON.parse(readFileSync(CREDS, 'utf8'));
	expect(stored.server).toBe(BASE);
	expect(stored.token).toMatch(/^[\w-]{43}$/);
	expect(await d.getCurrentUrl()).not.toContain('token');
	await d.get(`${BASE}/plan`);
	await onLibe(d, '/plan');
});

test('a restart reuses the stored token and goes straight to Home', async () => {
	const d = await launch();
	await onLibe(d);
});

test('revoking the app in Settings brings it back to pairing, server kept', async () => {
	const d = wd!;
	const [{ id }] =
		await sql`select id from devices where name = 'Tauri e2e' and revoked_at is null`;
	const res = await fetch(`${BASE}/settings?/revoke`, {
		method: 'POST',
		headers: {
			...bearer(admin),
			origin: BASE,
			accept: 'application/json',
			'content-type': 'application/x-www-form-urlencoded'
		},
		body: `id=${id}`
	});
	expect(res.ok).toBe(true);
	await visible(d, 'view-pair');
	expect(await (await visible(d, 'notice')).getText()).toContain('signed out');
	expect(existsSync(CREDS)).toBe(false);
	expect(await d.findElement(By.id('server')).getAttribute('value')).toBe(BASE);
});

test('menu "Change server / Unpair…" revokes the device and returns to pairing', async () => {
	const d = wd!;
	await pair(d);
	expect(existsSync(CREDS)).toBe(true);
	xclick(22, 12); // "libe" menu on the GTK menu bar
	await new Promise((r) => setTimeout(r, 600)); // the native menu opens asynchronously
	xclick(70, 70); // second item: Change server / Unpair…
	await visible(d, 'view-pair');
	expect(existsSync(CREDS)).toBe(false);
	// The app revokes the device on the server while it shows the pairing page.
	const revoked = async () =>
		(
			await sql`select revoked_at from devices where kind = 'tauri' order by paired_at desc limit 1`
		)[0].revoked_at;
	await expect.poll(revoked).not.toBeNull();
});

test('with the server down the app says so, and Retry works once it is back', async () => {
	let d = wd!;
	await pair(d);
	await d.quit();
	wd = null;
	await server.stop();
	d = await launch();
	expect(await (await visible(d, 'view-offline')).getText()).toContain('Can’t reach');
	await server.start();
	await d.findElement(By.id('retry')).click();
	await onLibe(d);
});
