/**
 * M1 — quests: create/edit with server-side validation, every ⋯ menu action persisting,
 * delete cascade, quest backlog page, card stats.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect, gotoLive, actionDone, reloadLive } from '../support/fixtures.ts';
import { addDays, createQuest, createSession, createTask, today, uid } from '../support/db.ts';

const card = (page: Page, name: string) => page.locator('.quest-card', { hasText: name });
const openGridNames = (page: Page) =>
	page.locator('.grid').first().locator('.quest-card a.name').allTextContents();

async function menuAction(page: Page, quest: string, item: string | RegExp): Promise<Locator> {
	await card(page, quest)
		.getByRole('button', { name: `Actions for ${quest}` })
		.click();
	const entry = page.getByRole('menuitem', { name: item });
	await expect(entry).toBeVisible();
	return entry;
}

test('create a quest: server validation keeps the input, then every field is stored', async ({
	page,
	sql,
	console
}) => {
	console.allow(/status of 400/);
	const name = `Create quest ${uid()}`;
	await gotoLive(page, '/quests');
	await page.getByRole('button', { name: 'New quest' }).first().click();
	const dialog = page.getByRole('dialog', { name: 'New quest' });

	await dialog.getByLabel('Name').fill(name);
	await dialog.getByLabel('Description').fill('Made by the e2e suite');
	// Two emoji — no browser constraint catches this, only the server.
	await dialog.getByLabel('Icon', { exact: true }).fill('🚀🚀');
	await dialog.getByLabel('blue', { exact: true }).check();
	await dialog.getByLabel('Weekly budget · h').fill('7.5');
	await dialog.getByRole('button', { name: 'Create quest' }).click();

	await expect(dialog.getByText('Use exactly one emoji.')).toBeVisible();
	await expect(dialog.getByLabel('Name')).toHaveValue(name);
	expect(await sql`select 1 from quests where name = ${name}`).toHaveLength(0);

	await dialog.getByRole('button', { name: 'Use 📖 as icon' }).click();
	await dialog.getByRole('button', { name: 'Create quest' }).click();
	await expect(dialog).toBeHidden();
	await expect(card(page, name)).toBeVisible();

	const [row] = await sql`
		select description, icon, color, weekly_budget_h, closed_at from quests where name = ${name}`;
	expect(row).toMatchObject({
		description: 'Made by the e2e suite',
		icon: '📖',
		color: 'blue',
		weekly_budget_h: 7.5,
		closed_at: null
	});
});

test('edit a quest from its ⋯ menu', async ({ page, sql }) => {
	const quest = await createQuest(sql, { name: `Edit quest ${uid()}`, budgetH: 3 });
	const renamed = `${quest.name} (renamed)`;
	await gotoLive(page, '/quests');

	await (await menuAction(page, quest.name, 'Edit')).click();
	const dialog = page.getByRole('dialog', { name: 'Edit quest' });
	await expect(dialog.getByLabel('Weekly budget · h')).toHaveValue('3');
	await dialog.getByLabel('Name').fill(renamed);
	await dialog.getByLabel('Weekly budget · h').fill('');
	const done = actionDone(page, 'update');
	await dialog.getByRole('button', { name: 'Save changes' }).click();
	await done;
	await expect(dialog).toBeHidden();

	await reloadLive(page);
	await expect(card(page, renamed)).toBeVisible();
	const [row] = await sql`select name, weekly_budget_h from quests where id = ${quest.id}`;
	expect(row).toEqual({ name: renamed, weekly_budget_h: null });
});

test('⋯ Move up / Move down reorder the open quests', async ({ page, sql }) => {
	const a = await createQuest(sql, { name: `Order A ${uid()}` });
	const b = await createQuest(sql, { name: `Order B ${uid()}` });
	await gotoLive(page, '/quests');

	// Newest quest is last: its "Move down" is disabled, "Move up" swaps it with A.
	await card(page, b.name)
		.getByRole('button', { name: `Actions for ${b.name}` })
		.click();
	await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeDisabled();
	const done = actionDone(page, 'moveUp');
	await page.getByRole('menuitem', { name: 'Move up' }).click();
	await done;
	await reloadLive(page);
	let names = await openGridNames(page);
	expect(names.indexOf(b.name)).toBe(names.indexOf(a.name) - 1);

	const down = actionDone(page, 'moveDown');
	await (await menuAction(page, b.name, 'Move down')).click();
	await down;
	await reloadLive(page);
	names = await openGridNames(page);
	expect(names.indexOf(b.name)).toBe(names.indexOf(a.name) + 1);
	expect(names.at(-1)).toBe(b.name);
});

test('⋯ Close quest moves it to "Closed", Reopen brings it back', async ({ page, sql }) => {
	const quest = await createQuest(sql, { name: `Close quest ${uid()}` });
	await gotoLive(page, '/quests');

	let done = actionDone(page, 'close');
	await (await menuAction(page, quest.name, 'Close quest')).click();
	await done;
	const closedAt = async () =>
		(await sql`select closed_at from quests where id = ${quest.id}`)[0].closed_at;
	expect(await closedAt()).not.toBeNull();
	await reloadLive(page);
	expect(await openGridNames(page)).not.toContain(quest.name);
	const closed = page.locator('details.closed-section');
	await closed.locator('summary').click();
	await expect(closed.locator('.quest-card', { hasText: quest.name })).toBeVisible();

	await closed.getByRole('button', { name: `Actions for ${quest.name}` }).click();
	await expect(page.getByRole('menuitem', { name: 'Move up' })).toHaveCount(0);
	done = actionDone(page, 'reopen');
	await page.getByRole('menuitem', { name: 'Reopen quest' }).click();
	await done;
	expect(await closedAt()).toBeNull();
	await reloadLive(page);
	expect(await openGridNames(page)).toContain(quest.name);
});

test('⋯ Delete quest asks first, then deletes its tasks and logged time', async ({ page, sql }) => {
	const quest = await createQuest(sql, { name: `Delete quest ${uid()}` });
	const task = await createTask(sql, { title: `Doomed ${uid()}`, questId: quest.id });
	await createSession(sql, { taskId: task.id, day: await today(sql), start: '00:05', minutes: 5 });
	await gotoLive(page, '/quests');

	await (await menuAction(page, quest.name, 'Delete quest')).click();
	await expect(page.getByRole('menu')).toContainText(`Delete “${quest.name}”?`);
	await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();

	await expect(card(page, quest.name)).toHaveCount(0);
	const [left] = await sql`
		select (select count(*) from quests where id = ${quest.id})::int as quests,
			(select count(*) from tasks where id = ${task.id})::int as tasks,
			(select count(*) from sessions where task_id = ${task.id})::int as sessions`;
	expect(left).toEqual({ quests: 0, tasks: 0, sessions: 0 });
});

test('quest page: backlog add / reorder / done / delete persist; scheduled tasks are listed', async ({
	page,
	sql
}) => {
	const quest = await createQuest(sql, { name: `Backlog quest ${uid()}` });
	const day = addDays(await today(sql), 2);
	await createTask(sql, { title: 'Already scheduled', questId: quest.id, day });
	await gotoLive(page, `/quests/${quest.id}`);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(quest.name);

	const add = page.locator('form.add');
	for (const [title, min] of [
		['First idea', '20'],
		['Second idea', '']
	]) {
		await add.getByPlaceholder('Add to backlog…').fill(title);
		await add.getByLabel('Duration in minutes (optional)').fill(min);
		const done = actionDone(page, 'add');
		await add.getByRole('button', { name: 'Add' }).click();
		await done;
	}
	const rows = page.locator('.tasks').first().locator('li.task');
	await expect(rows.locator('.title')).toHaveText(['First idea', 'Second idea']);
	const stored = await sql`
		select title, day, duration_min, kind from tasks where quest_id = ${quest.id} and day is null
		order by sort_order`;
	expect(stored).toEqual([
		{ title: 'First idea', day: null, duration_min: 20, kind: 'quest' },
		{ title: 'Second idea', day: null, duration_min: null, kind: 'quest' }
	]);

	await rows.filter({ hasText: 'First idea' }).getByRole('button', { name: 'Move down' }).click();
	await expect(rows.locator('.title')).toHaveText(['Second idea', 'First idea']);
	await rows
		.filter({ hasText: 'Second idea' })
		.getByRole('button', { name: 'Mark as done' })
		.click();
	await expect(rows.filter({ hasText: 'Second idea' })).toHaveClass(/done/);
	await rows.filter({ hasText: 'First idea' }).getByRole('button', { name: 'Delete task' }).click();
	await expect(rows).toHaveCount(1);

	await reloadLive(page);
	await expect(rows.locator('.title')).toHaveText(['Second idea']);
	const [second] =
		await sql`select done_at from tasks where quest_id = ${quest.id} and title = 'Second idea'`;
	expect(second.done_at).not.toBeNull();
	await expect(page.locator('li.sched')).toHaveText([/Already scheduled/]);
});

test('unknown or malformed quest ids are a 404', async ({ page, console }) => {
	console.allow(/status of 404/);
	for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
		const res = await page.goto(`/quests/${id}`);
		expect(res?.status()).toBe(404);
	}
});

test('quest card shows logged hours of this week and this quarter', async ({ page, sql }) => {
	const quest = await createQuest(sql, { name: `Stats quest ${uid()}`, budgetH: 4 });
	const task = await createTask(sql, { title: `Stats task ${uid()}`, questId: quest.id });
	const day = await today(sql);
	await createSession(sql, { taskId: task.id, day, start: '00:10', minutes: 90 });
	// 8 days ago: never this week, this quarter only when the quarter started earlier.
	const earlier = addDays(day, -8);
	await createSession(sql, { taskId: task.id, day: earlier, start: '10:00', minutes: 60 });
	const [{ same }] = await sql`
		select date_trunc('quarter', ${earlier}::date) = date_trunc('quarter', ${day}::date) as same`;

	await gotoLive(page, '/quests');
	const c = card(page, quest.name);
	await expect(c.locator('.week-row')).toHaveText(/1\.5h\s*\/ 4h/);
	await expect(c.locator('.quarter')).toHaveText(`${same ? '2.5h' : '1.5h'} this quarter`);
});
