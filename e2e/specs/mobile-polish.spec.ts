/**
 * Mobile polish (phones, ≤ 720px): Home's "Next up" card, the timer mini-player above the tab
 * bar and dialogs as bottom sheets (drag to dismiss). iPad keeps the wide layout → skipped.
 */
import type { Page } from '@playwright/test';
import {
	test,
	expect,
	gotoLive,
	reloadLive,
	discardTimer,
	expectNoHorizontalScroll
} from '../support/fixtures.ts';
import { createQuest, createTask, today, uid, type Sql } from '../support/db.ts';

const active = (sql: Sql) =>
	sql`select task_id, state, duration_min from sessions where state <> 'completed'`;

test.beforeEach(async ({ api, viewport }) => {
	test.skip(viewport!.width > 720, 'Next up, the mini-player and sheets are the phone layout');
	await discardTimer(api);
});
test.afterEach(async ({ api }) => discardTimer(api));

/**
 * Drag from the centre of `target` straight down by `dy` px (mouse pointer events). Waits for
 * the sheet's slide-in first: measured mid-animation, the header has moved on by the time the
 * pointer goes down, and the drag starts on the body instead.
 */
async function dragDown(page: Page, target: ReturnType<Page['locator']>, dy: number) {
	await target.evaluate((el) =>
		Promise.all(
			(el.closest('dialog') ?? el).getAnimations({ subtree: true }).map((a) => a.finished)
		)
	);
	const box = (await target.boundingBox())!;
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x, y + dy, { steps: 12 });
	await page.mouse.up();
}

test('Next up starts focus in place; the mini-player pauses (persisted) and opens Focus @mobile', async ({
	page,
	sql
}) => {
	const id = uid();
	const day = await today(sql);
	const quest = await createQuest(sql, { name: `Next ${id}` });
	const task = await createTask(sql, {
		title: `Next up ${id}`,
		questId: quest.id,
		day,
		durationMin: 30
	});
	// First open quest task of today = the card's pick.
	await sql`update tasks set sort_order = (
		select min(sort_order) - 1 from tasks where day = ${day} and kind = 'quest'
	) where id = ${task.id}`;

	await gotoLive(page, '/');
	const next = page.getByTestId('next-up');
	await expect(next).toContainText(task.title);
	await next.getByRole('button', { name: `Start focus: ${task.title}` }).tap();

	const player = page.getByRole('region', { name: 'Active timer' });
	await expect(player).toContainText(task.title);
	await expect(next).toHaveCount(0); // the player is the "now"
	await expect(page).toHaveURL(/\/$/);
	await expect
		.poll(async () => await active(sql))
		.toEqual([{ task_id: task.id, state: 'running', duration_min: 30 }]);
	await expectNoHorizontalScroll(page);

	await player.getByRole('button', { name: 'Pause timer' }).tap();
	await expect.poll(async () => (await active(sql))[0]?.state).toBe('paused');
	await reloadLive(page);
	await expect(player.getByRole('button', { name: 'Resume timer' })).toBeVisible();
	await expect(player).toContainText('paused');

	await player.getByRole('link', { name: new RegExp(`^${task.title}, .+ open focus$`) }).tap();
	await expect(page).toHaveURL(/\/focus$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(task.title);
	await expect(page.getByTestId('mini-player')).toHaveCount(0);
	expect((await active(sql))[0]?.state).toBe('paused');
});

test('a dialog opens as a bottom sheet: dragging it down dismisses without saving; it still submits @mobile', async ({
	page,
	sql
}) => {
	const name = `Sheet ${uid()}`;
	const count = async () => (await sql`select 1 from quests where name = ${name}`).length;

	await gotoLive(page, '/quests');
	await page.getByRole('button', { name: 'New quest' }).tap();
	const sheet = page.getByRole('dialog', { name: 'New quest' });
	await expect(sheet).toBeVisible();
	await sheet.getByLabel('Name').fill(name);

	await dragDown(page, sheet.locator('header'), 320);
	await expect(sheet).toBeHidden();
	expect(await count()).toBe(0);

	await page.getByRole('button', { name: 'New quest' }).tap();
	await expect(sheet).toBeVisible();
	await expect(sheet.getByLabel('Name')).toHaveValue(''); // a fresh form
	await sheet.getByLabel('Name').fill(name);
	await sheet.getByRole('button', { name: 'Create quest' }).tap();
	await expect(sheet).toBeHidden();
	await expect.poll(count).toBe(1);
	await reloadLive(page);
	await expect(page.getByText(name, { exact: true })).toBeVisible();
	await sql`delete from quests where name = ${name}`;
});
