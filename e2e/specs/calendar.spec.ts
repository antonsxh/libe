/**
 * M5 — Calendar: sessions drawn at their wall-clock span in the server TZ (overlap columns,
 * midnight split, pauses not cut out), day/week totals, edit/delete/log through the dialog,
 * the live entry, the now line, the plan overlay.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect, gotoLive, discardTimer, reloadLive, timerCmd } from '../support/fixtures.ts';
import {
	addDays,
	createQuest,
	createSession,
	createTask,
	emptyPastWeek,
	today,
	uid,
	wallTime
} from '../support/db.ts';

const col = (page: Page, day: string) => page.locator(`.cal .col[data-day="${day}"]`);
const segments = (page: Page, id: string) => page.locator(`.cal [data-session="${id}"]`);

/** Placement of a drawn entry: minutes-of-day top/bottom and its overlap lane. */
async function place(entry: Locator) {
	return entry.evaluate((el) => {
		const v = (name: string) => Number((el as HTMLElement).style.getPropertyValue(name));
		return {
			day: el.closest<HTMLElement>('.col')!.dataset.day,
			t: v('--t'),
			b: v('--b'),
			col: v('--col'),
			cols: v('--cols')
		};
	});
}

test('entries sit at their wall-clock span: overlap lanes, midnight split, pauses not cut out; totals', async ({
	page,
	sql
}) => {
	const id = uid();
	const monday = await emptyPastWeek(sql);
	const quest = await createQuest(sql, { name: `Cal ${id}` });
	const qt = await createTask(sql, { title: `Cal quest ${id}`, questId: quest.id });
	const ot = await createTask(sql, { title: `Cal other ${id}` });
	const wed = addDays(monday, 2);
	const fri = addDays(monday, 4);
	const s1 = await createSession(sql, { taskId: qt.id, day: monday, start: '09:00', minutes: 90 });
	const s2 = await createSession(sql, { taskId: ot.id, day: monday, start: '10:00', minutes: 60 });
	const s3 = await createSession(sql, { taskId: qt.id, day: wed, start: '22:30', minutes: 150 });
	const s4 = await createSession(sql, {
		taskId: ot.id,
		day: fri,
		start: '14:00',
		minutes: 30,
		pausedMin: 10
	});

	await gotoLive(page, `/calendar?week=${monday}`);
	expect(await place(segments(page, s1))).toEqual({ day: monday, t: 540, b: 630, col: 0, cols: 2 });
	expect(await place(segments(page, s2))).toEqual({ day: monday, t: 600, b: 660, col: 1, cols: 2 });
	await expect(segments(page, s3)).toHaveCount(2);
	expect(await place(segments(page, s3).first())).toMatchObject({
		day: wed,
		t: 1350,
		b: 1440,
		cols: 1
	});
	expect(await place(segments(page, s3).last())).toMatchObject({
		day: addDays(wed, 1),
		t: 0,
		b: 60
	});
	await expect(segments(page, s3).first()).toHaveAccessibleName(/Wed 22:30 – Thu 01:00/);
	expect(await place(segments(page, s4))).toMatchObject({ day: fri, t: 840, b: 880 });

	await expect(page.getByTestId('day-total')).toHaveText([
		'2 h 30 min',
		'0 min',
		'1 h 30 min',
		'1 h',
		'30 min',
		'0 min',
		'0 min'
	]);
	await expect(page.getByTestId('week-total')).toHaveText('5 h 30 min');
	await expect(page.getByTestId('quest-total')).toHaveText('/ 4h quest');
});

test('click an entry to edit its span (resets pauses) or delete it', async ({
	page,
	sql,
	console
}) => {
	console.allow(/status of 400/);
	const id = uid();
	const monday = await emptyPastWeek(sql);
	const tue = addDays(monday, 1);
	const task = await createTask(sql, { title: `Edit me ${id}` });
	const sid = await createSession(sql, {
		taskId: task.id,
		day: tue,
		start: '09:00',
		minutes: 60,
		pausedMin: 5
	});
	await gotoLive(page, `/calendar?week=${monday}`);

	await segments(page, sid).click();
	const dialog = page.getByRole('dialog', { name: 'Edit session' });
	await expect(dialog.getByLabel('Start time')).toHaveValue('09:00');
	await expect(dialog.getByLabel('End time')).toHaveValue('10:05');
	await dialog.getByLabel('End time').fill('08:30');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog.getByRole('alert')).toHaveText('End must be after the start.');

	await dialog.getByLabel('End time').fill('10:30');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await expect(dialog).toBeHidden();
	await expect(segments(page, sid)).toHaveAccessibleName(/09:00 – 10:30/);
	await expect(page.getByTestId('day-total').nth(1)).toHaveText('1 h 30 min');
	const [row] = await sql`
		select paused_ms, extract(epoch from ended_at - started_at)::int as secs from sessions where id = ${sid}`;
	expect(row).toEqual({ paused_ms: 0, secs: 90 * 60 });

	await segments(page, sid).click();
	await page
		.getByRole('dialog', { name: 'Edit session' })
		.getByRole('button', { name: 'Delete' })
		.click();
	await expect(segments(page, sid)).toHaveCount(0);
	await expect(page.getByTestId('week-total')).toHaveText('0 min');
	expect(await sql`select 1 from sessions where id = ${sid}`).toHaveLength(0);
});

test('click an empty slot to log time there (rounded down to 15 min, 30 min long)', async ({
	page,
	sql
}) => {
	const id = uid();
	const monday = await emptyPastWeek(sql);
	const thu = addDays(monday, 3);
	const task = await createTask(sql, { title: `Slot task ${id}` });
	// One session elsewhere in the week, so it shows its grid (an empty week shows its empty state).
	const other = await createTask(sql, { title: `Slot neighbour ${id}` });
	await createSession(sql, { taskId: other.id, day: monday, start: '10:00', minutes: 30 });
	await gotoLive(page, `/calendar?week=${monday}`);

	// No session before 6:00 → grid starts at 6:00; 50 px per hour below a 10 px pad. 13:22 → 13:15.
	const y = 10 + ((13 * 60 + 22 - 6 * 60) / 60) * 50;
	await col(page, thu)
		.getByRole('button', { name: /^Log time on/ })
		.click({ position: { x: 30, y } });
	const dialog = page.getByRole('dialog', { name: 'Log time' });
	await expect(dialog.getByLabel('Start date')).toHaveValue(thu);
	await expect(dialog.getByLabel('Start time')).toHaveValue('13:15');
	await expect(dialog.getByLabel('End time')).toHaveValue('13:45');

	await dialog.getByPlaceholder('Search tasks…').fill(id);
	await dialog.getByRole('radiogroup', { name: 'Task' }).getByText(task.title).click();
	await dialog.getByRole('button', { name: 'Log time' }).click();
	await expect(dialog).toBeHidden();

	const [row] = await sql`
		select id, source, to_char(started_at at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI') as start,
			extract(epoch from ended_at - started_at)::int as secs
		from sessions where task_id = ${task.id}`;
	expect(row).toMatchObject({ source: 'manual', start: `${thu} 13:15`, secs: 1800 });
	expect(await place(segments(page, row.id))).toMatchObject({ day: thu, t: 795, b: 825 });
});

test('an empty week shows one sentence and "Log time", which logs a session and brings the grid back', async ({
	page,
	sql
}) => {
	const id = uid();
	const monday = await emptyPastWeek(sql);
	const task = await createTask(sql, { title: `Empty week task ${id}` });
	await gotoLive(page, `/calendar?week=${monday}`);

	const empty = page.getByTestId('calendar-empty');
	await expect(empty).toContainText('This week is empty');
	await expect(page.locator('.cal')).toHaveCount(0);
	// The week nav stays, so other weeks are one click away.
	await expect(page.getByRole('link', { name: 'Previous week' })).toBeVisible();

	// A past week: "Log time" proposes its Monday, 09:00–09:30.
	await empty.getByRole('button', { name: 'Log time' }).click();
	const dialog = page.getByRole('dialog', { name: 'Log time' });
	await expect(dialog.getByLabel('Start date')).toHaveValue(monday);
	await expect(dialog.getByLabel('Start time')).toHaveValue('09:00');
	await expect(dialog.getByLabel('End time')).toHaveValue('09:30');
	await dialog.getByPlaceholder('Search tasks…').fill(id);
	await dialog.getByRole('radiogroup', { name: 'Task' }).getByText(task.title).click();
	await dialog.getByRole('button', { name: 'Log time' }).click();
	await expect(dialog).toBeHidden();

	const [row] = await sql`
		select id, to_char(started_at at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI') as start,
			extract(epoch from ended_at - started_at)::int as secs
		from sessions where task_id = ${task.id}`;
	expect(row).toMatchObject({ start: `${monday} 09:00`, secs: 1800 });
	await reloadLive(page);
	await expect(page.getByTestId('calendar-empty')).toHaveCount(0);
	expect(await place(segments(page, row.id))).toMatchObject({ day: monday, t: 540, b: 570 });
	await expect(page.getByTestId('week-total')).toHaveText('30 min');
});

test('the running session is drawn live and follows pause over SSE; the now line is only in this week', async ({
	page,
	sql,
	api
}) => {
	await discardTimer(api);
	const task = await createTask(sql, { title: `Live entry ${uid()}`, day: await today(sql) });
	await timerCmd(api, { action: 'start', taskId: task.id, mode: 'focus' });
	await sql`update sessions set started_at = now() - interval '50 minutes' where state = 'running'`;
	const [{ started_at }] = await sql`select started_at from sessions where state = 'running'`;
	const since = await wallTime(sql, started_at);
	try {
		await gotoLive(page, '/calendar');
		const entry = page.locator('.cal a.entry.active');
		await expect(entry.first()).toHaveAccessibleName(`Running: ${task.title}, since ${since}`);
		await expect(entry.first()).toHaveAttribute('href', '/focus');
		await expect(page.locator('.cal .now-layer')).toHaveCount(1);

		await timerCmd(api, { action: 'pause' });
		await expect(entry.first()).toHaveAccessibleName(`Paused: ${task.title}, since ${since}`);

		await page.getByRole('link', { name: 'Previous week' }).click();
		await expect(page).toHaveURL(/week=/);
		await expect(page.locator('.cal .now-layer')).toHaveCount(0);
		await expect(page.locator('.cal a.entry.active')).toHaveCount(0);
	} finally {
		await discardTimer(api);
	}
});

test('"Show plan" overlays the week\'s time blocks and keeps the week', async ({ page, sql }) => {
	const id = uid();
	const monday = await emptyPastWeek(sql);
	const tue = addDays(monday, 1);
	const task = await createTask(sql, { title: `Planned ${id}`, day: tue });
	await sql`insert into blocks (task_id, day, start_min, end_min) values (${task.id}, ${tue}, 900, 960)`;

	await gotoLive(page, `/calendar?week=${monday}`);
	await expect(page.locator('.cal .plan')).toHaveCount(0);
	await page.getByRole('link', { name: 'Show plan' }).click();
	await expect(page).toHaveURL(new RegExp(`week=${monday}`));
	await expect(page).toHaveURL(/plan=1/);
	const block = col(page, tue).locator('.plan', { hasText: task.title });
	await expect(block).toHaveAttribute('title', `Planned: ${task.title}`);
	const pos = await block.evaluate((el) => [
		(el as HTMLElement).style.getPropertyValue('--t'),
		(el as HTMLElement).style.getPropertyValue('--b')
	]);
	expect(pos.map(Number)).toEqual([900, 960]);

	await page.getByRole('link', { name: 'Hide plan' }).click();
	await expect(page.locator('.cal .plan')).toHaveCount(0);
});
