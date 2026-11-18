/**
 * M3 — Plan the week: week navigation, query state surviving mutations, Other zones, drag &
 * drop (days, within a day, backlog) without ever changing a task's kind, backlog rail menu,
 * board scroll position.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect, gotoLive, actionDone, reloadLive } from '../support/fixtures.ts';
import { addDays, createQuest, createTask, mondayOf, today, uid, type Sql } from '../support/db.ts';

const column = (page: Page, day: string) => page.locator(`.col[data-day="${day}"]`);
const questCards = (col: Locator) => col.locator('.body > ul.cards li.task .title');
const card = (scope: Locator | Page, title: string) => scope.locator('li.task', { hasText: title });
const rail = (page: Page) => page.getByRole('region', { name: 'Backlog' });
const params = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams);

async function task(sql: Sql, id: string) {
	const [row] = await sql`select day, kind, quest_id, sort_order from tasks where id = ${id}`;
	return row;
}

/** Titles of a day's quest list, in the server's list order. */
async function dayOrder(sql: Sql, day: string, kind: 'quest' | 'other', like: string) {
	const rows = await sql`
		select title from tasks where day = ${day} and kind = ${kind} and title like ${`%${like}`}
		order by sort_order, created_at`;
	return rows.map((r) => r.title);
}

/** Next week: the board starts at the left there, so Mon–Wed are on screen. */
async function nextMonday(sql: Sql): Promise<string> {
	return addDays(mondayOf(await today(sql)), 7);
}

test('week navigation: ‹ › and Today; ?week= takes any day of a week', async ({ page, sql }) => {
	const monday = mondayOf(await today(sql));
	const days = async () =>
		page
			.locator('.col[data-day]')
			.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.day));

	await gotoLive(page, '/plan');
	expect(await days()).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i)));
	await expect(page.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'date');

	await page.getByRole('link', { name: 'Next week' }).click();
	await expect(page).toHaveURL(new RegExp(`week=${addDays(monday, 7)}`));
	expect((await days())[0]).toBe(addDays(monday, 7));
	await expect(page.getByRole('link', { name: 'Today' })).not.toHaveAttribute(
		'aria-current',
		'date'
	);
	await page.getByRole('link', { name: 'Previous week' }).click();
	await page.getByRole('link', { name: 'Previous week' }).click();
	expect((await days())[0]).toBe(addDays(monday, -7));
	await page.getByRole('link', { name: 'Today' }).click();
	await expect(page).toHaveURL(/\/plan\??$/);
	expect((await days())[0]).toBe(monday);

	// A Thursday shows its week; garbage falls back to the current week.
	await gotoLive(page, '/plan?week=2026-12-31');
	expect(await days()).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => addDays('2026-12-28', i)));
	await expect(page.locator('.week-nav .month')).toHaveText('Dec 2026 – Jan 2027');
	await gotoLive(page, '/plan?week=not-a-day');
	expect((await days())[0]).toBe(monday);
});

test('?week, ?q, ?hideDone and ?other survive adds and ⋯ moves', async ({ page, sql }) => {
	const id = uid();
	const monday = await nextMonday(sql);
	const tue = addDays(monday, 1);
	const qa = await createQuest(sql, { name: `Keep A ${id}` });
	const qb = await createQuest(sql, { name: `Keep B ${id}` });
	const a = await createTask(sql, { title: `A work ${id}`, questId: qa.id, day: tue });
	await createTask(sql, { title: `B work ${id}`, questId: qb.id, day: tue });
	await createTask(sql, { title: `Other open ${id}`, day: tue });
	await createTask(sql, { title: `Other done ${id}`, day: tue, done: true });

	const query = { week: monday, q: qa.id, hideDone: '1', other: tue };
	await gotoLive(page, `/plan?${new URLSearchParams(query)}`);
	const col = column(page, tue);
	const check = async () => {
		expect(params(page)).toEqual(query);
		await expect(card(col, `A work ${id}`)).toBeVisible();
		await expect(card(col, `B work ${id}`)).toHaveCount(0);
		await expect(card(col, `Other open ${id}`)).toBeVisible();
		await expect(card(col, `Other done ${id}`)).toHaveCount(0);
	};
	await check();

	const add = col.locator('form.add').first();
	await add.getByPlaceholder('Add a task…').fill(`Added ${id}`);
	let done = actionDone(page, 'add');
	await add.getByRole('button', { name: 'Add at the bottom' }).click();
	await done;
	await expect(card(col, `Added ${id}`)).toBeVisible();
	await check();
	expect((await sql`select quest_id, day from tasks where title = ${`Added ${id}`}`)[0]).toEqual({
		quest_id: qa.id,
		day: tue
	});

	await card(col, a.title)
		.getByRole('button', { name: `Actions for ${a.title}` })
		.click();
	done = actionDone(page, 'nextDay');
	await page.getByRole('menuitem', { name: 'Move to next day' }).click();
	await done;
	expect((await task(sql, a.id)).day).toBe(addDays(tue, 1));
	await expect(card(column(page, addDays(tue, 1)), a.title)).toBeVisible();
	expect(params(page)).toEqual(query);
});

test('"Other" from the picker creates an other task in the day\'s Other zone; its state is in the URL', async ({
	page,
	sql
}) => {
	const id = uid();
	const monday = await nextMonday(sql);
	const wed = addDays(monday, 2);
	await gotoLive(page, `/plan?week=${monday}`);
	const col = column(page, wed);

	const add = col.locator('form.add').first();
	await add.getByRole('button', { name: /^Quest: .* \(change\)$/ }).click();
	await page.getByRole('menuitemradio', { name: 'Other' }).click();
	await add.getByPlaceholder('Add a task…').fill(`Errand ${id}`);
	const done = actionDone(page, 'add');
	await add.getByPlaceholder('Add a task…').press('Enter');
	await done;
	expect(
		(await sql`select kind, quest_id, day from tasks where title = ${`Errand ${id}`}`)[0]
	).toEqual({
		kind: 'other',
		quest_id: null,
		day: wed
	});

	const toggle = col.getByRole('button', { name: /^Other\s*\d+$/ });
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await expect(questCards(col)).not.toContainText([`Errand ${id}`]);
	await toggle.click();
	await expect(page).toHaveURL(new RegExp(`other=${wed}`));
	await expect(card(col.locator('.other'), `Errand ${id}`)).toBeVisible();
	await reloadLive(page);
	await expect(card(col.locator('.other'), `Errand ${id}`)).toBeVisible();
	await col.getByRole('button', { name: /^Other\s*\d+$/ }).click();
	await expect(page).not.toHaveURL(/other=/);
	await expect(card(col, `Errand ${id}`)).toBeHidden();
});

test('drag & drop moves cards across days and within a day, before the card under the pointer', async ({
	page,
	sql
}) => {
	const id = uid();
	const monday = await nextMonday(sql);
	const tue = addDays(monday, 1);
	const quest = await createQuest(sql, { name: `Drag ${id}` });
	const m1 = await createTask(sql, { title: `M1 ${id}`, questId: quest.id, day: monday });
	const t1 = await createTask(sql, { title: `T1 ${id}`, questId: quest.id, day: tue });
	const t2 = await createTask(sql, { title: `T2 ${id}`, questId: quest.id, day: tue });
	await gotoLive(page, `/plan?week=${monday}&q=${quest.id}`);

	// Upper half of T2 → M1 goes in front of T2.
	let done = actionDone(page, 'moveTo');
	await card(page, m1.title).dragTo(card(column(page, tue), t2.title), {
		targetPosition: { x: 20, y: 4 }
	});
	await done;
	expect(await dayOrder(sql, tue, 'quest', id)).toEqual([t1.title, m1.title, t2.title]);
	await expect(questCards(column(page, tue))).toHaveText([t1.title, m1.title, t2.title]);
	await expect(questCards(column(page, monday))).toHaveCount(0);

	// Within the day: T2 onto the upper half of T1 → first.
	done = actionDone(page, 'moveTo');
	await card(page, t2.title).dragTo(card(column(page, tue), t1.title), {
		targetPosition: { x: 20, y: 4 }
	});
	await done;
	expect(await dayOrder(sql, tue, 'quest', id)).toEqual([t2.title, t1.title, m1.title]);

	// Empty space below the cards = end of the list.
	done = actionDone(page, 'moveTo');
	await card(page, t2.title).dragTo(column(page, tue), {
		targetPosition: { x: 40, y: (await column(page, tue).boundingBox())!.height - 10 }
	});
	await done;
	await reloadLive(page);
	await expect(questCards(column(page, tue))).toHaveText([t1.title, m1.title, t2.title]);
});

test('drag & drop to and from the backlog; a task never changes its kind', async ({
	page,
	sql
}) => {
	const id = uid();
	const monday = await nextMonday(sql);
	const wed = addDays(monday, 2);
	const quest = await createQuest(sql, { name: `Kind ${id}` });
	const qt = await createTask(sql, { title: `Quest task ${id}`, questId: quest.id, day: monday });
	const ot = await createTask(sql, { title: `Other task ${id}`, day: monday });
	const bl = await createTask(sql, { title: `Backlog task ${id}`, questId: quest.id });
	await createTask(sql, { title: `Wed quest ${id}`, questId: quest.id, day: wed });
	await gotoLive(page, `/plan?week=${monday}&other=${monday}`);

	// An other task dropped onto Wednesday's quest cards lands in Wednesday's Other list.
	let done = actionDone(page, 'moveTo');
	await card(page, ot.title).dragTo(card(column(page, wed), `Wed quest ${id}`));
	await done;
	expect(await task(sql, ot.id)).toMatchObject({ day: wed, kind: 'other', quest_id: null });
	const [{ n }] =
		await sql`select count(*)::int as n from tasks where day = ${wed} and kind = 'other'`;
	await column(page, wed)
		.getByRole('button', { name: `Other ${n}` })
		.click();
	await expect(card(column(page, wed).locator('.other'), ot.title)).toBeVisible();
	await expect(questCards(column(page, wed)).filter({ hasText: id })).toHaveText([
		`Wed quest ${id}`
	]);

	// Day → backlog rail: the quest task joins its quest's backlog group.
	done = actionDone(page, 'moveTo');
	const railBox = (await rail(page).boundingBox())!;
	await card(page, qt.title).dragTo(rail(page), {
		targetPosition: { x: railBox.width / 2, y: railBox.height - 10 }
	});
	await done;
	expect(await task(sql, qt.id)).toMatchObject({ day: null, kind: 'quest', quest_id: quest.id });
	const group = rail(page).locator('.group', { hasText: quest.name });
	await expect(group.locator('.rtitle')).toContainText([bl.title, qt.title]);

	// Backlog → a day column.
	done = actionDone(page, 'moveTo');
	// Below every card of the day (other runs may have filled it) = end of its quest list.
	const wedBox = (await column(page, wed).boundingBox())!;
	await rail(page)
		.locator('li.row', { hasText: bl.title })
		.dragTo(column(page, wed), { targetPosition: { x: wedBox.width / 2, y: wedBox.height - 10 } });
	await done;
	expect(await task(sql, bl.id)).toMatchObject({ day: wed, kind: 'quest' });
	await expect(questCards(column(page, wed)).filter({ hasText: id })).toHaveText([
		`Wed quest ${id}`,
		bl.title
	]);
});

test('backlog rail ⋯ Move to today and Delete', async ({ page, sql }) => {
	const id = uid();
	const day = await today(sql);
	const quest = await createQuest(sql, { name: `Rail ${id}` });
	const move = await createTask(sql, { title: `Rail move ${id}`, questId: quest.id });
	const del = await createTask(sql, { title: `Rail other ${id}` });
	await gotoLive(page, '/plan');

	const row = (title: string) => rail(page).locator('li.row', { hasText: title });
	await row(move.title)
		.getByRole('button', { name: `Actions for ${move.title}` })
		.click();
	let done = actionDone(page, 'moveTo');
	await page.getByRole('menuitem', { name: 'Move to today' }).click();
	await done;
	expect((await task(sql, move.id)).day).toBe(day);
	await expect(card(column(page, day), move.title)).toBeVisible();

	// "Other" tasks without a day have their own backlog group.
	await expect(rail(page).locator('.group', { hasText: 'Other' }).locator('.rtitle')).toContainText(
		[del.title]
	);
	await row(del.title)
		.getByRole('button', { name: `Actions for ${del.title}` })
		.click();
	done = actionDone(page, 'deleteTask');
	await page.getByRole('menuitem', { name: 'Delete' }).click();
	await done;
	await expect(row(del.title)).toHaveCount(0);
	expect(await sql`select 1 from tasks where id = ${del.id}`).toHaveLength(0);
});

test.describe('narrow board', () => {
	test.use({ viewport: { width: 900, height: 900 } });

	test("today is scrolled into view once; mutations don't move the board", async ({
		page,
		sql
	}) => {
		const day = await today(sql);
		await gotoLive(page, '/plan');
		const board = page.locator('.board');
		const inView = async () => {
			const b = (await board.boundingBox())!;
			const c = (await column(page, day).boundingBox())!;
			return c.x >= b.x - 1 && c.x + c.width <= b.x + b.width + 1;
		};
		await expect.poll(inView).toBe(true);

		// Scroll to whichever end hides today's column, then mutate the page.
		const max = await board.evaluate((el) => el.scrollWidth - el.clientWidth);
		await board.evaluate((el) => (el.scrollLeft = 0));
		const target = (await inView()) ? max : 0;
		await board.evaluate((el, x) => (el.scrollLeft = x), target);
		expect(await inView()).toBe(false);

		// Submit without focusing anything on the board (focus would scroll it by itself).
		const done = actionDone(page, 'addBacklog');
		await rail(page)
			.locator('form.add')
			.evaluate((form: HTMLFormElement, title) => {
				(form.elements.namedItem('title') as HTMLInputElement).value = title;
				form.requestSubmit();
			}, `Scroll ${uid()}`);
		await done;
		expect(await board.evaluate((el) => el.scrollLeft)).toBe(target);
	});
});
