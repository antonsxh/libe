/**
 * First-run flow (`/welcome`, O2): a first-device `/setup` lands there while
 * `settings.onboarded_at` is null; the steps save the daily goal, create a quest with today's
 * first step and start a focus on it; finishing or skipping sets `onboarded_at`, after which
 * `/welcome` redirects Home. Nothing else redirects to it (other pairings, app pages).
 *
 * `onboarded_at`, the daily goal and the timer are global state: every test resets them
 * (onboarded, no goal, no timer) — the seed marks the install onboarded, the rest of the
 * suite relies on it.
 */
import type { Browser } from '@playwright/test';
import {
	test,
	expect,
	gotoLive,
	live,
	discardTimer,
	expectNoHorizontalScroll
} from '../support/fixtures.ts';
import { freshIp } from '../support/auth.ts';
import { today, uid, type Sql } from '../support/db.ts';
import { BASE, SETUP_SECRET } from '../support/env.ts';

const onboardedAt = async (sql: Sql) =>
	(await sql`select onboarded_at from settings where id = 1`)[0]?.onboarded_at ?? null;
const dailyGoal = async (sql: Sql) =>
	(await sql`select daily_goal_min from settings where id = 1`)[0]?.daily_goal_min ?? null;
const questCount = async (sql: Sql) => (await sql`select count(*)::int as n from quests`)[0].n;

test.beforeEach(async ({ sql, api }) => {
	await discardTimer(api);
	await sql`insert into settings (id, onboarded_at, daily_goal_min) values (1, null, null)
		on conflict (id) do update set onboarded_at = null, daily_goal_min = null`;
});

test.afterEach(async ({ sql, api }) => {
	await discardTimer(api);
	await sql`update settings set onboarded_at = now(), daily_goal_min = null where id = 1`;
});

/** Temporarily no paired device → the next `/setup` is the first device's. */
async function withoutDevices(sql: Sql, fn: () => Promise<void>) {
	const revoked =
		await sql`update devices set revoked_at = now() where revoked_at is null returning id`;
	try {
		await fn();
	} finally {
		await sql`update devices set revoked_at = null where id in ${sql(revoked.map((r) => r.id))}`;
	}
}

async function anonymous(browser: Browser) {
	return browser.newContext({
		storageState: { cookies: [], origins: [] },
		serviceWorkers: 'block',
		extraHTTPHeaders: { 'x-forwarded-for': freshIp() }
	});
}

test('a first pairing walks through goal, quest, first step and a first focus', async ({
	browser,
	sql,
	console
}) => {
	const device = `First ${uid()}`;
	const quest = `Spanish ${uid()}`;
	const ctx = await anonymous(browser);
	console.watch(ctx);
	const page = await ctx.newPage();
	try {
		await withoutDevices(sql, async () => {
			await page.goto('/setup');
			await page.locator('input[name=secret]').fill(SETUP_SECRET);
			await page.getByLabel('Device name').fill(device);
			await page.getByRole('button', { name: 'Pair this device' }).click();
			await expect(page).toHaveURL(`${BASE}/welcome`);
			await live(page);
		});
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to libe');

		// Step 1: the goal list preselects 1 h; pick 2 h.
		await page.getByRole('link', { name: 'Get started' }).click();
		await expect(page).toHaveURL(/\/welcome\?step=1$/);
		const goals = page.getByRole('group', { name: 'Daily goal' });
		await expect(goals.getByRole('radio', { name: '1 h' })).toBeChecked();
		await goals.getByText('2 h').click();
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page).toHaveURL(/\/welcome\?step=2$/);
		expect(await dailyGoal(sql)).toBe(120);

		// Step 2: quest + first step today, 45 min.
		await page.getByRole('textbox', { name: 'Quest name' }).fill(quest);
		await page.getByRole('radio', { name: 'blue' }).check();
		await page.getByRole('textbox', { name: 'First step' }).fill('Lesson one');
		await page
			.getByRole('radiogroup', { name: 'Duration' })
			.getByRole('radio', { name: '45 min' })
			.check();
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page).toHaveURL(/\/welcome\?step=3&task=/);
		const [row] = await sql`
			select q.color, t.id, t.title, t.day::text as day, t.duration_min, t.kind
			from quests q join tasks t on t.quest_id = q.id where q.name = ${quest}`;
		expect(row).toMatchObject({
			color: 'blue',
			title: 'Lesson one',
			day: await today(sql),
			duration_min: 45,
			kind: 'quest'
		});
		await expect(page.getByTestId('welcome-task')).toContainText('45 min planned');

		// Back to step 2 edits the same pair instead of creating a second one.
		await page.getByRole('link', { name: 'Back' }).click();
		await expect(page.getByRole('textbox', { name: 'First step' })).toHaveValue('Lesson one');
		await page.getByRole('textbox', { name: 'First step' }).fill('Lesson 1');
		await page.getByRole('button', { name: 'Continue' }).click();
		await expect(page.getByTestId('welcome-task')).toContainText('Lesson 1');
		const tasks = await sql`
			select t.id, t.title from quests q join tasks t on t.quest_id = q.id where q.name = ${quest}`;
		expect(tasks).toEqual([{ id: row.id, title: 'Lesson 1' }]);
		expect(await onboardedAt(sql)).toBeNull();

		// Step 3: Start focus → a running session on that task, Focus, onboarded.
		await page.getByRole('button', { name: 'Start focus' }).click();
		await expect(page).toHaveURL(`${BASE}/focus`);
		await expect
			.poll(async () => (await sql`select state from sessions where task_id = ${row.id}`)[0]?.state)
			.toBe('running');
		expect(await onboardedAt(sql)).not.toBeNull();

		await page.goto('/welcome');
		await expect(page).toHaveURL(`${BASE}/`);
	} finally {
		await ctx.close();
		await sql`update devices set revoked_at = now() where name = ${device}`;
		await sql`delete from quests where name = ${quest}`;
	}
});

test('skipping every step still finishes the flow and creates nothing @mobile', async ({
	page,
	sql
}) => {
	const quests = await questCount(sql);
	await gotoLive(page, '/welcome');
	await expectNoHorizontalScroll(page);
	await page.getByRole('link', { name: 'Get started' }).click();
	await page.getByRole('link', { name: 'Set later' }).click();
	await expect(page).toHaveURL(/\/welcome\?step=2$/);
	await page.getByRole('link', { name: 'Skip' }).click();
	await expect(page).toHaveURL(/\/welcome\?step=3$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('You’re all set');
	await expect(page.getByRole('button', { name: 'Start focus' })).toHaveCount(0);
	await expectNoHorizontalScroll(page);

	// A reload keeps the step (it lives in the URL), and nothing is done before the last button.
	await page.reload();
	await live(page);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('You’re all set');
	expect(await onboardedAt(sql)).toBeNull();

	await page.getByRole('button', { name: 'Go to Home' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect.poll(() => onboardedAt(sql)).not.toBeNull();
	expect(await dailyGoal(sql)).toBeNull();
	expect(await questCount(sql)).toBe(quests);
});

test('never a trap: app pages and other pairings don’t redirect, "Skip setup" ends it', async ({
	page,
	sql,
	console
}) => {
	console.allow(/status of 400/); // the invalid step 2 submit below
	// Not onboarded, but Home stays Home.
	await gotoLive(page, '/');
	await expect(page).toHaveURL(/\/$/);

	// A /setup while devices exist (recovery, another device) keeps its `next`.
	const device = `Second ${uid()}`;
	const res = await fetch(`${BASE}/setup`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			origin: BASE,
			accept: 'text/html',
			'content-type': 'application/x-www-form-urlencoded',
			'x-forwarded-for': freshIp()
		},
		body: new URLSearchParams({ secret: SETUP_SECRET, name: device, next: '/plan' })
	});
	expect(res.status).toBe(303);
	expect(res.headers.get('location')).toBe('/plan');
	await sql`update devices set revoked_at = now() where name = ${device}`;

	// Step 2 validates on the server and creates nothing.
	const quests = await questCount(sql);
	await gotoLive(page, '/welcome?step=2');
	await page.getByRole('button', { name: 'Continue' }).click();
	await expect(page.getByRole('alert')).toContainText('Give the quest a name.');
	await expect(page).toHaveURL(/\/welcome\?step=2$/);
	expect(await questCount(sql)).toBe(quests);

	await gotoLive(page, '/welcome');
	await page.getByRole('button', { name: 'Skip setup' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect.poll(() => onboardedAt(sql)).not.toBeNull();
	await page.goto('/welcome');
	await expect(page).toHaveURL(/\/$/);
});
