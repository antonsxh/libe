/**
 * Overdue tasks (planned before today, not done, kind other or an open quest): Home's Overdue
 * group above "Today" (every width; 3 rows + "Show N more"), "Today" / "All to today" (order kept), the nav dot, Plan's Overdue group (drag
 * onto a day) and past-day marker, and the palette action. Nothing is ever moved without an
 * explicit action; done tasks and closed quests' tasks never count.
 *
 * "All to today" and the palette move *every* overdue task — the seed's past days included — so
 * those tests put every task they did not create back where it was (`keepOthers`).
 */
import type { Page } from '@playwright/test';
import { test, expect, gotoLive, actionDone, reloadLive } from '../support/fixtures.ts';
import { addDays, createQuest, createTask, mondayOf, today, uid, type Sql } from '../support/db.ts';

/** Quests made here are closed afterwards: their tasks leave every overdue list and picker. */
const made: string[] = [];
test.afterEach(async ({ sql }) => {
	if (made.length > 0) await sql`update quests set closed_at = now() where id in ${sql(made)}`;
	made.length = 0;
});
async function openQuest(sql: Sql, name: string) {
	const q = await createQuest(sql, { name });
	made.push(q.id);
	return q;
}

const card = (page: Page) => page.getByTestId('overdue');
const todayTitles = (page: Page) =>
	page.getByTestId('today-list').locator('li.task .title').allTextContents();
const row = (scope: ReturnType<Page['locator']>, title: string) =>
	scope.locator('li', { hasText: title });

/** Put a task first in Home's group (yesterday's list starts with it), so the 3-row preview shows it. */
async function first(sql: Sql, id: string) {
	await sql`update tasks set sort_order = -1000000 where id = ${id}`;
}

async function dayOf(sql: Sql, id: string): Promise<string | null> {
	const [r] = await sql`select day from tasks where id = ${id}`;
	return r.day;
}

/** The SQL definition of "overdue", independent of the app's code. */
async function overdueCount(sql: Sql): Promise<number> {
	const [r] = await sql`
		select count(*)::int as n from tasks t left join quests q on q.id = t.quest_id
		where t.day < ${await today(sql)} and t.done_at is null
			and (t.kind = 'other' or q.closed_at is null)`;
	return r.n;
}

/** Run `fn`, then restore day + position of every task not titled `… <id>`. */
async function keepOthers(sql: Sql, id: string, fn: () => Promise<void>) {
	const others = await sql`select id, day, sort_order from tasks where title not like ${`% ${id}`}`;
	try {
		await fn();
	} finally {
		for (const t of others)
			await sql`update tasks set day = ${t.day}, sort_order = ${t.sort_order} where id = ${t.id}`;
	}
}

test('Home lists an overdue task; "Today" moves it to the end of today\'s list — after a reload too', async ({
	page,
	sql
}) => {
	const id = uid();
	const day = await today(sql);
	const quest = await openQuest(sql, `Overdue quest ${id}`);
	const already = await createTask(sql, { title: `Planned today ${id}`, questId: quest.id, day });
	const late = await createTask(sql, {
		title: `Forgot this ${id}`,
		questId: quest.id,
		day: addDays(day, -1)
	});
	await first(sql, late.id);

	await gotoLive(page, '/');
	const r = row(card(page), late.title);
	await expect(r).toContainText('yesterday');
	await expect(r).toContainText(quest.name);
	await expect(page.getByRole('link', { name: /^Home, \d+ overdue$/ })).toBeVisible();

	const done = actionDone(page, 'overdueTo');
	await r.getByRole('button', { name: `Move to today: ${late.title}` }).click();
	await done;
	await reloadLive(page);

	expect(await dayOf(sql, late.id)).toBe(day);
	await expect(row(card(page), late.title)).toHaveCount(0);
	const titles = await todayTitles(page);
	expect(titles.indexOf(late.title)).toBeGreaterThan(titles.indexOf(already.title));
	expect(titles.indexOf(already.title)).toBeGreaterThanOrEqual(0);
});

test("done tasks and closed quests' tasks are never overdue; the nav dot counts the rest", async ({
	page,
	sql
}) => {
	const id = uid();
	const yesterday = addDays(await today(sql), -1);
	const open = await openQuest(sql, `Open ${id}`);
	const closed = await createQuest(sql, { name: `Closed ${id}`, closed: true });
	const shown = await createTask(sql, { title: `Shown ${id}`, questId: open.id, day: yesterday });
	const doneTask = await createTask(sql, {
		title: `Done ${id}`,
		questId: open.id,
		day: yesterday,
		done: true
	});
	const hidden = await createTask(sql, {
		title: `Hidden ${id}`,
		questId: closed.id,
		day: yesterday
	});
	for (const t of [shown, doneTask, hidden]) await first(sql, t.id);

	await gotoLive(page, '/');
	await expect(row(card(page), shown.title)).toBeVisible();
	await expect(row(card(page), doneTask.title)).toHaveCount(0);
	await expect(row(card(page), hidden.title)).toHaveCount(0);
	const n = await overdueCount(sql);
	await expect(card(page)).toContainText(`Overdue · ${n}`);
	await expect(page.getByRole('link', { name: `Home, ${n} overdue` })).toBeVisible();

	// Done from the card: it leaves the list but keeps its planned day.
	const toggled = actionDone(page, 'toggle');
	await row(card(page), shown.title).getByRole('button', { name: 'Mark as done' }).click();
	await toggled;
	await reloadLive(page);
	await expect(row(card(page), shown.title)).toHaveCount(0);
	const [r] = await sql`select day, done_at from tasks where id = ${shown.id}`;
	expect(r.day).toBe(yesterday);
	expect(r.done_at).not.toBeNull();
	await expect(page.getByRole('link', { name: `Home, ${n - 1} overdue` })).toBeVisible();
});

test('"All to today" appends every overdue task in display order; Tomorrow and Backlog from ⋯', async ({
	page,
	sql
}) => {
	const id = uid();
	const day = await today(sql);
	const quest = await openQuest(sql, `All ${id}`);
	const present = await createTask(sql, { title: `Present ${id}`, questId: quest.id, day });
	const older = await createTask(sql, {
		title: `Older ${id}`,
		questId: quest.id,
		day: addDays(day, -3)
	});
	const recentB = await createTask(sql, {
		title: `Recent B ${id}`,
		questId: quest.id,
		day: addDays(day, -1)
	});
	const recentA = await createTask(sql, {
		title: `Recent A ${id}`,
		questId: quest.id,
		day: addDays(day, -1)
	});
	await sql`update tasks set sort_order = -1000001 where id = ${recentA.id}`;
	await first(sql, recentB.id);
	const other = await createTask(sql, { title: `Other ${id}`, day: addDays(day, -2) });
	const later = await createTask(sql, {
		title: `Later ${id}`,
		questId: quest.id,
		day: addDays(day, -1)
	});
	const parked = await createTask(sql, {
		title: `Parked ${id}`,
		questId: quest.id,
		day: addDays(day, -1)
	});
	for (const t of [later, parked]) await first(sql, t.id);

	await gotoLive(page, '/');
	// Yesterday's list starts recentA, recentB, later, parked: the preview stops after three,
	// "Show N more" unfolds the rest in place.
	const n = await overdueCount(sql);
	await expect(row(card(page), parked.title)).toHaveCount(0);
	await card(page)
		.getByRole('button', { name: `Show ${n - 3} more` })
		.click();
	await expect(row(card(page), parked.title)).toBeVisible();
	await expect(card(page).locator('li[data-overdue]')).toHaveCount(n);
	const menu = async (title: string, item: string) => {
		await row(card(page), title)
			.getByRole('button', { name: `Actions for ${title}` })
			.click();
		await page.getByRole('menuitem', { name: item }).click();
	};
	let done = actionDone(page, 'overdueTo');
	await menu(later.title, 'Move to tomorrow');
	await done;
	done = actionDone(page, 'toBacklog');
	await menu(parked.title, 'Move to backlog');
	await done;
	expect(await dayOf(sql, later.id)).toBe(addDays(day, 1));
	expect(await dayOf(sql, parked.id)).toBeNull();

	await keepOthers(sql, id, async () => {
		done = actionDone(page, 'overdueTo');
		await card(page).getByRole('button', { name: 'All to today' }).click();
		await done;
		await reloadLive(page);
		await expect(card(page)).toHaveCount(0);

		const quests = await sql`
			select title from tasks where day = ${day} and kind = 'quest' and title like ${`% ${id}`}
			order by sort_order, created_at`;
		expect(quests.map((q) => q.title)).toEqual([
			present.title,
			recentA.title,
			recentB.title,
			older.title
		]);
		expect(await dayOf(sql, other.id)).toBe(day);
		await expect(
			page.getByTestId('today-list').locator('li.task', { hasText: other.title })
		).toBeVisible();
	});
});

test("Plan: the rail's Overdue group drags onto a day; past-day cards carry the marker", async ({
	page,
	sql
}) => {
	const id = uid();
	const day = await today(sql);
	const yesterday = addDays(day, -1);
	const quest = await openQuest(sql, `Plan late ${id}`);
	const late = await createTask(sql, { title: `Drag me ${id}`, questId: quest.id, day: yesterday });
	await first(sql, late.id); // the rail previews the first few rows
	const finished = await createTask(sql, {
		title: `Finished ${id}`,
		questId: quest.id,
		day: yesterday,
		done: true
	});

	// Yesterday's week: the open card is marked, the done one is not.
	await gotoLive(page, `/plan?week=${mondayOf(yesterday)}`);
	const col = page.locator(`.col[data-day="${yesterday}"]`);
	await expect(col.locator('li.task', { hasText: late.title })).toContainText('Overdue');
	await expect(col.locator('li.task', { hasText: finished.title })).not.toContainText('Overdue');

	// Next week: the board starts at the left (rail and Mon–Wed on screen).
	const nextTue = addDays(mondayOf(day), 8);
	await gotoLive(page, `/plan?week=${addDays(mondayOf(day), 7)}`);
	const group = page.getByRole('region', { name: 'Backlog' }).getByTestId('overdue-group');
	const done = actionDone(page, 'moveTo');
	await row(group, late.title).dragTo(page.locator(`.col[data-day="${nextTue}"]`));
	await done;
	await reloadLive(page);
	expect(await dayOf(sql, late.id)).toBe(nextTue);
	await expect(row(group, late.title)).toHaveCount(0);
	await expect(
		page.locator(`.col[data-day="${nextTue}"] li.task`, { hasText: late.title })
	).toBeVisible();
});

test('the palette moves every overdue task to today', async ({ page, sql }) => {
	const id = uid();
	const day = await today(sql);
	const late = await createTask(sql, { title: `Palette late ${id}`, day: addDays(day, -2) });

	await keepOthers(sql, id, async () => {
		await gotoLive(page, '/review');
		await page.keyboard.press('ControlOrMeta+k');
		await page.getByRole('combobox', { name: /Search pages/ }).fill('overdue');
		const option = page.getByRole('option', { name: /Move overdue tasks to today/ });
		await expect(option).toContainText(`${await overdueCount(sql)} task`);
		await option.click();
		await expect.poll(() => dayOf(sql, late.id)).toBe(day);
		// The layout data follows: no overdue tasks → no dot.
		await expect(page.getByRole('link', { name: /^Home$/ })).toBeVisible();
	});
});

test('phone: the overdue tasks are rows above Today; "Today" there moves the task @mobile', async ({
	page,
	sql,
	viewport
}) => {
	test.skip(viewport!.width > 720, 'the phone layout');
	const id = uid();
	const day = await today(sql);
	const quest = await openQuest(sql, `Phone ${id}`);
	const late = await createTask(sql, {
		title: `Phone late ${id}`,
		questId: quest.id,
		day: addDays(day, -4)
	});
	await gotoLive(page, '/');
	const group = card(page);
	await expect(group.getByRole('button', { name: 'All to today' })).toBeVisible();
	// The group sits above the Today list.
	const groupBox = (await group.boundingBox())!;
	const listBox = (await page.getByTestId('today-list').boundingBox())!;
	expect(groupBox.y).toBeLessThan(listBox.y);

	// Four days late: behind yesterday's rows, so it may sit under "Show N more".
	const more = group.getByRole('button', { name: /^Show \d+ more$/ });
	if (await more.isVisible()) await more.tap();
	const r = row(group, late.title);
	await r.scrollIntoViewIfNeeded();
	await expect(r).toContainText('since');
	await expect(r).toContainText(quest.name);

	const done = actionDone(page, 'overdueTo');
	await r.getByRole('button', { name: `Move to today: ${late.title}` }).tap();
	await done;
	await expect(r).toHaveCount(0);
	expect(await dayOf(sql, late.id)).toBe(day);

	await reloadLive(page);
	await expect(
		page.getByTestId('today-list').locator('li.task', { hasText: late.title })
	).toBeVisible();
});

test('the API validates its input and only moves overdue tasks', async ({ api, sql }) => {
	const id = uid();
	const day = await today(sql);
	const future = await createTask(sql, { title: `Future ${id}`, day: addDays(day, 3) });
	const late = await createTask(sql, { title: `Late ${id}`, day: addDays(day, -1) });

	for (const data of [
		{ to: 'yesterday', all: true },
		{ to: 'today' },
		{ to: 'today', taskIds: ['nope'] },
		{ to: 'today', all: true, taskIds: [late.id] }
	]) {
		expect((await api.post('/api/overdue', { data })).status(), JSON.stringify(data)).toBe(400);
	}
	const res = await api.post('/api/overdue', {
		data: { to: 'tomorrow', taskIds: [future.id, late.id] }
	});
	expect(await res.json()).toEqual({ moved: 1 });
	expect(await dayOf(sql, late.id)).toBe(addDays(day, 1));
	expect(await dayOf(sql, future.id)).toBe(addDays(day, 3));
});
