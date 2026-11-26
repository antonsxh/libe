/**
 * Home/Today (O3a: one list): ordering of the one add row (Enter = bottom, Shift+Enter = top,
 * quest or Other from its picker), ↑/↓ within each stored list and open/done group, the row ⋯
 * actions, the Backlog sheet, hideDone + quest filter, time blocks (compact timeline and the
 * phone's daily-plan sheet), logged time. O1: Home without open quests (no "Pick a quest.").
 */
import type { Locator, Page } from '@playwright/test';
import {
	test,
	expect,
	gotoLive,
	actionDone,
	reloadLive,
	discardTimer
} from '../support/fixtures.ts';
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

/** Home's one "Today" list (quest work and Other). */
const todayList = (page: Page) => page.getByTestId('today-list');
const cardOf = (scope: Locator, title: string) => scope.locator('li.task', { hasText: title });
const addForm = (page: Page) => page.locator('form.add[data-intent=add]');

/** Opens the Backlog sheet from its row (side column / under the list). */
async function openBacklog(page: Page): Promise<Locator> {
	await page.getByRole('button', { name: /^Backlog, \d+ tasks?$/ }).click();
	const sheet = page.getByRole('dialog', { name: 'Backlog' });
	await expect(sheet).toBeVisible();
	return sheet;
}

/** The add row: pick `quest` (a name or "Other"), type the title, submit as `how`. */
async function addTask(
	page: Page,
	title: string,
	quest: string,
	how: 'Add' | 'Enter' | 'Shift+Enter'
) {
	const form = addForm(page);
	const input = form.getByPlaceholder('Add a task…');
	await input.fill(title);
	await form.getByRole('button', { name: 'Choose quest' }).click();
	await page.getByRole('menuitemradio', { name: quest, exact: true }).click();
	const done = actionDone(page, 'add');
	if (how === 'Add') await form.getByRole('button', { name: 'Add', exact: true }).click();
	else await input.press(how);
	await done;
}

async function cardMenu(page: Page, card: Locator, title: string, item: string) {
	await card.getByRole('button', { name: `Actions for ${title}` }).click();
	await page.getByRole('menuitem', { name: item }).click();
}

/** Rendered rows of the Today list: title, quest line ("Other" for other tasks), done. */
async function rowsOf(page: Page) {
	return todayList(page)
		.locator('li.task')
		.evaluateAll((els) =>
			els.map((el) => ({
				title: el.querySelector('.title')?.textContent?.trim() ?? '',
				other: el.querySelector('.quest')?.textContent?.trim() === 'Other',
				done: el.classList.contains('done')
			}))
		);
}

test('one add row: Enter/Add append, Shift+Enter puts it on top — quest work of every quest and Other', async ({
	page,
	sql
}) => {
	const id = uid();
	const qa = await createQuest(sql, { name: `Scope A ${id}` });
	const qb = await createQuest(sql, { name: `Scope B ${id}` });
	await gotoLive(page, '/');

	await addTask(page, `A bottom ${id}`, qa.name, 'Add');
	await addTask(page, `B top ${id}`, qb.name, 'Shift+Enter');
	await addTask(page, `A top ${id}`, qa.name, 'Shift+Enter');
	await addTask(page, `A enter ${id}`, qa.name, 'Enter'); // implicit submit = bottom
	await addTask(page, `O bottom ${id}`, 'Other', 'Enter');
	await addTask(page, `O top ${id}`, 'Other', 'Shift+Enter');

	await reloadLive(page);
	// Open quest work first (its own list order), then open Other (its own list order).
	const open = (await rowsOf(page)).filter((r) => !r.done);
	const quest = open.filter((r) => !r.other).map((r) => r.title);
	const other = open.filter((r) => r.other).map((r) => r.title);
	expect(open.findIndex((r) => r.other)).toBe(quest.length);
	expect(quest.slice(0, 2)).toEqual([`A top ${id}`, `B top ${id}`]);
	expect(quest.slice(-2)).toEqual([`A bottom ${id}`, `A enter ${id}`]);
	expect(other[0]).toBe(`O top ${id}`);
	expect(other.at(-1)).toBe(`O bottom ${id}`);
	const rows =
		await sql`select title, kind, quest_id, day from tasks where title like ${`% ${id}`}`;
	const day = await today(sql);
	expect(rows.every((r) => r.day === day)).toBe(true);
	expect(rows.find((r) => r.title === `B top ${id}`)).toMatchObject({
		kind: 'quest',
		quest_id: qb.id
	});
	expect(rows.find((r) => r.title === `O bottom ${id}`)).toMatchObject({
		kind: 'other',
		quest_id: null
	});
});

test("↑/↓ stay inside a task's own list and open/done group: done tasks sink, edge items are disabled", async ({
	page,
	sql
}) => {
	const id = uid();
	const quest = await createQuest(sql, { name: `Group ${id}` });
	const day = await today(sql);
	for (const n of [1, 2, 3])
		await createTask(sql, { title: `G${n} ${id}`, questId: quest.id, day });
	await createTask(sql, { title: `Other G ${id}`, day });
	await gotoLive(page, '/');
	const list = todayList(page);

	let done = actionDone(page, 'toggle');
	await cardOf(list, `G2 ${id}`).getByRole('button', { name: 'Mark as done' }).click();
	await done;
	await expect(cardOf(list, `G2 ${id}`)).toHaveClass(/done/);

	// Done tasks sank below every open one.
	const rows = await rowsOf(page);
	const firstDone = rows.findIndex((r) => r.done);
	expect(firstDone).toBeGreaterThan(0);
	expect(rows.slice(firstDone).every((r) => r.done)).toBe(true);

	// Every row's ⋯: ↑ disabled exactly at the top of its (list, open/done) run, ↓ at its end.
	const group = (r: (typeof rows)[number]) => `${r.other}-${r.done}`;
	for (const [i, r] of rows.entries()) {
		const card = list.locator('li.task').nth(i);
		await card.getByRole('button', { name: /^Actions for / }).click();
		const up = page.getByRole('menuitem', { name: 'Move up' });
		const down = page.getByRole('menuitem', { name: 'Move down' });
		const want = {
			i,
			up: i === 0 || group(rows[i - 1]) !== group(r),
			down: i === rows.length - 1 || group(rows[i + 1]) !== group(r)
		};
		expect({ i, up: await up.isDisabled(), down: await down.isDisabled() }).toEqual(want);
		await page.keyboard.press('Escape');
		await expect(up).toHaveCount(0);
	}

	// G1 ↓ skips the done G2 and swaps with G3.
	done = actionDone(page, 'moveDown');
	await cardMenu(page, cardOf(list, `G1 ${id}`), `G1 ${id}`, 'Move down');
	await done;
	await reloadLive(page);
	const open = (await rowsOf(page)).filter((r) => !r.done && !r.other).map((r) => r.title);
	expect(open.slice(-2)).toEqual([`G3 ${id}`, `G1 ${id}`]);
	await expect(cardOf(list, `G2 ${id}`)).toHaveClass(/done/);
});

test('row ⋯ actions: backlog and back from the Backlog sheet, tomorrow, delete', async ({
	page,
	sql
}) => {
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
	const list = todayList(page);

	for (const task of [q, o]) {
		let done = actionDone(page, 'toBacklog');
		await cardMenu(page, cardOf(list, task.title), task.title, 'Move to backlog');
		await done;
		expect(await dayOf(task.id)).toBeNull();
		await expect(cardOf(list, task.title)).toHaveCount(0);
		// "Other" tasks without a day are in Home's backlog too (fixed in M4).
		const sheet = await openBacklog(page);
		const row = sheet.locator('li.row', { hasText: task.title });
		await expect(row).toBeVisible();

		done = actionDone(page, 'today');
		await row.getByRole('button', { name: 'Schedule for today' }).click();
		await done;
		await expect(row).toHaveCount(0);
		expect(await dayOf(task.id)).toBe(day);
		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();
		await expect(cardOf(list, task.title)).toBeVisible();
	}

	let done = actionDone(page, 'toTomorrow');
	await cardMenu(page, cardOf(list, t.title), t.title, 'Move to tomorrow');
	await done;
	expect(await dayOf(t.id)).toBe(addDays(day, 1));

	done = actionDone(page, 'deleteTask');
	await cardMenu(page, cardOf(list, d.title), d.title, 'Delete');
	await done;
	expect(await sql`select 1 from tasks where id = ${d.id}`).toHaveLength(0);
	await reloadLive(page);
	await expect(page.locator('li.task', { hasText: id })).toHaveCount(2);
});

test('the Backlog sheet adds a dayless task for the picked quest; its row shows the count', async ({
	page,
	sql
}) => {
	const id = uid();
	await createQuest(sql, { name: `Backlog first ${id}` });
	const picked = await createQuest(sql, { name: `Backlog picked ${id}` });
	await gotoLive(page, '/');
	const count = async () =>
		(
			await sql`select count(*)::int as n from tasks t left join quests q on q.id = t.quest_id
				where t.day is null and (t.kind = 'other' or q.closed_at is null)`
		)[0].n as number;
	const before = await count();
	await expect(page.getByRole('button', { name: /^Backlog, / })).toHaveAccessibleName(
		`Backlog, ${before} ${before === 1 ? 'task' : 'tasks'}`
	);

	const sheet = await openBacklog(page);
	const form = sheet.locator('form.add[data-intent=addBacklog]');
	await form.getByPlaceholder('Add to backlog…').fill(`Someday ${id}`);
	await form.getByRole('button', { name: 'Choose quest' }).click();
	await page.getByRole('menuitemradio', { name: picked.name }).click();
	const done = actionDone(page, 'addBacklog');
	await form.getByRole('button', { name: 'Add', exact: true }).click();
	await done;

	await expect(sheet.locator('li.row', { hasText: `Someday ${id}` })).toBeVisible();
	const [row] = await sql`select quest_id, day, kind from tasks where title = ${`Someday ${id}`}`;
	expect(row).toEqual({ quest_id: picked.id, day: null, kind: 'quest' });
	await page.keyboard.press('Escape');
	await reloadLive(page);
	await expect(page.getByRole('button', { name: /^Backlog, / })).toHaveAccessibleName(
		`Backlog, ${before + 1} tasks`
	);
});

test('hideDone and the quest filter live in the URL and survive mutations', async ({
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
	const list = todayList(page);
	await expect(list).toContainText(`Other open ${id}`);
	await expect(list).not.toContainText(`Other done ${id}`);
	await expect(list).toContainText(`QA task ${id}`);
	await expect(list).not.toContainText(`QB task ${id}`);

	// A mutation on the page keeps both params (Kit 3 lands on the action URL — formAction).
	await addTask(page, `Other new ${id}`, 'Other', 'Add');
	await expect(list).toContainText(`Other new ${id}`);
	expect(new URL(page.url()).searchParams.get('hideDone')).toBe('1');
	expect(new URL(page.url()).searchParams.get('q')).toBe(qa.id);
	await expect(list).not.toContainText(`Other done ${id}`);
	await expect(list).not.toContainText(`QB task ${id}`);
	const [added] =
		await sql`select kind, quest_id, day from tasks where title = ${`Other new ${id}`}`;
	expect(added).toEqual({ kind: 'other', quest_id: null, day });

	// hideDone covers the whole list: quest work done here leaves it too.
	const done = actionDone(page, 'toggle');
	await cardOf(list, `QA task ${id}`).getByRole('button', { name: 'Mark as done' }).click();
	await done;
	expect(new URL(page.url()).searchParams.get('q')).toBe(qa.id);
	await expect(cardOf(list, `QA task ${id}`)).toHaveCount(0);

	// The funnel adds quest B to the filter; the eye shows done tasks again.
	await page.getByRole('button', { name: 'Filter quest work by quest' }).click();
	await page.getByRole('dialog', { name: 'Quest filter' }).getByLabel(qb.name).check();
	await expect(list).toContainText(`QB task ${id}`);
	expect(new URL(page.url()).searchParams.get('q')?.split(',').sort()).toEqual(
		[qa.id, qb.id].sort()
	);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Quest filter' })).toBeHidden();
	await page.getByRole('link', { name: 'Show done tasks' }).click();
	await expect(list).toContainText(`Other done ${id}`);
	await expect(cardOf(list, `QA task ${id}`)).toHaveClass(/done/);
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

	await cardMenu(page, cardOf(todayList(page), task.title), task.title, 'Time-block…');
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
	await expect(cardOf(todayList(page), task.title).locator('.logged')).toHaveText(
		'1 h 15 min logged'
	);
	await expect(page.getByTestId('today-logged').locator('strong')).toHaveText(hours(todayMin));
	await expect(page.getByTestId('week-logged')).toHaveText(`${hours(weekMin)} this week`);
});

test.describe('Next up on desktop', () => {
	test.beforeEach(async ({ api }) => discardTimer(api));
	test.afterEach(async ({ api }) => discardTimer(api));

	test('starts a focus timer for the first open task and steps aside while it runs', async ({
		page,
		sql
	}) => {
		const id = uid();
		const day = await today(sql);
		const quest = await createQuest(sql, { name: `Next desk ${id}` });
		const task = await createTask(sql, {
			title: `Next desk ${id}`,
			questId: quest.id,
			day,
			durationMin: 45
		});
		// First open quest task of today = the card's pick.
		await sql`update tasks set sort_order = (
			select min(sort_order) - 1 from tasks where day = ${day} and kind = 'quest'
		) where id = ${task.id}`;

		await gotoLive(page, '/');
		const next = page.getByTestId('next-up');
		await expect(next).toContainText(task.title);
		await next.getByRole('button', { name: `Start focus: ${task.title}` }).click();
		await expect
			.poll(async () => await sql`select task_id, state from sessions where state <> 'completed'`)
			.toEqual([{ task_id: task.id, state: 'running' }]);
		await expect(page).toHaveURL(/\/$/);
		await expect(next).toHaveCount(0);
		await reloadLive(page);
		await expect(next).toHaveCount(0);
	});
});

test.describe('without any open quest', () => {
	/** Open quests closed for the test (the seed's and leftovers), reopened afterwards. */
	let closed: string[] = [];
	/** Quests the test creates — closed again afterwards, like everything else it made. */
	const made: string[] = [];
	test.beforeEach(async ({ sql }) => {
		closed = (
			await sql`update quests set closed_at = now() where closed_at is null returning id`
		).map((r) => r.id as string);
	});
	test.afterEach(async ({ sql }) => {
		if (made.length > 0) await sql`update quests set closed_at = now() where name in ${sql(made)}`;
		made.length = 0;
		if (closed.length > 0) await sql`update quests set closed_at = null where id in ${sql(closed)}`;
		closed = [];
	});

	test('Home has no dead end: the add row and the backlog take Other, then the first quest @mobile', async ({
		page,
		sql
	}) => {
		const id = uid();
		const day = await today(sql);
		await gotoLive(page, '/');

		// The add row's picker offers only Other — no "Pick a quest." with no quest to pick.
		const form = addForm(page);
		await form.getByPlaceholder('Add a task…').fill(`Today other ${id}`);
		await expect(form.getByRole('button', { name: 'Choose quest' })).toContainText('Other');
		let done = actionDone(page, 'add');
		await form.getByPlaceholder('Add a task…').press('Enter');
		await done;
		await expect(page.getByText('Pick a quest')).toHaveCount(0);

		const sheet = await openBacklog(page);
		const backlogInput = sheet.getByPlaceholder('Add to backlog…');
		await backlogInput.fill(`Backlog other ${id}`);
		done = actionDone(page, 'addBacklog');
		await backlogInput.press('Enter');
		await done;
		await expect(sheet.locator('li.row', { hasText: `Backlog other ${id}` })).toBeVisible();
		await sheet.getByRole('button', { name: 'Close dialog' }).click();
		await expect(sheet).toBeHidden();

		expect(
			await sql`select title, kind, quest_id, day from tasks where title like ${`% ${id}`} order by title`
		).toEqual([
			{ title: `Backlog other ${id}`, kind: 'other', quest_id: null, day: null },
			{ title: `Today other ${id}`, kind: 'other', quest_id: null, day }
		]);
		await reloadLive(page);
		await expect(cardOf(todayList(page), `Today other ${id}`)).toBeVisible();
		await expect(page.getByText('Pick a quest')).toHaveCount(0);

		// "Create your first quest" opens the quest dialog right on Home; the add row then
		// offers (and preselects) it.
		const name = `First quest ${id}`;
		made.push(name);
		await page.getByRole('button', { name: 'Create your first quest' }).click();
		const dialog = page.getByRole('dialog', { name: 'New quest' });
		await dialog.getByLabel('Name').fill(name);
		done = actionDone(page, 'create');
		await dialog.getByRole('button', { name: 'Create quest' }).click();
		await done;
		await expect(dialog).toBeHidden();
		const [quest] = await sql`select id from quests where name = ${name} and closed_at is null`;
		expect(quest).toBeDefined();
		await expect(page.getByTestId('first-quest')).toHaveCount(0);

		const work = addForm(page).getByPlaceholder('Add a task…');
		await work.fill(`Quest work ${id}`);
		await expect(addForm(page).getByRole('button', { name: 'Choose quest' })).toContainText(name);
		done = actionDone(page, 'add');
		await work.press('Enter');
		await done;
		expect(
			await sql`select kind, quest_id, day from tasks where title = ${`Quest work ${id}`}`
		).toEqual([{ kind: 'quest', quest_id: quest.id, day }]);
		await reloadLive(page);
		await expect(cardOf(todayList(page), `Quest work ${id}`)).toBeVisible();
	});
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('adding a task is a native form post that lands back on the same view', async ({
		page,
		sql
	}) => {
		const id = uid();
		await page.goto('/?hideDone=1');
		const form = addForm(page);
		await form.getByPlaceholder('Add a task…').fill(`Native ${id}`);
		await form.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(todayList(page)).toContainText(`Native ${id}`);
		expect(new URL(page.url()).searchParams.get('hideDone')).toBe('1');
		// Without JS the picker keeps its default: the first open quest.
		const [first] =
			await sql`select id from quests where closed_at is null order by sort_order, created_at limit 1`;
		expect(
			await sql`select kind, quest_id, day from tasks where title = ${`Native ${id}`}`
		).toEqual([{ kind: 'quest', quest_id: first.id, day: await today(sql) }]);
	});
});

test('phone: the daily plan is a row with a summary; its sheet shows the day and edits a block @mobile', async ({
	page,
	sql,
	viewport
}) => {
	test.skip(viewport!.width > 1000, 'wide screens show the compact timeline in the side column');
	const id = uid();
	const day = await today(sql);
	const task = await createTask(sql, { title: `Sheet block ${id}`, day });
	// 23:00–23:30: today's last half hour, so it is still ahead (or running) for the summary.
	await sql`insert into blocks (task_id, day, start_min, end_min)
		values (${task.id}, ${day}, 1380, 1410)`;
	const blocks = () => sql`select start_min, end_min from blocks where task_id = ${task.id}`;
	await gotoLive(page, '/');

	const row = page.getByTestId('plan-row');
	// The summary names the block running now or the next one — ours, unless another block
	// is planned today or the day's last half hour has begun.
	const [{ others, nowMin }] = await sql`
		select (select count(*)::int from blocks where day = ${day} and task_id <> ${task.id}) as others,
			extract(hour from now() at time zone 'Europe/Berlin')::int * 60
				+ extract(minute from now() at time zone 'Europe/Berlin')::int as "nowMin"`;
	if (others === 0 && nowMin < 1410) await expect(row).toContainText(task.title);
	await row.click();
	const sheet = page.getByRole('dialog', { name: 'Daily plan' });
	const button = sheet.getByRole('button', {
		name: `Edit time block: ${task.title}, 23:00 to 23:30`
	});
	await expect(button).toBeVisible();
	await button.click();
	await expect(sheet).toBeHidden();

	const dialog = page.getByRole('dialog', { name: 'Edit time block' });
	await dialog.getByLabel('Start').fill('22:00');
	const done = actionDone(page, 'blockUpdate');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await done;
	await expect(dialog).toBeHidden();
	expect(await blocks()).toEqual([{ start_min: 1320, end_min: 1350 }]);
});
