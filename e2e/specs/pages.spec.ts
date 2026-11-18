/**
 * One smoke test per page, on desktop and (tagged @mobile) on iPhone/iPad: the page renders
 * (HTTP 200, its heading), the timer stream connects, no console errors (fixture), and the
 * page itself never scrolls sideways — wide content (plan board, calendar) scrolls in its box.
 */
import { test, expect, live, expectNoHorizontalScroll } from '../support/fixtures.ts';

const PAGES: { path: string; heading: RegExp; public?: boolean }[] = [
	{ path: '/', heading: /day/ },
	{ path: '/plan', heading: /^Plan the week$/ },
	{ path: '/calendar', heading: /^Calendar$/ },
	{ path: '/focus', heading: /./ },
	{ path: '/quests', heading: /^Quests$/ },
	{ path: '/quests/:seeded', heading: /./ },
	{ path: '/review', heading: /^Weekly review$/ },
	{ path: '/settings', heading: /^Settings$/ },
	{ path: '/pair', heading: /^Pair this device$/, public: true },
	{ path: '/setup', heading: /./, public: true },
	{ path: '/offline', heading: /^You’re offline$/, public: true }
];

for (const p of PAGES) {
	test(`${p.path} renders cleanly without page-level horizontal scroll @mobile`, async ({
		page,
		sql
	}) => {
		let path = p.path;
		if (path.includes(':seeded')) {
			const [q] =
				await sql`select id from quests where closed_at is null order by sort_order limit 1`;
			path = path.replace(':seeded', q.id);
		}
		const res = await page.goto(path);
		expect(res?.status()).toBe(200);
		if (!p.public) await live(page);
		await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(p.heading);
		await expectNoHorizontalScroll(page);
	});
}
