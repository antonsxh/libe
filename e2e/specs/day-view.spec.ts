/**
 * Phone day view of Plan and Calendar (≤ 720px): the day strip and `?day=`, swiping between
 * days (across week boundaries), Plan's backlog sheet and Calendar's one-day grid. iPad and
 * desktop keep the week board / grid → skipped there.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect, gotoLive, reloadLive, actionDone } from '../support/fixtures.ts';
import {
	addDays,
	createQuest,
	createSession,
	createTask,
	emptyPastWeek,
	mondayOf,
	today,
	uid,
	type Sql
} from '../support/db.ts';

test.beforeEach(async ({ viewport }) => {
	test.skip(viewport!.width > 720, 'the day view is the phone layout');
});

const nextMonday = async (sql: Sql) => addDays(mondayOf(await today(sql)), 7);
const params = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);
const strip = (page: Page) => page.getByRole('navigation', { name: 'Days' });
const card = (page: Page, title: string) => page.locator('li.task', { hasText: title });
const dayRow = (page: Page) => page.locator('.col.sel');

/** Let running animations (strip pill, day slide, sheet) settle before measuring positions. */
async function settle(page: Page) {
	await page.evaluate(() =>
		Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null)))
	);
}

/**
 * A real touch drag (Chromium touch events over CDP): the browser pans vertically itself
 * (`touch-action: pan-y`), sideways moves reach the page as pointer events.
 */
async function touchDrag(page: Page, from: Locator, dx: number, dy: number) {
	await from.scrollIntoViewIfNeeded();
	await settle(page);
	const box = (await from.boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	const cdp = await page.context().newCDPSession(page);
	const at = (px: number, py: number) => [{ x: Math.round(px), y: Math.round(py), id: 1 }];
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(x, y) });
	const steps = 15;
	for (let i = 1; i <= steps; i++) {
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: at(x + (dx * i) / steps, y + (dy * i) / steps)
		});
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await cdp.detach();
}

test('Plan: the day strip picks the day (kept on reload); adding lands on that day and stays there @mobile', async ({
	page,
	sql
}) => {
	const id = uid();
	const monday = await nextMonday(sql);
	const wed = addDays(monday, 2);
	const quest = await createQuest(sql, { name: `Day view ${id}` });
	const monTask = await createTask(sql, { title: `Monday ${id}`, questId: quest.id, day: monday });
	const wedTask = await createTask(sql, { title: `Wednesday ${id}`, questId: quest.id, day: wed });

	// Another week without ?day= → its Monday.
	await gotoLive(page, `/plan?week=${monday}`);
	await expect(card(page, monTask.title)).toBeVisible();
	await expect(card(page, wedTask.title)).toBeHidden();

	await strip(page)
		.getByRole('link', { name: /^Wednesday/ })
		.tap();
	await expect(card(page, wedTask.title)).toBeVisible();
	await expect(card(page, monTask.title)).toBeHidden();
	expect(params(page)).toMatchObject({ week: monday, day: wed });
	await expect(strip(page).getByRole('link', { name: /^Wednesday/ })).toHaveAttribute(
		'aria-current',
		'true'
	);

	await reloadLive(page);
	await expect(card(page, wedTask.title)).toBeVisible();
	await expect(card(page, monTask.title)).toBeHidden();

	const add = dayRow(page).locator('form.add').first();
	await add.getByPlaceholder('Add a task…').fill(`Added ${id}`);
	const done = actionDone(page, 'add');
	await add.getByRole('button', { name: 'Add', exact: true }).tap();
	await done;
	expect((await sql`select day from tasks where title = ${`Added ${id}`}`)[0].day).toBe(wed);
	await expect(card(page, `Added ${id}`)).toBeVisible();
	expect(params(page)).toMatchObject({ week: monday, day: wed });
});

test('Plan: swiping left on Sunday shows next week’s Monday; a vertical scroll keeps the day @mobile', async ({
	page,
	sql
}) => {
	const id = uid();
	const monday = await nextMonday(sql);
	const sun = addDays(monday, 6);
	const after = addDays(monday, 7);
	const quest = await createQuest(sql, { name: `Swipe ${id}` });
	// Enough cards for the page to scroll vertically below the first one (earlier runs' cards
	// for the same Sunday sit above them: `--repeat-each`).
	for (let i = 0; i < 14; i++)
		await createTask(sql, { title: `Sunday ${i} ${id}`, questId: quest.id, day: sun });
	const next = await createTask(sql, { title: `Next Monday ${id}`, questId: quest.id, day: after });

	await gotoLive(page, `/plan?week=${monday}&day=${sun}`);
	const first = card(page, `Sunday 0 ${id}`);
	await expect(first).toBeVisible();

	// Vertical: the page scrolls, the day stays (also with some sideways drift).
	const scrollY = () => page.evaluate(() => window.scrollY);
	const middle = card(page, `Sunday 3 ${id}`).locator('.title');
	await first.evaluate((el) => el.scrollIntoView({ block: 'start' }));
	const y0 = await scrollY();
	await touchDrag(page, middle, -30, -300);
	await expect.poll(scrollY).toBeGreaterThan(y0);
	expect(params(page)).toMatchObject({ week: monday, day: sun });
	await expect(first).toBeVisible();

	// A pointer that starts vertically stays a scroll even after drifting far sideways
	// (mouse/pen: no browser panning decides it for us).
	const box = (await middle.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 - 6, box.y + box.height / 2 - 30);
	await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2 - 60, { steps: 8 });
	await page.mouse.up();
	await settle(page);
	expect(params(page)).toMatchObject({ week: monday, day: sun });
	await expect(first).toBeVisible();

	// Sideways to the left → the next day, across the week boundary.
	await touchDrag(page, first.locator('.title'), -260, 0);
	await expect(card(page, next.title)).toBeVisible();
	await expect(first).toBeHidden();
	expect(params(page)).toMatchObject({ week: after, day: after });
	await expect(strip(page).getByRole('link', { name: /^Monday/ })).toHaveAttribute(
		'aria-current',
		'true'
	);

	// And back to the right → Sunday of the previous week again.
	await touchDrag(page, card(page, next.title).locator('.title'), 260, 0);
	await expect(first).toBeVisible();
	expect(params(page)).toMatchObject({ week: monday, day: sun });
});

test('Plan and Calendar: swiping the day strip changes the week (same weekday, kept on reload); "Today" returns @mobile', async ({
	page,
	sql
}) => {
	const id = uid();
	const now = await today(sql);
	const monday = await nextMonday(sql);
	const wed = addDays(monday, 2);
	const later = addDays(wed, 7);
	const quest = await createQuest(sql, { name: `Week swipe ${id}` });
	const here = await createTask(sql, { title: `This Wed ${id}`, questId: quest.id, day: wed });
	const there = await createTask(sql, { title: `Next Wed ${id}`, questId: quest.id, day: later });

	await gotoLive(page, `/plan?week=${monday}&day=${wed}`);
	await expect(card(page, here.title)).toBeVisible();
	// No ‹ › on phones: the strip is the week navigation.
	await expect(page.getByRole('link', { name: 'Next week' })).toBeHidden();

	// Left → the next week, the same weekday.
	await touchDrag(page, strip(page), -220, 0);
	await expect(card(page, there.title)).toBeVisible();
	expect(params(page)).toMatchObject({ week: addDays(monday, 7), day: later });
	await reloadLive(page);
	await expect(card(page, there.title)).toBeVisible();
	await expect(strip(page).getByRole('link', { name: /^Wednesday/ })).toHaveAttribute(
		'aria-current',
		'true'
	);

	// Right → back.
	await touchDrag(page, strip(page), 220, 0);
	await expect(card(page, here.title)).toBeVisible();
	expect(params(page)).toMatchObject({ week: monday, day: wed });

	// "Today" → the current week with today selected.
	await settle(page);
	await page.getByRole('link', { name: 'Today', exact: true }).tap();
	await expect(page).toHaveURL(/\/plan\??$/);
	await expect(strip(page).locator(`a[data-day="${now}"]`)).toHaveAttribute('aria-current', 'true');

	// The Calendar's strip moves weeks the same way.
	await gotoLive(page, `/calendar?week=${monday}&day=${wed}`);
	await touchDrag(page, strip(page), -220, 0);
	await expect.poll(() => params(page)).toMatchObject({ week: addDays(monday, 7), day: later });
	await expect(strip(page).locator(`a[data-day="${later}"]`)).toHaveAttribute(
		'aria-current',
		'true'
	);
});

test('Plan: the backlog sheet moves a backlog task to the selected day @mobile', async ({
	page,
	sql
}) => {
	const id = uid();
	const monday = await nextMonday(sql);
	const thu = addDays(monday, 3);
	const quest = await createQuest(sql, { name: `Sheet ${id}` });
	const task = await createTask(sql, { title: `From backlog ${id}`, questId: quest.id });

	await gotoLive(page, `/plan?week=${monday}&day=${thu}`);
	await page.getByRole('button', { name: 'Backlog', exact: true }).tap();
	const sheet = page.getByRole('dialog', { name: 'Backlog' });
	await expect(sheet).toBeVisible();
	await settle(page);

	const done = actionDone(page, 'moveTo');
	const label = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${thu}T12:00:00Z`));
	await sheet.getByRole('button', { name: `Move to ${label}: ${task.title}` }).tap();
	await done;
	expect((await sql`select day from tasks where id = ${task.id}`)[0].day).toBe(thu);
	await expect(sheet.getByText(task.title)).toHaveCount(0);

	await sheet.getByRole('button', { name: 'Close' }).tap();
	await expect(sheet).toBeHidden();
	await expect(card(page, task.title)).toBeVisible();
	expect(params(page)).toMatchObject({ week: monday, day: thu });
});

test('Calendar: the day view shows one day; tapping an empty slot logs a session there @mobile', async ({
	page,
	sql
}) => {
	const id = uid();
	const monday = await emptyPastWeek(sql);
	const thu = addDays(monday, 3);
	const task = await createTask(sql, { title: `Day slot ${id}` });
	// One session on Monday, so the week shows its grid (an empty week shows its empty state).
	const other = await createTask(sql, { title: `Day slot neighbour ${id}` });
	await createSession(sql, { taskId: other.id, day: monday, start: '10:00', minutes: 30 });

	await gotoLive(page, `/calendar?week=${monday}`);
	await strip(page)
		.getByRole('link', { name: /^Thursday/ })
		.tap();
	await expect(page).toHaveURL(new RegExp(`day=${thu}`));
	const slot = page.getByRole('button', { name: /^Log time on/ });
	await expect(slot).toHaveCount(1); // only the selected day is shown
	await expect(slot).toHaveAccessibleName(/Thu/);
	await settle(page);

	// No session before 6:00 → grid starts at 6:00; 50 px per hour below a 10 px pad. 13:22 → 13:15.
	// The grid scrolls inside its card: bring 12:00 to its top so the point is on screen.
	await slot.evaluate((el) => (el.closest('.cal')!.scrollTop = 6 * 50));
	const box = (await slot.boundingBox())!;
	await page.touchscreen.tap(box.x + 60, box.y + 10 + ((13 * 60 + 22 - 6 * 60) / 60) * 50);
	const dialog = page.getByRole('dialog', { name: 'Log time' });
	await expect(dialog.getByLabel('Start date')).toHaveValue(thu);
	await expect(dialog.getByLabel('Start time')).toHaveValue('13:15');
	await dialog.getByPlaceholder('Search tasks…').fill(id);
	await dialog.getByRole('radiogroup', { name: 'Task' }).getByText(task.title).tap();
	await dialog.getByRole('button', { name: 'Log time' }).tap();
	await expect(dialog).toBeHidden();

	const [row] = await sql`
		select id, to_char(started_at at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI') as start
		from sessions where task_id = ${task.id}`;
	expect(row.start).toBe(`${thu} 13:15`);
	await reloadLive(page);
	expect(params(page)).toMatchObject({ day: thu });
	await expect(page.locator(`[data-session="${row.id}"]`)).toBeVisible();
});
