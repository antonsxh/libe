/**
 * The Tauri 2 shell end to end (Linux/WebKitGTK): bundled pairing page, pairing over
 * `POST /api/pair` from Rust, session bootstrap into the webview, token reuse on restart,
 * revocation and the native "Change server / Unpair…" menu, the unreachable-server view, and
 * the auto-updater driven from the server's Settings page (against a local, test-signed feed).
 *
 * Headless boxes have no Secret Service, so the debug build stores its credentials in
 * `LIBE_TAURI_CREDENTIALS_FILE`; the updater reads `LIBE_UPDATER_FEED` / `LIBE_UPDATER_PUBKEY`
 * (all honoured only in debug builds).
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
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
const FEED = `${STATE}feed/`;
const TAURI_CLI = `${ROOT}node_modules/.bin/tauri`;
/** What the fake update feed announces per track (the debug build is 0.0.0 → stable track). */
const RELEASES = { stable: '9.9.9', nightly: '9.9.10-nightly.20261119.1' } as const;

let driver: ChildProcess;
let sql: Sql;
let admin: string;
let wd: WebDriver | null = null;
let feed: Server;
/** Serve a signature of another key for this track (a tampered update). */
const tampered = new Set<string>();

/** A test signing key and one signed payload per track, like the release pipeline makes. */
function signedFeed(): string {
	mkdirSync(FEED, { recursive: true });
	const key = `${FEED}test.key`;
	const other = `${FEED}other.key`;
	for (const k of [key, other])
		execFileSync(TAURI_CLI, ['signer', 'generate', '--ci', '-p', '', '-f', '-w', k], {
			stdio: 'ignore'
		});
	for (const [track, version] of Object.entries(RELEASES)) {
		const file = `${FEED}${track}.bin`;
		writeFileSync(file, randomBytes(256 * 1024));
		for (const [k, suffix] of [
			[key, 'good'],
			[other, 'bad']
		]) {
			execFileSync(
				TAURI_CLI,
				['signer', 'sign', '-k', readFileSync(k, 'utf8'), '-p', '', '--app-version', version, file],
				{ stdio: 'ignore' }
			);
			writeFileSync(`${file}.${suffix}`, readFileSync(`${file}.sig`));
		}
	}
	return readFileSync(`${key}.pub`, 'utf8').trim();
}

/** `/<track>.json` → Tauri update manifest; `/<track>.bin` → the payload. */
async function startFeed(): Promise<string> {
	feed = createServer((req, res) => {
		const m = /^\/(stable|nightly)\.(json|bin)$/.exec(req.url ?? '');
		if (!m) return void res.writeHead(404).end();
		const track = m[1] as keyof typeof RELEASES;
		if (m[2] === 'bin') return void res.end(readFileSync(`${FEED}${track}.bin`));
		const base = `http://127.0.0.1:${(feed.address() as AddressInfo).port}`;
		const sig = readFileSync(`${FEED}${track}.bin.${tampered.has(track) ? 'bad' : 'good'}`, 'utf8');
		res.setHeader('content-type', 'application/json');
		res.end(
			JSON.stringify({
				version: RELEASES[track],
				notes: 'test',
				pub_date: new Date().toISOString(),
				// a `--no-bundle` build has no bundle type: plain `{os}-{arch}` key
				platforms: { 'linux-x86_64': { signature: sig.trim(), url: `${base}/${track}.bin` } }
			})
		);
	});
	await new Promise<void>((r) => feed.listen(0, '127.0.0.1', r));
	return `http://127.0.0.1:${(feed.address() as AddressInfo).port}`;
}

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
	const pubkey = signedFeed();
	const feedUrl = await startFeed();
	driver = spawn(`${homedir()}/.cargo/bin/tauri-driver`, ['--port', String(DRIVER_PORT)], {
		env: {
			...process.env,
			HOME: STATE, // window state + WebKit data land here, not in the real home
			XDG_DATA_HOME: `${STATE}data`,
			XDG_CONFIG_HOME: `${STATE}config`,
			XDG_CACHE_HOME: `${STATE}cache`,
			LIBE_TAURI_CREDENTIALS_FILE: CREDS,
			LIBE_UPDATER_FEED: feedUrl,
			LIBE_UPDATER_PUBKEY: pubkey,
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
	feed?.close();
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

/** The desktop app's section of the server's Settings page (only rendered inside the app). */
async function desktopSettings(d: WebDriver) {
	await d.get(`${BASE}/settings`);
	await onLibe(d, '/settings');
	await visible(d, 'desktop-title');
}
const phase = (d: WebDriver) =>
	d.findElement(By.css('[data-phase]')).then((el) => el.getAttribute('data-phase'));
async function waitForPhase(d: WebDriver, kind: string) {
	const status = () => d.findElement(By.css('[data-phase]')).getText();
	await d
		.wait(async () => (await phase(d)) === kind, 30_000)
		.catch(async () => {
			throw new Error(`update phase ${kind} expected, got ${await phase(d)}: ${await status()}`);
		});
	return status();
}
const trackRadio = (d: WebDriver, track: 'stable' | 'nightly') =>
	d.findElement(By.css(`input[name=update-track][value=${track}]`));

test('Settings → Desktop app: the update is downloaded and verified; the track persists', async () => {
	const d = wd!; // paired and on Home (previous test)
	await desktopSettings(d);
	expect(await d.findElement(By.css('[data-testid=app-version]')).getText()).toBe('libe 0.0.0');
	expect(await trackRadio(d, 'stable').isSelected()).toBe(true);

	await d.findElement(By.xpath('//button[contains(., "Check for updates")]')).click();
	expect(await waitForPhase(d, 'ready')).toContain('libe 9.9.9 is ready');

	// Switching to Nightly drops the stable download and fetches the nightly build.
	await d.findElement(By.xpath('//label[contains(., "Nightly")]')).click();
	expect(await waitForPhase(d, 'ready')).toContain(`libe ${RELEASES.nightly} is ready`);
	const saved = `${STATE}config/app.libe.desktop/updates.json`;
	expect(JSON.parse(readFileSync(saved, 'utf8'))).toEqual({ track: 'nightly' });

	const restarted = await launch();
	await onLibe(restarted);
	await desktopSettings(restarted);
	expect(await trackRadio(restarted, 'nightly').isSelected()).toBe(true);
});

test('an update whose signature does not verify is rejected', async () => {
	const d = wd!;
	tampered.add('stable');
	try {
		await desktopSettings(d);
		await d.findElement(By.xpath('//label[contains(., "Stable")]')).click();
		expect(await waitForPhase(d, 'failed')).toContain('Downloading libe 9.9.9 failed');
		expect(await d.findElements(By.css('[data-phase] button'))).toHaveLength(0); // no install
	} finally {
		tampered.delete('stable');
	}
});
