/**
 * M7 — PWA: everything the page head and the manifest reference is public and matches its
 * declaration; the service worker caches only the shell (never personal HTML/API); with the
 * server down navigations fall back to the cached offline page.
 */
import { test, expect, live } from '../support/fixtures.ts';
import { BASE, E2E_DB } from '../support/env.ts';
import { storageStateFor } from '../support/auth.ts';
import { AppServer } from '../support/server.ts';

/** PNG width/height from the IHDR chunk. */
const pngSize = (buf: ArrayBuffer) => {
	const v = new DataView(buf);
	return `${v.getUint32(16)}x${v.getUint32(20)}`;
};

test('every icon and manifest the page head and the manifest reference is public and as declared', async ({
	page
}) => {
	await page.goto('/pair'); // public page, same <head> as every page
	const links = await page
		.locator('head link[rel]')
		.evaluateAll((els) =>
			els
				.map((el) => ({ rel: el.getAttribute('rel')!, href: (el as HTMLLinkElement).href }))
				.filter((l) => /icon|manifest/.test(l.rel))
		);
	expect(links.map((l) => l.rel)).toEqual(expect.arrayContaining(['manifest', 'apple-touch-icon']));

	const manifestUrl = links.find((l) => l.rel === 'manifest')!.href;
	const res = await fetch(manifestUrl);
	expect(res.headers.get('content-type')).toMatch(/^application\/manifest\+json/);
	const manifest = (await res.json()) as { icons: { src: string; sizes: string; type: string }[] };

	const assets = [
		...links
			.filter((l) => l.rel !== 'manifest')
			.map((l) => ({ src: l.href, sizes: null, type: null })),
		...manifest.icons.map((i) => ({ ...i, src: new URL(i.src, BASE).href }))
	];
	for (const icon of assets) {
		const r = await fetch(icon.src, { redirect: 'manual' }); // no device cookie
		expect([icon.src, r.status]).toEqual([icon.src, 200]);
		const type = r.headers.get('content-type') ?? '';
		expect(type, icon.src).toMatch(/^image\//);
		if (icon.type) expect(type, icon.src).toContain(icon.type);
		if (icon.sizes && icon.type === 'image/png')
			expect(pngSize(await r.arrayBuffer()), icon.src).toBe(icon.sizes);
	}
});

test.describe('service worker', () => {
	test.use({ serviceWorkers: 'allow' });

	test('caches only the shell and the offline page — no personal pages, no API', async ({
		page
	}) => {
		await page.goto('/');
		await live(page);
		await page.evaluate(() => navigator.serviceWorker.ready);
		// Visit personal pages and the API under the worker's control.
		await page.reload();
		await live(page);
		await page.goto('/plan');
		await live(page);
		await page.evaluate(() => fetch('/api/timer'));

		const cache = await page.evaluate(async () => {
			const keys = await caches.keys();
			const urls = [];
			for (const k of keys)
				for (const r of await (await caches.open(k)).keys()) urls.push(new URL(r.url).pathname);
			return { keys, urls, controlled: !!navigator.serviceWorker.controller };
		});
		expect(cache.controlled).toBe(true);
		expect(cache.keys).toHaveLength(1);
		expect(cache.urls).toContain('/offline');
		expect(cache.urls.some((u) => u.startsWith('/_app/immutable/'))).toBe(true);
		const personal = cache.urls.filter(
			(u) =>
				u === '/' ||
				u === '/plan' ||
				u.startsWith('/api') ||
				u.includes('__data.json') ||
				u.startsWith('/pair') ||
				u === '/setup'
		);
		expect(personal).toEqual([]);
	});

	test('with the server down, navigations show the cached offline page', async ({
		browser,
		token
	}) => {
		const server = new AppServer(3126, E2E_DB);
		await server.start();
		const ctx = await browser.newContext({
			storageState: storageStateFor(server.base, token),
			serviceWorkers: 'allow',
			baseURL: server.base
		});
		try {
			const page = await ctx.newPage();
			await page.goto('/');
			await live(page);
			await page.evaluate(() => navigator.serviceWorker.ready);
			await page.reload();
			await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

			await server.stop();
			await page.goto('/plan').catch(() => {});
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('You’re offline');

			await server.start();
			await page.goto('/plan');
			await live(page);
			await expect(page.getByRole('heading', { level: 1 })).toHaveText('Plan the week');
		} finally {
			await ctx.close();
			await server.stop();
		}
	});
});
