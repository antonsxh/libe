/**
 * The suite's `test`: Playwright's plus
 * - `sql`     postgres.js client on the e2e database (worker-scoped),
 * - `token`   the device token paired by global setup,
 * - `api`     an APIRequestContext authenticated with that token (Bearer),
 * - `console` an automatic guard that fails a test on any browser console error / uncaught
 *             exception in its context unless the test allowed it (`console.allow(/…/)`).
 */
import { readFileSync } from 'node:fs';
import {
	expect,
	test as base,
	type APIRequestContext,
	type BrowserContext,
	type Page
} from '@playwright/test';
import { BASE, TOKEN_FILE } from './env.ts';
import { bearer } from './auth.ts';
import { connect, type Sql } from './db.ts';

export class ConsoleGuard {
	readonly errors: string[] = [];
	#allowed: RegExp[] = [];

	/** Expected errors, e.g. the browser's "Failed to load resource … 400" of a validation test. */
	allow(...patterns: RegExp[]): void {
		this.#allowed.push(...patterns);
	}

	watch(context: BrowserContext): void {
		trackDataRequests(context);
		context.on('console', (m) => {
			if (m.type() === 'error') this.errors.push(`${m.page()?.url() ?? '?'}: ${m.text()}`);
		});
		context.on('weberror', (e) => this.errors.push(`uncaught: ${e.error().message}`));
	}

	unexpected(): string[] {
		return this.errors.filter((e) => !this.#allowed.some((re) => re.test(e)));
	}
}

/**
 * In-flight page-data requests (`__data.json`: invalidations, link preloads) per page. A
 * reload that aborts one makes SvelteKit log "Failed to fetch", so `reloadLive` waits first.
 */
const pendingData = new WeakMap<Page, Set<unknown>>();
function trackDataRequests(context: BrowserContext): void {
	const done = (r: { frame(): { page(): Page } }) => {
		try {
			pendingData.get(r.frame().page())?.delete(r);
		} catch {
			// service-worker requests have no frame
		}
	};
	context.on('request', (r) => {
		if (!r.url().includes('/__data.json')) return;
		try {
			const page = r.frame().page();
			if (!pendingData.has(page)) pendingData.set(page, new Set());
			pendingData.get(page)!.add(r);
		} catch {
			// no frame
		}
	});
	context.on('requestfinished', done);
	context.on('requestfailed', done);
}

type TestFixtures = { api: APIRequestContext; console: ConsoleGuard };
type WorkerFixtures = { sql: Sql; token: string };

export const test = base.extend<TestFixtures, WorkerFixtures>({
	sql: [
		async ({}, use) => {
			const sql = connect();
			await use(sql);
			await sql.end();
		},
		{ scope: 'worker' }
	],
	token: [async ({}, use) => use(readFileSync(TOKEN_FILE, 'utf8').trim()), { scope: 'worker' }],
	api: async ({ playwright, token }, use) => {
		const api = await playwright.request.newContext({
			baseURL: BASE,
			extraHTTPHeaders: bearer(token)
		});
		await use(api);
		await api.dispose();
	},
	console: [
		async ({ context }, use) => {
			const guard = new ConsoleGuard();
			guard.watch(context);
			await use(guard);
			expect(guard.unexpected(), 'browser console errors').toEqual([]);
		},
		{ auto: true }
	]
});

export { expect };

/** Pages hold an open SSE stream (no `networkidle`): wait until the timer stream is live. */
export async function live(page: Page): Promise<void> {
	await expect(page.locator('html[data-timer=live]')).toBeAttached({ timeout: 15_000 });
}

/**
 * Reload (to prove persistence) once no page data is in flight, then wait for the stream.
 * The pointer is parked first: hovering a link preloads its data, and a reload aborting that
 * makes SvelteKit log "Failed to fetch".
 */
export async function reloadLive(page: Page): Promise<void> {
	await page.mouse.move(0, 0);
	const idle = async () => {
		await page.evaluate(
			() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
		);
		return pendingData.get(page)?.size ?? 0;
	};
	await expect.poll(idle, { timeout: 10_000 }).toBe(0);
	await page.reload();
	await live(page);
}

export async function gotoLive(page: Page, path: string): Promise<void> {
	await page.goto(path);
	await live(page);
}

/**
 * Resolves once the enhanced form action `?/name` has answered and — on success — the page
 * data was reloaded (`__data.json`), i.e. the UI shows the new server state. Create the
 * promise *before* the click that submits.
 */
export function actionDone(page: Page, name: string): Promise<void> {
	const path = new URL(page.url()).pathname.replace(/\/$/, '');
	const reloaded = page
		.waitForResponse((r) => new URL(r.url()).pathname === `${path}/__data.json`, {
			timeout: 15_000
		})
		.catch(() => null);
	return page
		.waitForResponse(
			(r) => r.request().method() === 'POST' && new URL(r.url()).search.includes(`/${name}`),
			{ timeout: 10_000 }
		)
		.catch((err: Error) => {
			throw new Error(`form action ?/${name} was not submitted within 10 s (${err.message})`);
		})
		.then(async (res) => {
			const body = (await res.json().catch(() => null)) as { type?: string } | null;
			if (body?.type === 'success') await reloaded;
		});
}

/** No page-level horizontal scrolling (boards/calendars scroll inside their own box). */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
	const { scroll, client } = await page.evaluate(() => ({
		scroll: document.documentElement.scrollWidth,
		client: document.documentElement.clientWidth
	}));
	expect(scroll, `page scrolls horizontally on ${page.url()}`).toBeLessThanOrEqual(client);
}

/** The timer API (`POST /api/timer`) as the e2e device. */
export async function timerCmd(
	api: APIRequestContext,
	body: Record<string, unknown>
): Promise<{ status: number; body: { ok: boolean; code?: string; snapshot?: unknown } }> {
	const res = await api.post('/api/timer', { data: body });
	return { status: res.status(), body: await res.json() };
}

/** End whatever timer is active (nothing logged) so a test starts from a clean slate. */
export async function discardTimer(api: APIRequestContext): Promise<void> {
	const res = await api.get('/api/timer');
	const snap = (await res.json()) as { timer: unknown };
	if (snap.timer) await timerCmd(api, { action: 'discard' });
}
