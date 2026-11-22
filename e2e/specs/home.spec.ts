/**
 * M2 — Home/Today: quest work list ordering (Top/Bottom across quests, ↑/↓ within the
 * open/done group), card ⋯ actions, backlog, Other + hideDone, quest filter, time blocks,
 * logged time.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect, gotoLive, actionDone, reloadLive } from '../support/fixtures.ts';
import {
	addDays,
	createQuest,
	createSession,
	createTask,
	loggedMinutes,
	mondayOf,
	today,
	uid
} from '../support/db.ts';

const questList = (page: Page) => page.locator('.main-col > ul.tasks:has(+ section.section)');
const otherList = (page: Page) => page.locator('.main-col > section.section ~ ul.tasks');
const backlog = (page: Page) => page.locator('.main-col > section.section');
const cardOf = (scope: Locator, title: string) => scope.locator('li.task', { hasText: title });

async function addQuestWork(
	page: Page,
	title: string,
	quest: string,
	how: 'Top' | 'Bottom' | 'Enter'
) {
	const form = page.locator('form.add', { has: page.getByPlaceholder('Add quest work…') });
	await form.getByRole('button', { name: 'Choose quest' }).click();
	await page.getByRole('menuitemradio', { name: quest }).click();
	await form.getByPlaceholder('Add quest work…').fill(title);
	const done = actionDone(page, 'addQuest');
	if (how === 'Enter') await form.getByPlaceholder('Add quest work…').press('Enter');
	else await form.getByRole('button', { name: how, exact: true }).click();
	await done;
}

async function cardMenu(page: Page, card: Locator, title: string, item: string) {
	await card.getByRole('button', { name: `Actions for ${title}` }).click();
	await page.getByRole('menuitem', { name: item }).click();
}

test('Top/Bottom place new quest work in the one list shared by all quests', async ({
	page,
	sql
}) => {
	const id = uid();
	const qa = await createQuest(sql, { name: `Scope A ${id}` });
	const qb = await createQuest(sql, { name: `Scope B ${id}` });
	await gotoLive(page, '/');

	await addQuestWork(page, `A bottom ${id}`, qa.name, 'Bottom');
	await addQuestWork(page, `B top ${id}`, qb.name, 'Top');
	await addQuestWork(page, `A top ${id}`, qa.name, 'Top');
	await addQuestWork(page, `A enter ${id}`, qa.name, 'Enter'); // implicit submit = Bottom

	await reloadLive(page);
	const open = await questList(page).locator('li.task:not(.done) .title').allTextContents();
	expect(open.slice(0, 2)).toEqual([`A top ${id}`, `B top ${id}`]);
	expect(open.slice(-2)).toEqual([`A bottom ${id}`, `A enter ${id}`]);
	const rows = await sql`select title, quest_id, day from tasks where title like ${`% ${id}`}`;
	const day = await today(sql);
	expect(rows.every((r) => r.day === day)).toBe(true);
	expect(rows.find((r) => r.title === `B top ${id}`)?.quest_id).toBe(qb.id);
});

test('↑/↓ stay inside the open/done group: done tasks sink, edge buttons are disabled', async ({
	page,
	sql
}) => {
	const id = uid();
	const quest = await createQuest(sql, { name: `Group ${id}` });
	const day = await today(sql);
	for (const n of [1, 2, 3])
		await createTask(sql, { title: `G${n} ${id}`, questId: quest.id, day });
	await gotoLive(page, '/');
	const list = questList(page);

	let done = actionDone(page, 'toggle');
	await cardOf(list, `G2 ${id}`).getByRole('button', { name: 'Mark as done' }).click();
	await done;
	await expect(cardOf(list, `G2 ${id}`)).toHaveClass(/done/);

	// Every card: ↑ disabled exactly at the top of its group, ↓ exactly at the bottom.
	const cards = await list.locator('li.task').evaluateAll((els) =>
		els.map((el) => ({
			done: el.classList.contains('done'),
			up: (el.querySelector('button[aria-label="Move up"]') as HTMLButtonElement).disabled,
			down: (el.querySelector('button[aria-label="Move down"]') as HTMLButtonElement).disabled
		}))
	);
	const firstDone = cards.findIndex((c) => c.done);
	expect(firstDone).toBeGreaterThan(0);
	expect(cards.slice(firstDone).every((c) => c.done)).toBe(true); // done tasks sank
	cards.forEach((c, i) => {
		const groupStart = i === 0 || cards[i - 1].done !== c.done;
		const groupEnd = i === cards.length - 1 || cards[i + 1].done !== c.done;
		expect({ i, up: c.up, down: c.down }).toEqual({ i, up: groupStart, down: groupEnd });
	});

	// G1 ↓ skips the done G2 and swaps with G3.
	done = actionDone(page, 'moveDown');
	await cardOf(list, `G1 ${id}`).getByRole('button', { name: 'Move down' }).click();
	await done;
	await reloadLive(page);
	const open = await list.locator('li.task:not(.done) .title').allTextContents();
	expect(open.slice(-2)).toEqual([`G3 ${id}`, `G1 ${id}`]);
	await expect(cardOf(list, `G2 ${id}`)).toHaveClass(/done/);
});

test('card ⋯ actions: backlog and back, tomorrow, delete', async ({ page, sql }) => {
	const id = uid();
	const quest = await createQuest(sql, { name: `Menu ${id}` });
	const day = await today(sql);
	const q = await createTask(sql, { title: `Quest card ${id}`, questId: quest.id, day });
	const o = await createTask(sql, { title: `Other card ${id}`, day });
	const t = await createTask(sql, { title: `Tomorrow card ${id}`, questId: quest.id, day });
	const d = await createTask(sql, { title: `Delete card ${id}`, day });
	const dayOf = async (taskId: string) =>
		(await sql`select day from tasks where id = ${taskId}`)[0]?.day;
	await gotoLive(page, '/');

	for (const [task, list] of [
		[q, questList(page)],
		[o, otherList(page)]
	] as const) {
		let done = actionDone(page, 'toBacklog');
		await cardMenu(page, cardOf(list, task.title), task.title, 'Move to backlog');
		await done;
		expect(await dayOf(task.id)).toBeNull();
		await expect(cardOf(list, task.title)).toHaveCount(0);
		// "Other" tasks without a day stay visible in Home's backlog (fixed in M4).
		const row = backlog(page).locator('li.row', { hasText: task.title });
		await expect(row).toBeVisible();

		done = actionDone(page, 'today');
		await row.getByRole('button', { name: 'Schedule for today' }).click();
		await done;
		expect(await dayOf(task.id)).toBe(day);
		await expect(cardOf(list, task.title)).toBeVisible();
	}

	let done = actionDone(page, 'toTomorrow');
	await cardMenu(page, cardOf(questList(page), t.title), t.title, 'Move to tomorrow');
	await done;
	expect(await dayOf(t.id)).toBe(addDays(day, 1));

	done = actionDone(page, 'deleteTask');
	await cardMenu(page, cardOf(otherList(page), d.title), d.title, 'Delete');
	await done;
	expect(await sql`select 1 from tasks where id = ${d.id}`).toHaveLength(0);
	await reloadLive(page);
	await expect(page.locator('li.task', { hasText: id })).toHaveCount(2);
});

test('"Add to backlog…" stores a dayless task for the picked quest', async ({ page, sql }) => {
	const id = uid();
	await createQuest(sql, { name: `Backlog first ${id}` });
	const picked = await createQuest(sql, { name: `Backlog picked ${id}` });
	await gotoLive(page, '/');

	const form = backlog(page).locator('form.add');
	await form.getByRole('button', { name: 'Choose quest' }).click();
	await page.getByRole('menuitemradio', { name: picked.name }).click();
	await form.getByPlaceholder('Add to backlog…').fill(`Someday ${id}`);
	const done = actionDone(page, 'addBacklog');
	await form.getByRole('button', { name: 'Add' }).click();
	await done;

	await expect(backlog(page).locator('li.row', { hasText: `Someday ${id}` })).toBeVisible();
	const [row] = await sql`select quest_id, day, kind from tasks where title = ${`Someday ${id}`}`;
	expect(row).toEqual({ quest_id: picked.id, day: null, kind: 'quest' });
});

test('Other: hideDone and the quest filter live in the URL and survive mutations', async ({
	page,
	sql
}) => {
	const id = uid();
	const day = await today(sql);
	const qa = await createQuest(sql, { name: `Filter A ${id}` });
	const qb = await createQuest(sql, { name: `Filter B ${id}` });
	await createTask(sql, { title: `QA task ${id}`, questId: qa.id, day });
	await createTask(sql, { title: `QB task ${id}`, questId: qb.id, day });
	await createTask(sql, { title: `Other done ${id}`, day, done: true });
	await createTask(sql, { title: `Other open ${id}`, day });

	await gotoLive(page, `/?hideDone=1&q=${qa.id}`);
	await expect(otherList(page)).toContainText(`Other open ${id}`);
	await expect(otherList(page)).not.toContainText(`Other done ${id}`);
	await expect(questList(page)).toContainText(`QA task ${id}`);
	await expect(questList(page)).not.toContainText(`QB task ${id}`);

	// A mutation on the page keeps both params (Kit 3 lands on the action URL — formAction).
	const form = page.locator('form.add', { has: page.getByPlaceholder('Add a task…') });
	await form.getByPlaceholder('Add a task…').fill(`Other new ${id}`);
	let done = actionDone(page, 'addOther');
	await form.getByRole('button', { name: 'Bottom' }).click();
	await done;
	await expect(otherList(page)).toContainText(`Other new ${id}`);
	expect(new URL(page.url()).searchParams.get('hideDone')).toBe('1');
	expect(new URL(page.url()).searchParams.get('q')).toBe(qa.id);
	await expect(otherList(page)).not.toContainText(`Other done ${id}`);
	await expect(questList(page)).not.toContainText(`QB task ${id}`);
	const [added] =
		await sql`select kind, quest_id, day from tasks where title = ${`Other new ${id}`}`;
	expect(added).toEqual({ kind: 'other', quest_id: null, day });

	done = actionDone(page, 'toggle');
	await cardOf(questList(page), `QA task ${id}`)
		.getByRole('button', { name: 'Mark as done' })
		.click();
	await done;
	expect(new URL(page.url()).searchParams.get('q')).toBe(qa.id);

	// The funnel adds quest B to the filter; the eye shows done tasks again.
	await page.getByRole('button', { name: 'Filter quest work by quest' }).click();
	await page.getByRole('dialog', { name: 'Quest filter' }).getByLabel(qb.name).check();
	await expect(questList(page)).toContainText(`QB task ${id}`);
	expect(new URL(page.url()).searchParams.get('q')?.split(',').sort()).toEqual(
		[qa.id, qb.id].sort()
	);
	// Close the filter first: with many quests its list reaches over the Other column's eye.
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Quest filter' })).toBeHidden();
	await page.getByRole('link', { name: 'Show done tasks' }).click();
	await expect(otherList(page)).toContainText(`Other done ${id}`);
	expect(new URL(page.url()).searchParams.has('hideDone')).toBe(false);
});

test('time blocks: server-side span check, create, edit and delete', async ({
	page,
	sql,
	console
}) => {
	console.allow(/status of 400/);
	const id = uid();
	const day = await today(sql);
	const task = await createTask(sql, { title: `Block me ${id}`, day });
	const blocks = () => sql`select start_min, end_min, day from blocks where task_id = ${task.id}`;
	await gotoLive(page, '/');

	await cardMenu(page, cardOf(otherList(page), task.title), task.title, 'Time-block…');
	let dialog = page.getByRole('dialog', { name: 'Time-block' });
	await dialog.getByLabel('Start').fill('23:00');
	await dialog.getByLabel('Duration (minutes)').fill('90');
	let done = actionDone(page, 'block');
	await dialog.getByRole('button', { name: 'Add block' }).click();
	await done;
	await expect(dialog.getByRole('alert')).toBeVisible();
	expect(await blocks()).toHaveLength(0);

	// Ending exactly at midnight is the upper bound.
	await dialog.getByLabel('Duration (minutes)').fill('60');
	done = actionDone(page, 'block');
	await dialog.getByRole('button', { name: 'Add block' }).click();
	await done;
	await expect(dialog).toBeHidden();
	expect(await blocks()).toEqual([{ start_min: 1380, end_min: 1440, day }]);

	const block = page.getByRole('button', { name: new RegExp(`^Edit time block: Block me ${id}`) });
	await block.click();
	dialog = page.getByRole('dialog', { name: 'Edit time block' });
	await dialog.getByLabel('Start').fill('21:00');
	await dialog.getByLabel('Duration (minutes)').fill('30');
	done = actionDone(page, 'blockUpdate');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await done;
	await expect(block).toHaveAccessibleName(/21:00 to 21:30/);
	expect(await blocks()).toEqual([{ start_min: 1260, end_min: 1290, day }]);
	// The sheet must be gone (exit animation) before the block is clicked again.
	await expect(dialog).toBeHidden();

	await block.click();
	done = actionDone(page, 'blockDelete');
	await page
		.getByRole('dialog', { name: 'Edit time block' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await done;
	await expect(block).toHaveCount(0);
	expect(await blocks()).toHaveLength(0);
});

test('logged time shows on the card and in the header totals', async ({ page, sql }) => {
	const id = uid();
	const day = await today(sql);
	const task = await createTask(sql, { title: `Logged ${id}`, day, durationMin: 20 });
	await createSession(sql, { taskId: task.id, day, start: '00:20', minutes: 75 });

	const monday = mondayOf(day);
	const [{ todayMin, weekMin }] = await sql`
		select
			coalesce(sum(${loggedMinutes(sql)}) filter (where (s.started_at at time zone 'Europe/Berlin')::date = ${day}::date), 0)::float8 as "todayMin",
			coalesce(sum(${loggedMinutes(sql)}), 0)::float8 as "weekMin"
		from sessions s
		where s.state = 'completed'
			and (s.started_at at time zone 'Europe/Berlin')::date between ${monday}::date and ${addDays(monday, 6)}::date`;
	const hours = (min: number) => `${Math.round((Math.round(min) / 60) * 10) / 10}h`;

	await gotoLive(page, '/');
	await expect(cardOf(otherList(page), task.title).locator('.logged')).toHaveText('1:15:00');
	await expect(page.locator('.day-stats .today strong')).toHaveText(hours(todayMin));
	await expect(page.locator('.day-stats .week-label')).toHaveText(`${hours(weekMin)} this week`);
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('adding a task is a native form post that lands back on the same view', async ({
		page,
		sql
	}) => {
		const id = uid();
		await page.goto('/?hideDone=1');
		const form = page.locator('form.add', { has: page.getByPlaceholder('Add a task…') });
		await form.getByPlaceholder('Add a task…').fill(`Native ${id}`);
		await form.getByRole('button', { name: 'Bottom' }).click();
		await expect(otherList(page)).toContainText(`Native ${id}`);
		expect(new URL(page.url()).searchParams.get('hideDone')).toBe('1');
		expect(await sql`select kind, day from tasks where title = ${`Native ${id}`}`).toEqual([
			{ kind: 'other', day: await today(sql) }
		]);
	});
});
