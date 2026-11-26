/**
 * M1 — quests: create/edit with server-side validation, every ⋯ menu action persisting,
 * delete cascade, quest backlog page, card stats.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect, gotoLive, actionDone, reloadLive } from '../support/fixtures.ts';
import { addDays, createQuest, createSession, createTask, today, uid } from '../support/db.ts';

const card = (page: Page, name: string) => page.locator('.quest-card', { hasText: name });
/** A native disclosure row of the quest dialog ("More options", "Icon"). */
const disclosure = (dialog: Locator, name: string) => dialog.locator('summary', { hasText: name });
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
	// One way to create (O4a): a strict locator — a second "New quest" button fails here.
	await page.getByRole('button', { name: 'New quest' }).click();
	const dialog = page.getByRole('dialog', { name: 'New quest' });

	await dialog.getByLabel('Name').fill(name);
	await dialog.getByLabel('blue', { exact: true }).check();
	// Icon, description and budget sit behind "More options"; the emoji choice opens on tap.
	await expect(dialog.getByLabel('Weekly budget')).toBeHidden();
	await disclosure(dialog, 'More options').click();
	await dialog.getByLabel('Description').fill('Made by the e2e suite');
	await dialog.getByLabel('Weekly budget').fill('7.5');
	await expect(dialog.getByRole('button', { name: 'Use 📖 as icon' })).toBeHidden();
	await disclosure(dialog, 'Icon').click();
	// Two emoji — no browser constraint catches this, only the server.
	await dialog.getByLabel('Icon', { exact: true }).fill('🚀🚀');
	await dialog.getByRole('button', { name: 'Create quest' }).click();

	// The error reopens what it is about, the input is kept.
	await expect(dialog.getByText('Use exactly one emoji.')).toBeVisible();
	await expect(dialog.getByLabel('Name')).toHaveValue(name);
	await expect(dialog.getByLabel('Weekly budget')).toHaveValue('7.5');
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

test('create with only name and colour: the folded options submit their defaults', async ({
	page,
	sql
}) => {
	const name = `Quick quest ${uid()}`;
	await gotoLive(page, '/quests');
	await page.getByRole('button', { name: 'New quest' }).click();
	const dialog = page.getByRole('dialog', { name: 'New quest' });
	await expect(dialog.getByLabel('Weekly budget')).toBeHidden();
	await dialog.getByLabel('Name').fill(name);
	await dialog.getByLabel('green', { exact: true }).check();
	const done = actionDone(page, 'create');
	await dialog.getByRole('button', { name: 'Create quest' }).click();
	await done;
	await expect(dialog).toBeHidden();

	const [row] = await sql`
		select description, icon, color, weekly_budget_h from quests where name = ${name}`;
	expect(row).toEqual({ description: '', icon: '✨', color: 'green', weekly_budget_h: null });
});

test('editing a quest with a budget opens "More options"; saving keeps the budget', async ({
	page,
	sql
}) => {
	const quest = await createQuest(sql, { name: `Budget quest ${uid()}`, icon: '✨', budgetH: 4 });
	const renamed = `${quest.name} (renamed)`;
	await gotoLive(page, '/quests');

	await (await menuAction(page, quest.name, 'Edit')).click();
	const dialog = page.getByRole('dialog', { name: 'Edit quest' });
	await expect(dialog.getByLabel('Weekly budget')).toBeVisible(); // open without a tap
	await expect(dialog.getByLabel('Weekly budget')).toHaveValue('4');
	await dialog.getByLabel('Name').fill(renamed);
	const done = actionDone(page, 'update');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await done;
	await expect(dialog).toBeHidden();
	const [row] = await sql`select name, icon, weekly_budget_h from quests where id = ${quest.id}`;
	expect(row).toEqual({ name: renamed, icon: '✨', weekly_budget_h: 4 });

	// A quest with nothing set there opens folded — and keeps its values when saved.
	const plain = await createQuest(sql, { name: `Plain quest ${uid()}`, icon: '✨' });
	await reloadLive(page);
	await (await menuAction(page, plain.name, 'Edit')).click();
	const edit = page.getByRole('dialog', { name: 'Edit quest' });
	await expect(edit.getByLabel('Name')).toHaveValue(plain.name);
	await expect(edit.getByLabel('Weekly budget')).toBeHidden();
	await edit.getByLabel('purple', { exact: true }).check();
	const saved = actionDone(page, 'update');
	await edit.getByRole('button', { name: 'Save' }).click();
	await saved;
	const [after] = await sql`select icon, color, weekly_budget_h from quests where id = ${plain.id}`;
	expect(after).toEqual({ icon: '✨', color: 'purple', weekly_budget_h: null });
});

test('edit a quest from its ⋯ menu', async ({ page, sql }) => {
	const quest = await createQuest(sql, { name: `Edit quest ${uid()}`, budgetH: 3 });
	const renamed = `${quest.name} (renamed)`;
	await gotoLive(page, '/quests');

	await (await menuAction(page, quest.name, 'Edit')).click();
	const dialog = page.getByRole('dialog', { name: 'Edit quest' });
	await expect(dialog.getByLabel('Weekly budget')).toHaveValue('3');
	await dialog.getByLabel('Name').fill(renamed);
	await dialog.getByLabel('Weekly budget').fill('');
	const done = actionDone(page, 'update');
	await dialog.getByRole('button', { name: 'Save' }).click();
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

test('quest detail: the add row and every ⋯ action persist; scheduled tasks are listed @mobile', async ({
	page,
	sql
}) => {
	const quest = await createQuest(sql, { name: `Backlog quest ${uid()}` });
	const day = addDays(await today(sql), 2);
	await createTask(sql, { title: 'Already scheduled', questId: quest.id, day, durationMin: 90 });
	await gotoLive(page, `/quests/${quest.id}`);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(quest.name);

	// "+ Add to backlog…": Enter appends, Shift+Enter puts it on top; the duration is optional.
	const add = page.locator('form.add[data-intent=add]');
	const title = add.getByPlaceholder('Add to backlog…');
	await title.fill('First idea');
	await add.getByLabel('Duration in minutes (optional)').fill('20');
	let done = actionDone(page, 'add');
	await title.press('Enter');
	await done;
	await title.fill('Second idea');
	done = actionDone(page, 'add');
	await title.press('Enter');
	await done;
	await title.fill('Top idea');
	done = actionDone(page, 'add');
	await title.press('Shift+Enter');
	await done;

	const backlog = page.getByTestId('quest-backlog').locator('li.task');
	await expect(backlog.locator('.title')).toHaveText(['Top idea', 'First idea', 'Second idea']);
	expect(
		await sql`
		select title, duration_min, kind from tasks where quest_id = ${quest.id} and day is null
		order by sort_order`
	).toEqual([
		{ title: 'Top idea', duration_min: null, kind: 'quest' },
		{ title: 'First idea', duration_min: 20, kind: 'quest' },
		{ title: 'Second idea', duration_min: null, kind: 'quest' }
	]);

	const actionName: Record<string, string> = {
		'Move down': 'moveDown',
		'Move up': 'moveUp',
		'Move to today': 'today',
		'Move to tomorrow': 'tomorrow',
		Delete: 'delete'
	};
	const act = async (task: string, item: string) => {
		await backlog
			.filter({ hasText: task })
			.getByRole('button', { name: `Actions for ${task}` })
			.click();
		const answered = actionDone(page, actionName[item]);
		await page.getByRole('menuitem', { name: item, exact: true }).click();
		await answered;
	};
	await act('Top idea', 'Move down');
	await expect(backlog.locator('.title')).toHaveText(['First idea', 'Top idea', 'Second idea']);
	await act('Second idea', 'Move up');
	await expect(backlog.locator('.title')).toHaveText(['First idea', 'Second idea', 'Top idea']);
	await act('First idea', 'Move to today');
	await act('Second idea', 'Move to tomorrow');
	await act('Top idea', 'Delete');
	await expect(backlog).toHaveCount(0);

	// The check ring marks a scheduled task done (struck).
	const scheduled = page.getByTestId('quest-scheduled').locator('li.task');
	await scheduled
		.filter({ hasText: 'First idea' })
		.getByRole('button', { name: 'Mark as done' })
		.click();
	await expect(scheduled.filter({ hasText: 'First idea' })).toHaveClass(/done/);

	await reloadLive(page);
	const t0 = await today(sql);
	const rows = await sql`
		select title, day, done_at is not null as done from tasks where quest_id = ${quest.id}
		order by day, title`;
	expect(rows).toEqual([
		{ title: 'First idea', day: t0, done: true },
		{ title: 'Second idea', day: addDays(t0, 1), done: false },
		{ title: 'Already scheduled', day, done: false }
	]);
	await expect(scheduled.locator('.title')).toHaveText([
		'First idea',
		'Second idea',
		'Already scheduled'
	]);
	await expect(scheduled.filter({ hasText: 'First idea' })).toHaveClass(/done/);
	await expect(scheduled.filter({ hasText: 'Already scheduled' })).toContainText(
		'1 h 30 min planned'
	);
	await expect(page.getByTestId('quest-backlog')).toContainText('Nothing in the backlog yet');
});

test('quest detail: the summary shows this week against the budget; Edit saves the quest', async ({
	page,
	sql
}) => {
	const quest = await createQuest(sql, { name: `Detail quest ${uid()}`, budgetH: 4 });
	const task = await createTask(sql, { title: `Detail task ${uid()}`, questId: quest.id });
	await createSession(sql, { taskId: task.id, day: await today(sql), start: '00:10', minutes: 90 });
	await gotoLive(page, `/quests/${quest.id}`);
	await expect(page.getByTestId('quest-summary')).toContainText(/1\.5h\s*\/ 4h this week/);

	await page.getByRole('button', { name: 'Edit', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Edit quest' });
	await dialog.getByLabel('Weekly budget').fill('2');
	const done = actionDone(page, 'update');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await done;
	await expect(dialog).toBeHidden();
	await reloadLive(page);
	await expect(page.getByTestId('quest-summary')).toContainText(/1\.5h\s*\/ 2h this week/);
	expect((await sql`select weekly_budget_h from quests where id = ${quest.id}`)[0]).toEqual({
		weekly_budget_h: 2
	});
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
