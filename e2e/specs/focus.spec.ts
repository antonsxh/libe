/**
 * M4 — server-side timer: start/pause/resume/complete/stop/discard, the single-active rule,
 * live propagation over SSE, overtime, pomodoro rollover (DB time shifts instead of waiting),
 * pomodoro settings, "Log time…".
 */
import type { Page } from '@playwright/test';
import { test, expect, gotoLive, actionDone, discardTimer, timerCmd } from '../support/fixtures.ts';
import { addDays, createQuest, createTask, today, uid, wallTime, type Sql } from '../support/db.ts';

const active = (sql: Sql) =>
	sql`select id, task_id, state, source, duration_min, paused_ms, paused_at, started_at
		from sessions where state <> 'completed'`;
const homeCard = (page: Page, title: string) => page.locator('li.task', { hasText: title });

test.beforeEach(async ({ api }) => discardTimer(api));
test.afterEach(async ({ api, sql }) => {
	await discardTimer(api);
	await sql`delete from settings`; // back to the default pomodoro settings
});

test('▶ starts a focus timer; pause, resume and complete are decided by the server', async ({
	page,
	sql
}) => {
	const id = uid();
	const quest = await createQuest(sql, { name: `Focus ${id}` });
	const task = await createTask(sql, {
		title: `Deep work ${id}`,
		questId: quest.id,
		day: await today(sql),
		durationMin: 40
	});
	await gotoLive(page, '/');

	await homeCard(page, task.title)
		.getByRole('link', { name: 'Start focus timer for this task' })
		.click();
	await expect(page).toHaveURL(/\/focus$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(task.title);
	let [s] = await active(sql);
	expect(s).toMatchObject({
		task_id: task.id,
		state: 'running',
		source: 'focus',
		duration_min: 40
	});

	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(page.locator('.state')).toHaveText('PAUSED');
	[s] = await active(sql);
	expect(s.state).toBe('paused');
	expect(s.paused_at).not.toBeNull();

	// Pretend we started 3 min ago and paused for the last 2: resume folds that into paused_ms.
	await sql`update sessions set started_at = started_at - interval '3 minutes',
		paused_at = paused_at - interval '2 minutes' where id = ${s.id}`;
	await page.getByRole('button', { name: 'Resume', exact: true }).click();
	await expect(page.locator('.state')).toHaveText('RUNNING');
	[s] = await active(sql);
	expect(s).toMatchObject({ state: 'running', paused_at: null });
	expect(s.paused_ms).toBeGreaterThanOrEqual(120_000);

	await page.getByRole('button', { name: 'Complete' }).click();
	await expect(page.getByRole('heading', { name: 'What are you focusing on?' })).toBeVisible();
	const [ended] = await sql`select state, ended_at from sessions where id = ${s.id}`;
	expect(ended.state).toBe('completed');
	expect(ended.ended_at).not.toBeNull();
	expect((await sql`select done_at from tasks where id = ${task.id}`)[0].done_at).not.toBeNull();

	await gotoLive(page, '/');
	await expect(homeCard(page, task.title)).toHaveClass(/done/);
});

test('Stop logs the time and keeps the task open; Discard throws the session away', async ({
	page,
	sql,
	api
}) => {
	const task = await createTask(sql, { title: `Stop or discard ${uid()}`, day: await today(sql) });
	const more = async (item: string) => {
		await page.getByRole('button', { name: 'More timer actions' }).click();
		await page.getByRole('menuitem', { name: item }).click();
	};

	await timerCmd(api, { action: 'start', taskId: task.id, mode: 'focus' });
	await gotoLive(page, '/focus');
	await more('Stop (keep task open)');
	await expect(page.getByRole('heading', { name: 'What are you focusing on?' })).toBeVisible();
	expect(await sql`select state from sessions where task_id = ${task.id}`).toEqual([
		{ state: 'completed' }
	]);
	expect((await sql`select done_at from tasks where id = ${task.id}`)[0].done_at).toBeNull();

	await timerCmd(api, { action: 'start', taskId: task.id, mode: 'focus' });
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(task.title); // via SSE
	await more('Discard session');
	await expect(page.getByRole('heading', { name: 'What are you focusing on?' })).toBeVisible();
	expect(await sql`select state from sessions where task_id = ${task.id}`).toEqual([
		{ state: 'completed' }
	]);
});

test('only one timer: a second start is a 409 unless it replaces; ▶ elsewhere asks to switch', async ({
	page,
	sql,
	api,
	console
}) => {
	console.allow(/status of 409/);
	const day = await today(sql);
	const a = await createTask(sql, { title: `Timer A ${uid()}`, day });
	const b = await createTask(sql, { title: `Timer B ${uid()}`, day });

	expect((await timerCmd(api, { action: 'start', taskId: a.id, mode: 'focus' })).status).toBe(200);
	const second = await timerCmd(api, { action: 'start', taskId: b.id, mode: 'focus' });
	expect(second).toMatchObject({ status: 409, body: { ok: false, code: 'conflict' } });
	expect((await active(sql)).map((s) => s.task_id)).toEqual([a.id]);

	await gotoLive(page, '/');
	await homeCard(page, b.title)
		.getByRole('link', { name: 'Start focus timer for this task' })
		.click();
	const dialog = page.getByRole('dialog', { name: 'Switch timer?' });
	await expect(dialog).toContainText(`${a.title} is running`);
	await dialog.getByRole('button', { name: 'Stop current and start' }).click();
	await expect(page).toHaveURL(/\/focus$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(b.title);

	expect((await active(sql)).map((s) => s.task_id)).toEqual([b.id]);
	expect(await sql`select state from sessions where task_id = ${a.id}`).toEqual([
		{ state: 'completed' }
	]);
});

test('two tabs follow the same timer live (SSE), without reloading', async ({
	page,
	context,
	sql,
	api
}) => {
	const task = await createTask(sql, { title: `Two tabs ${uid()}`, day: await today(sql) });
	await timerCmd(api, { action: 'start', taskId: task.id, mode: 'focus' });
	await gotoLive(page, '/focus');
	const home = await context.newPage();
	await gotoLive(home, '/');
	const card = homeCard(home, task.title);
	await expect(card.getByRole('button', { name: 'Pause timer' })).toBeVisible();

	await page.getByRole('button', { name: 'Pause', exact: true }).click();
	await expect(card.getByRole('button', { name: 'Resume timer' })).toBeVisible();
	await expect(
		home.getByRole('link', { name: new RegExp(`\\(paused\\): ${task.title}`) })
	).toBeVisible();

	await card.getByRole('button', { name: 'Resume timer' }).click();
	await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	await expect(page.locator('.state')).toHaveText('RUNNING');

	await page.getByRole('button', { name: 'Complete' }).click();
	await expect(card).toHaveClass(/done/); // the other tab reloads its data on session change
	await expect(home.locator('a.chip')).toHaveCount(0);
});

test("deleting the running task's card ends the timer in every tab", async ({
	page,
	context,
	sql,
	api
}) => {
	const task = await createTask(sql, { title: `Delete running ${uid()}`, day: await today(sql) });
	await timerCmd(api, { action: 'start', taskId: task.id, mode: 'focus' });
	await gotoLive(page, '/plan');
	await expect(page.locator('a.chip')).toContainText(task.title);

	const home = await context.newPage();
	await gotoLive(home, '/');
	await homeCard(home, task.title)
		.getByRole('button', { name: `Actions for ${task.title}` })
		.click();
	const done = actionDone(home, 'deleteTask');
	await home.getByRole('menuitem', { name: 'Delete' }).click();
	await done;

	await expect(page.locator('a.chip')).toHaveCount(0);
	expect(await active(sql)).toHaveLength(0);
});

test('past its planned minutes the timer keeps counting as overtime', async ({
	page,
	sql,
	api
}) => {
	const task = await createTask(sql, { title: `Overtime ${uid()}`, day: await today(sql) });
	await timerCmd(api, { action: 'start', taskId: task.id, mode: 'focus', plannedMin: 1 });
	await sql`update sessions set started_at = started_at - interval '3 minutes' where state = 'running'`;

	await gotoLive(page, '/focus');
	await expect(page.locator('.state')).toHaveText('OVERTIME');
	await expect(page.locator('.clock')).toHaveText(/^\+02:\d\d$/);
	expect((await active(sql))[0].state).toBe('running');
});

test('pomodoro settings persist; without auto-start a finished round waits for its break', async ({
	page,
	sql
}) => {
	const task = await createTask(sql, { title: `Pomodoro wait ${uid()}`, day: await today(sql) });
	await gotoLive(page, `/focus?task=${task.id}`);

	await page.getByRole('button', { name: 'Pomodoro settings' }).click();
	const dialog = page.getByRole('dialog', { name: 'Pomodoro settings' });
	await dialog.locator('input[name=focusMin]').fill('20');
	await dialog.getByLabel('Start breaks and the next round automatically').uncheck();
	const done = actionDone(page, 'settings');
	await dialog.getByRole('button', { name: 'Save' }).click();
	await done;
	await expect(dialog).toBeHidden();
	const [row] = await sql`select pomodoro_focus_min, pomodoro_auto_start from settings`;
	expect(row).toEqual({ pomodoro_focus_min: 20, pomodoro_auto_start: false });

	await page.getByRole('radiogroup', { name: 'Timer mode' }).getByText('Pomodoro').click();
	await expect(page.locator('.pomo')).toContainText('20 min focus');
	await page.getByRole('button', { name: 'Start', exact: true }).click();
	await expect(page.locator('.state')).toHaveText('FOCUS · ROUND 1/4');
	const [run] = await sql`select id from pomodoro_runs where ended_at is null`;
	const [s1] = await active(sql);
	expect(s1).toMatchObject({ source: 'pomodoro', duration_min: 20 });

	// 21 minutes later (shifted in the DB): round 1 ends at exactly start + 20 min.
	await sql`update pomodoro_runs set phase_started_at = phase_started_at - interval '21 minutes' where id = ${run.id}`;
	await sql`update sessions set started_at = started_at - interval '21 minutes' where id = ${s1.id}`;
	await page.reload();
	await expect(page.getByRole('button', { name: 'Start break' })).toBeVisible();
	await expect(page.locator('.state')).toHaveText('BREAK TIME');
	const [ended] = await sql`
		select state, extract(epoch from ended_at - started_at)::int as secs from sessions where id = ${s1.id}`;
	expect(ended).toEqual({ state: 'completed', secs: 20 * 60 });
	expect(
		(await sql`select phase, phase_started_at from pomodoro_runs where id = ${run.id}`)[0]
	).toEqual({
		phase: 'short_break',
		phase_started_at: null
	});

	await page.getByRole('button', { name: 'Start break' }).click();
	await expect(page.getByRole('button', { name: 'Skip break' })).toBeVisible();
	await page.getByRole('button', { name: 'Skip break' }).click();
	await expect(page.locator('.state')).toHaveText('FOCUS · ROUND 2/4');
	expect((await active(sql)).map((s) => s.source)).toEqual(['pomodoro']);

	// The Settings page shows the same (global) settings.
	await gotoLive(page, '/settings');
	await expect(page.getByText(/Pomodoro: 20 min focus/)).toBeVisible();
	await expect(page.getByText(/auto-start/)).toHaveCount(0);
});

test('with auto-start a pomodoro rolls through the break into round 2 and every tab sees it', async ({
	page,
	sql,
	api
}) => {
	const task = await createTask(sql, { title: `Pomodoro auto ${uid()}`, day: await today(sql) });
	await timerCmd(api, { action: 'start', taskId: task.id, mode: 'pomodoro' });
	await gotoLive(page, '/focus');
	await expect(page.locator('.state')).toHaveText('FOCUS · ROUND 1/4');

	// 25 min focus + 5 min break + 1 min: a read rolls the run forward and broadcasts it.
	await sql`update pomodoro_runs set phase_started_at = phase_started_at - interval '31 minutes' where ended_at is null`;
	await sql`update sessions set started_at = started_at - interval '31 minutes' where state = 'running'`;
	await api.get('/api/timer');

	await expect(page.locator('.state')).toHaveText('FOCUS · ROUND 2/4');
	const rounds = await sql`
		select state, extract(epoch from started_at - min(started_at) over ())::int as offset_s,
			extract(epoch from ended_at - started_at)::int as secs
		from sessions where task_id = ${task.id} order by started_at`;
	expect(rounds).toEqual([
		{ state: 'completed', offset_s: 0, secs: 25 * 60 },
		{ state: 'running', offset_s: 30 * 60, secs: null }
	]);
});

test('"Log time…" validates on the server, logs a manual session and deletes it again', async ({
	page,
	sql,
	api,
	console
}) => {
	console.allow(/status of 400/);
	const day = await today(sql);
	const yesterday = addDays(day, -1);
	const task = await createTask(sql, { title: `Log later ${uid()}`, day });
	const other = await createTask(sql, { title: `Running meanwhile ${uid()}`, day });
	await gotoLive(page, '/');

	await homeCard(page, task.title)
		.getByRole('button', { name: `Actions for ${task.title}` })
		.click();
	await page.getByRole('menuitem', { name: 'Log time…' }).click();
	const dialog = page.getByRole('dialog', { name: 'Log time' });
	const submit = () => dialog.getByRole('button', { name: 'Log time' }).click();

	await dialog.getByLabel('Date').fill(addDays(day, 1));
	await dialog.getByLabel('Start', { exact: true }).fill('00:00');
	await submit();
	await expect(dialog.getByRole('alert')).toHaveText('That time is in the future.');

	// Overlapping the running timer is rejected, too.
	await timerCmd(api, { action: 'start', taskId: other.id, mode: 'focus' });
	await sql`update sessions set started_at = now() - interval '40 minutes' where state = 'running'`;
	const [{ started_at }] = await active(sql);
	const [{ d }] =
		await sql`select to_char(${started_at}::timestamptz at time zone 'Europe/Berlin', 'YYYY-MM-DD') as d`;
	await dialog.getByLabel('Date').fill(d);
	await dialog
		.getByLabel('Start', { exact: true })
		.fill(await wallTime(sql, new Date(started_at.getTime() + 10 * 60_000)));
	await dialog.getByLabel('Minutes').fill('5');
	await submit();
	await expect(dialog.getByRole('alert')).toContainText('overlaps the running timer');
	expect(await sql`select 1 from sessions where task_id = ${task.id}`).toHaveLength(0);

	await dialog.getByLabel('Date').fill(yesterday);
	await dialog.getByLabel('Start', { exact: true }).fill('10:00');
	await dialog.getByLabel('Minutes').fill('45');
	await expect(dialog.getByLabel('End', { exact: true })).toHaveValue('10:45');
	await dialog.getByLabel('Mark task as done').check();
	await submit();
	await expect(dialog.getByRole('status')).toHaveText('Logged 45 min.');
	const sessions = dialog.getByRole('region', { name: 'Sessions on this day' });
	await expect(sessions.locator('li')).toHaveText([/10:00 – 10:45\s*45 min\s*Manual/]);
	const [logged] = await sql`
		select id, source, duration_min,
			to_char(started_at at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI') as start,
			extract(epoch from ended_at - started_at)::int as secs
		from sessions where task_id = ${task.id}`;
	expect(logged).toMatchObject({
		source: 'manual',
		duration_min: 45,
		start: `${yesterday} 10:00`,
		secs: 2700
	});
	expect((await sql`select done_at from tasks where id = ${task.id}`)[0].done_at).not.toBeNull();

	await sessions.getByRole('button', { name: 'Delete session 10:00' }).click();
	await expect(sessions).toContainText('Nothing logged yet.');
	expect(await sql`select 1 from sessions where id = ${logged.id}`).toHaveLength(0);
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	test('the focus screen starts and completes a timer through plain form posts', async ({
		page,
		sql
	}) => {
		const task = await createTask(sql, {
			title: `No JS ${uid()}`,
			day: await today(sql),
			durationMin: 15
		});
		await page.goto(`/focus?task=${task.id}`);
		await page.getByRole('button', { name: 'Start', exact: true }).click();
		await expect(page).toHaveURL(/\/focus$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(task.title);
		expect(await active(sql)).toMatchObject([
			{ task_id: task.id, state: 'running', duration_min: 15 }
		]);

		await page.getByRole('button', { name: 'Complete' }).click();
		await expect(page.getByRole('heading', { name: 'What are you focusing on?' })).toBeVisible();
		expect(await sql`select state from sessions where task_id = ${task.id}`).toEqual([
			{ state: 'completed' }
		]);
		expect((await sql`select done_at from tasks where id = ${task.id}`)[0].done_at).not.toBeNull();
	});
});
