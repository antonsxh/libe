/**
 * libe service worker — installability + an offline page, nothing more.
 *
 * - Precaches the immutable build output (hashed JS/CSS/fonts), the static icons/manifest and
 *   the public `/offline` page.
 * - Navigations always go to the network (pages are personal, live data); when the network
 *   is down the cached `/offline` page is shown instead.
 * - Never touches `/api/**` (incl. the timer SSE stream), page data requests, `/pair` and
 *   `/setup` — they pass straight through and are never cached.
 * - Old caches are deleted on activate.
 *
 * Registered by the root layout in production builds only. Service workers need HTTPS
 * (or localhost).
 */
import { self } from '$app/service-worker';
import { assets, immutable } from '$app/manifest';
import { version } from '$app/env';

const CACHE = `libe-${version}`;
const OFFLINE_URL = '/offline';

/** Build output is content-hashed; static files are few and small (icons, manifest). */
const PRECACHE = [
	...immutable.map((f) => `/${f.path.replace(/^\//, '')}`),
	...assets.map((f) => `/${f.path.replace(/^\//, '')}`)
];
const CACHEABLE = new Set(PRECACHE);

/** Paths the worker must never answer from a cache. */
function bypass(url: URL): boolean {
	const p = url.pathname;
	return (
		p.startsWith('/api/') ||
		p === '/pair' ||
		p.startsWith('/pair/') ||
		p === '/setup' ||
		p.endsWith('/__data.json') ||
		p === '/service-worker.js'
	);
}

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(PRECACHE);
			// The offline page is public; fetch it without credentials so no personal HTML lands
			// in the cache by accident.
			const offline = await fetch(OFFLINE_URL, { credentials: 'omit', cache: 'no-store' });
			if (offline.ok) await cache.put(OFFLINE_URL, offline);
			await self.skipWaiting();
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin || bypass(url)) return;
	if (request.headers.get('accept')?.includes('text/event-stream')) return;

	// Pages: network only; offline → the cached offline page.
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => {
				const cached = await caches.match(OFFLINE_URL);
				return cached ?? new Response('Offline', { status: 503, statusText: 'Offline' });
			})
		);
		return;
	}

	// Precached build/static files: cache first (they never change under the same name).
	if (CACHEABLE.has(url.pathname)) {
		event.respondWith(
			(async () => {
				const cache = await caches.open(CACHE);
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
				const response = await fetch(request);
				if (response.ok) await cache.put(url.pathname, response.clone());
				return response;
			})()
		);
	}
	// Everything else: default browser handling.
});
