/**
 * Command palette (⌘K / Ctrl+K, nav search button): server search with its filters, where a
 * result leads, keyboard navigation and focus return, timer actions changing server state,
 * the touch flow, and the API's auth.
 */
import type { Page } from '@playwright/test';
import {
	test,
	expect,
	gotoLive,
	discardTimer,
	timerCmd,
	expectNoHorizontalScroll
} from '../support/fixtures.ts';
import { addDays, createQuest, createTask, mondayOf, today, uid } from '../support/db.ts';
import { BASE } from '../support/env.ts';

const trigger = (page: Page) => page.getByRole('button', { name: 'Search or jump…' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const input = (page: Page) => page.getByRole('combobox', { name: /Search pages/ });

async function openWithShortcut(page: Page) {
	await page.keyboard.press('ControlOrMeta+k');
	await expect(input(page)).toBeFocused();
}

test.beforeEach(async ({ api }) => discardTimer(api));
test.afterEach(async ({ api }) => discardTimer(api));

test('Ctrl+K finds tasks with their quest; Enter opens where the task lives', async ({
	page,
	sql
}) => {
	const id = uid();
	const quest = await createQuest(sql, { name: `Palette quest ${id}` });
	const nextWeek = addDays(await today(sql), 7);
	const planned = await createTask(sql, {
		title: `Palette planned ${id}`,
		questId: quest.id,
		day: nextWeek
	});
	const backlog = await createTask(sql, { title: `Palette backlog ${id}`, questId: quest.id });
	await gotoLive(page, '/calendar');

	await openWithShortcut(page);
	await input(page).fill(planned.title);
	const option = palette(page).getByRole('option', { name: new RegExp(planned.title) });
	await expect(option).toContainText(quest.name);
	await expect(option).toHaveAttribute('aria-selected', 'true');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(`/plan?week=${mondayOf(nextWeek)}`);
	await expect(palette(page)).toBeHidden();
	await expect(
		page.locator(`[data-day="${nextWeek}"] li.task`, { hasText: planned.title })
	).toBeVisible();

	// The backlog lives in Home's Backlog sheet: the palette opens it (`?backlog=1`, dropped again).
	await openWithShortcut(page);
	await input(page).fill(backlog.title);
	await expect(
		palette(page).getByRole('option', { name: new RegExp(backlog.title) })
	).toBeVisible();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/$/);
	await expect(
		page.getByRole('dialog', { name: 'Backlog' }).locator('li.row', { hasText: backlog.title })
	).toBeVisible();
});

test('done tasks and closed quests are not found', async ({ page, sql }) => {
	const id = uid();
	const open = await createQuest(sql, { name: `Findable quest ${id}` });
	await createQuest(sql, { name: `Closed quest ${id}`, closed: true });
	const day = await today(sql);
	await createTask(sql, { title: `Open task ${id}`, questId: open.id, day });
	await createTask(sql, { title: `Done task ${id}`, questId: open.id, day, done: true });
	await gotoLive(page, '/');

	await openWithShortcut(page);
	await input(page).fill(id);
	const group = (name: string) => palette(page).getByRole('group', { name });
	await expect(group('Tasks').getByRole('option', { name: `Open task ${id}` })).toBeVisible();
	await expect(group('Quests').getByRole('option', { name: `Findable quest ${id}` })).toBeVisible();
	await expect(palette(page).getByRole('option', { name: /Done task/ })).toHaveCount(0);
	await expect(palette(page).getByRole('option', { name: /Closed quest/ })).toHaveCount(0);
});

test('LIKE wildcards in the query match literally', async ({ api, sql }) => {
	const id = uid();
	await createTask(sql, { title: `snake_case ${id}`, day: await today(sql) });
	const res = await api.get(`/api/search?q=${encodeURIComponent('_')}`);
	expect(res.status()).toBe(200);
	const body = (await res.json()) as { tasks: { title: string; questName: string | null }[] };
	expect(body.tasks.some((t) => t.title === `snake_case ${id}`)).toBe(true);
	for (const t of body.tasks) expect(`${t.title} ${t.questName ?? ''}`).toContain('_');
});

test('↑/↓ wrap, Enter opens a page; Esc closes and focus returns to the trigger', async ({
	page
}) => {
	await gotoLive(page, '/review');
	await trigger(page).click();
	await expect(input(page)).toBeFocused();

	const option = (name: string) => palette(page).getByRole('option', { name, exact: true });
	await page.keyboard.press('ArrowUp'); // from the first item to the last ("Edit profile")
	await expect(option('Edit profile')).toHaveAttribute('aria-selected', 'true');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await expect(option('Plan')).toHaveAttribute('aria-selected', 'true');
	await expect(input(page)).toHaveAttribute('aria-activedescendant', /.+/);
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/plan$/);
	await expect(palette(page)).toBeHidden();

	await trigger(page).click();
	await expect(palette(page)).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(palette(page)).toBeHidden();
	await expect(trigger(page)).toBeFocused();

	// The shortcut toggles.
	await openWithShortcut(page);
	await page.keyboard.press('ControlOrMeta+k');
	await expect(palette(page)).toBeHidden();
});

test('timer actions run on the server: pause, resume, log time, stop', async ({
	page,
	sql,
	api
}) => {
	const task = await createTask(sql, { title: `Palette timer ${uid()}`, day: await today(sql) });
	expect((await timerCmd(api, { action: 'start', taskId: task.id, mode: 'focus' })).status).toBe(
		200
	);
	const state = async () =>
		(await sql`select state from sessions where task_id = ${task.id}`)[0]?.state;
	await gotoLive(page, '/quests');

	const runAction = async (name: string) => {
		await openWithShortcut(page);
		await input(page).fill(name);
		await expect(palette(page).getByRole('option', { name: new RegExp(name) })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		await page.keyboard.press('Enter');
		await expect(palette(page)).toBeHidden();
	};

	await runAction('Pause timer');
	await expect.poll(state).toBe('paused');
	await runAction('Resume timer');
	await expect.poll(state).toBe('running');

	await runAction('Log time…');
	const log = page.getByRole('dialog', { name: 'Log time' });
	await expect(log).toContainText(task.title);
	await log.getByRole('button', { name: 'Close dialog' }).click();
	await expect(log).toBeHidden();

	await runAction('Stop timer');
	await expect.poll(state).toBe('completed');
	expect((await sql`select done_at from tasks where id = ${task.id}`)[0].done_at).toBeNull();
});

test('Shift+Enter on a task starts a focus timer for it', async ({ page, sql }) => {
	const task = await createTask(sql, { title: `Palette focus ${uid()}`, day: await today(sql) });
	await gotoLive(page, '/');
	await openWithShortcut(page);
	await input(page).fill(task.title);
	await expect(palette(page).getByRole('option', { name: new RegExp(task.title) })).toBeVisible();
	await page.keyboard.press('Shift+Enter');
	await expect(page).toHaveURL(/\/focus$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(task.title);
	const [s] = await sql`select task_id, state from sessions where state <> 'completed'`;
	expect(s).toMatchObject({ task_id: task.id, state: 'running' });
});

test('touch: tapping the search button opens the palette with the keyboard up @mobile-only', async ({
	page,
	sql
}) => {
	const id = uid();
	const quest = await createQuest(sql, { name: `Tap quest ${id}` });
	const task = await createTask(sql, {
		title: `Tap task ${id}`,
		questId: quest.id,
		day: await today(sql)
	});
	await gotoLive(page, '/calendar');

	await trigger(page).tap();
	// iOS only shows the keyboard for a focus() inside the tap itself.
	await expect(input(page)).toBeFocused();
	await page.keyboard.type(task.title);
	const option = palette(page).getByRole('option', { name: new RegExp(task.title) });
	await expect(option).toContainText(quest.name);
	await expectNoHorizontalScroll(page);
	const box = (await palette(page).boundingBox())!;
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);

	await option.tap();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.locator('li.task', { hasText: task.title })).toBeVisible();

	// No Esc key on touch: the Cancel button closes it.
	await trigger(page).tap();
	await expect(input(page)).toBeFocused();
	await palette(page).getByRole('button', { name: 'Cancel' }).tap();
	await expect(palette(page)).toBeHidden();
});

test('the search API needs a paired device', async () => {
	const res = await fetch(`${BASE}/api/search?q=a`);
	expect(res.status).toBe(401);
	expect((await res.json()).code).toBe('unauthorized');
});
