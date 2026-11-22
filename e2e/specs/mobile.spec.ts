/**
 * Touch-only flows (projects mobile-iphone / mobile-ipad): the phone tab bar and its avatar, Plan's "Move to
 * day" picker instead of drag & drop, Review's tap-to-pin tooltips, touch sizing.
 */
import { test, expect, gotoLive, actionDone } from '../support/fixtures.ts';
import { addDays, createQuest, createTask, mondayOf, today, uid } from '../support/db.ts';

test('phone: the floating tab bar navigates between sections @mobile-only', async ({
	page,
	viewport
}) => {
	test.skip(viewport!.width > 720, 'the tab bar is the phone layout');
	await gotoLive(page, '/');
	const nav = page.getByRole('navigation', { name: 'Main' });
	const box = (await nav.boundingBox())!;
	// Floats just above the bottom edge (thumb zone), not in the top bar.
	expect(box.y).toBeGreaterThan(viewport!.height / 2);
	expect(box.y + box.height).toBeLessThanOrEqual(viewport!.height);

	for (const [label, path] of [
		['Plan', '/plan'],
		['Calendar', '/calendar'],
		['Quests', '/quests'],
		['Review', '/review'],
		['Home', '/']
	]) {
		await nav.getByRole('link', { name: label }).tap();
		await expect(page).toHaveURL(new RegExp(`${path}$`));
		await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
		await expect(nav.locator('a[aria-current=page]')).toHaveCount(1);
	}
});

test('phone: the tab bar avatar opens Settings directly, without a menu @mobile-only', async ({
	page,
	viewport
}) => {
	test.skip(viewport!.width > 720, 'the tab bar is the phone layout');
	await gotoLive(page, '/plan');
	const nav = page.getByRole('navigation', { name: 'Main' });
	await expect(nav.getByRole('button')).toHaveCount(0);
	const avatar = nav.getByRole('link', { name: /^Account and devices/ });
	await avatar.tap();
	await expect(page).toHaveURL(/\/settings$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
	await expect(page.getByRole('menu')).toHaveCount(0);
	await expect(avatar).toHaveAttribute('aria-current', 'page');
	await expect(nav.locator('a[aria-current=page]')).toHaveCount(1);
});

test('Plan: ⋯ "Move to day" moves a card without drag & drop @mobile-only', async ({
	page,
	sql,
	viewport
}) => {
	const id = uid();
	const monday = addDays(mondayOf(await today(sql)), 7);
	const quest = await createQuest(sql, { name: `Touch ${id}` });
	const task = await createTask(sql, { title: `Tap move ${id}`, questId: quest.id, day: monday });
	const sat = addDays(monday, 5);
	await gotoLive(page, `/plan?week=${monday}`);

	await page
		.locator('li.task', { hasText: task.title })
		.getByRole('button', { name: `Actions for ${task.title}` })
		.tap();
	const menu = page.getByRole('menu');
	const box = (await menu.boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(viewport!.width);
	await expect(menu.getByRole('menuitem', { name: /^Move to Monday/ })).toBeDisabled();
	const done = actionDone(page, 'moveTo');
	await menu.getByRole('menuitem', { name: /^Move to Saturday/ }).tap();
	await done;

	expect((await sql`select day from tasks where id = ${task.id}`)[0].day).toBe(sat);
	await expect(
		page.locator(`.col[data-day="${sat}"] li.task`, { hasText: task.title })
	).toHaveCount(1);
});

test('Review: tapping a day bar pins its tooltip until a tap elsewhere @mobile-only', async ({
	page
}) => {
	await gotoLive(page, '/review');
	const bar = page.getByTestId('day-bar').first();
	const tip = page.locator('.col', { has: bar }).getByRole('tooltip');
	await expect(tip).toBeHidden();
	await bar.tap();
	// iOS doesn't focus a tapped button (Chromium does, and :focus-within shows the tip too).
	await bar.evaluate((el) => (el as HTMLElement).blur());
	await expect(tip).toBeVisible();
	await page.getByRole('heading', { level: 1 }).tap();
	await expect(tip).toBeHidden();
});

test('touch sizing: inputs ≥ 16px (no iOS zoom), small buttons get ≥ 44px hit areas @mobile-only', async ({
	page,
	sql
}) => {
	await createTask(sql, { title: `Touch size ${uid()}`, day: await today(sql) });
	await gotoLive(page, '/');
	const fontSize = await page
		.getByPlaceholder('Add quest work…')
		.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
	expect(fontSize).toBeGreaterThanOrEqual(16);
	const hit = await page
		.locator('li.task button[aria-label="Move up"]')
		.first()
		.evaluate((el) => {
			const after = getComputedStyle(el, '::after');
			return { w: parseFloat(after.width), h: parseFloat(after.height) };
		});
	expect(hit.w).toBeGreaterThanOrEqual(44);
	expect(hit.h).toBeGreaterThanOrEqual(44);
});
