/**
 * Profile (display name, avatar colour and emoji, daily goal — global in the `settings` row):
 * Settings → Profile / Daily goal persist and drive the nav avatar (emoji, goal ring and its
 * accessible progress, live with the timer), the account menu, Home's greeting and stat, the
 * Focus and Review texts; server-side validation; `/setup`'s optional "Your name" only fills
 * an empty name and is never shown on the public page; the one-time welcome after pairing.
 *
 * The profile, the goal and the timer are global state — every test resets them (no name,
 * amber, no emoji, no goal, no timer), which the rest of the suite relies on.
 */
import type { Browser, Page } from '@playwright/test';
import {
	test,
	expect,
	gotoLive,
	actionDone,
	live,
	reloadLive,
	expectNoHorizontalScroll,
	discardTimer,
	timerCmd
} from '../support/fixtures.ts';
import { freshIp, pairWithSecret } from '../support/auth.ts';
import {
	createSession,
	createTask,
	emptyPastWeek,
	loggedMinutes,
	today,
	uid,
	type Sql
} from '../support/db.ts';
import { BASE, SETUP_SECRET } from '../support/env.ts';

async function setProfile(
	sql: Sql,
	displayName: string | null,
	avatarColor = 'amber',
	{ emoji = null, goalMin = null }: { emoji?: string | null; goalMin?: number | null } = {}
) {
	await sql`
		insert into settings (id, display_name, avatar_color, avatar_emoji, daily_goal_min)
		values (1, ${displayName}, ${avatarColor}, ${emoji}, ${goalMin})
		on conflict (id) do update
		set display_name = excluded.display_name, avatar_color = excluded.avatar_color,
			avatar_emoji = excluded.avatar_emoji, daily_goal_min = excluded.daily_goal_min`;
}
const storedProfile = async (sql: Sql) =>
	(await sql`select display_name, avatar_color from settings where id = 1`)[0] ?? null;
const storedExtras = async (sql: Sql) =>
	(await sql`select avatar_emoji, daily_goal_min from settings where id = 1`)[0] ?? null;

/** Minutes logged today (completed sessions started today, server TZ) — Home's definition. */
async function loggedToday(sql: Sql): Promise<number> {
	const [r] = await sql`
		select coalesce(sum(${loggedMinutes(sql)}), 0)::float8 as min from sessions s
		where s.state = 'completed'
			and (s.started_at at time zone 'Europe/Berlin')::date = ${await today(sql)}::date`;
	return r.min;
}
/** "2 h 10 min" — the avatar's progress wording (whole minutes, rounded down). */
function hm(min: number): string {
	const m = Math.floor(min);
	const [h, r] = [Math.floor(m / 60), m % 60];
	return h === 0 ? `${r} min` : r === 0 ? `${h} h` : `${h} h ${r} min`;
}
/** Accessible name of the avatar with a goal; `logged` may be fractional (±1 min tolerated). */
const progressName = (logged: number, goal: string) =>
	new RegExp(`^Account and devices, (${hm(logged)}|${hm(logged + 1)}) of ${goal} today$`);

const avatar = (page: Page) => page.getByRole('button', { name: /^Account and devices/ });
const GREETING = /^(Good morning|Good afternoon|Good evening|Still up)/;
const greeting = (page: Page) => page.getByText(GREETING);

/** "Avatar shows: Emoji" (a segmented control — the label takes the click). */
const chooseEmojiStyle = (page: Page) =>
	page.locator('label', { has: page.getByRole('radio', { name: 'Emoji', exact: true }) }).click();

async function saveProfile(page: Page, name: string) {
	await page.getByLabel('Name', { exact: true }).fill(name);
	const done = actionDone(page, 'profile');
	await page.getByRole('button', { name: 'Save profile' }).click();
	await done;
}

test.beforeEach(async ({ sql, api }) => {
	await setProfile(sql, null);
	await discardTimer(api);
});
test.afterEach(async ({ sql, api }) => {
	await setProfile(sql, null);
	await discardTimer(api);
});

test('Settings → Profile: name and colour persist; nav avatar, menu and Home greeting follow @mobile', async ({
	page,
	sql
}) => {
	await gotoLive(page, '/');
	await expect(avatar(page)).toHaveText('');
	await expect(greeting(page)).toHaveText(
		/^(Good morning|Good afternoon|Good evening|Still up\?)$/
	);

	// The palette's "Edit profile" lands on the section.
	await page.getByRole('button', { name: 'Search or jump…' }).click();
	await page.getByRole('combobox', { name: /Search pages/ }).fill('profile');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(`${BASE}/settings#profile`);
	await expect(page.getByLabel('Name', { exact: true })).toBeInViewport();

	await page.locator('label', { has: page.getByRole('radio', { name: 'Teal' }) }).click();
	await saveProfile(page, '  Anton   Schmidt ');
	await expect
		.poll(() => storedProfile(sql))
		.toEqual({
			display_name: 'Anton Schmidt',
			avatar_color: 'teal'
		});
	// The layout data was refreshed: the nav avatar shows the initials without a reload.
	await expect(avatar(page)).toHaveText('AS');
	await expectNoHorizontalScroll(page);

	await reloadLive(page);
	await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Anton Schmidt');
	await expect(page.getByRole('radio', { name: 'Teal' })).toBeChecked();
	await expect(avatar(page)).toHaveAccessibleName('Account and devices (Anton Schmidt)');
	await avatar(page).click();
	const menu = page.getByRole('menu');
	await expect(menu).toContainText('Anton Schmidt');
	await expect(menu).toContainText('This device: e2e browser');
	await page.keyboard.press('Escape');

	await gotoLive(page, '/');
	await expect(avatar(page)).toHaveText('AS');
	await expect(greeting(page)).toHaveText(
		/^(Good morning|Good afternoon|Good evening|Still up), Anton Schmidt\??$/
	);
});

test('Profile name: 40 characters pass, 41 are rejected, whitespace-only clears the name', async ({
	page,
	sql,
	console
}) => {
	console.allow(/status of 400/);
	await setProfile(sql, 'Anton', 'blue');
	await gotoLive(page, '/settings');
	await expect(avatar(page)).toHaveText('A');

	await saveProfile(page, 'b'.repeat(41));
	await expect(page.getByRole('alert')).toHaveText('Keep the name to at most 40 characters.');
	expect(await storedProfile(sql)).toEqual({ display_name: 'Anton', avatar_color: 'blue' });
	await expect(avatar(page)).toHaveText('A');

	await saveProfile(page, 'b'.repeat(40));
	await expect.poll(async () => (await storedProfile(sql))?.display_name).toBe('b'.repeat(40));
	await expect(avatar(page)).toHaveText('B');

	await saveProfile(page, '   ');
	await expect.poll(() => storedProfile(sql)).toEqual({ display_name: null, avatar_color: 'blue' });
	await expect(avatar(page)).toHaveText('');
	await expect(avatar(page)).toHaveAccessibleName('Account and devices');
});

/** Temporarily no paired device → `/setup` is the first-device setup with "Your name". */
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

test('first /setup: "Your name" sets the profile and the first page welcomes once', async ({
	browser,
	sql,
	console
}) => {
	const device = `First ${uid()}`;
	const ctx = await anonymous(browser);
	console.watch(ctx);
	const page = await ctx.newPage();
	await withoutDevices(sql, async () => {
		await page.goto('/setup');
		await page.locator('input[name=secret]').fill(SETUP_SECRET);
		await page.getByLabel('Device name').fill(device);
		await page.getByLabel('Your name').fill(' Mia  Lee ');
		await page.getByRole('button', { name: 'Pair this device' }).click();
		await expect(page).toHaveURL(`${BASE}/`);
		await live(page);
	});
	expect((await storedProfile(sql))?.display_name).toBe('Mia Lee');
	await expect(page.getByRole('status').filter({ hasText: 'Welcome' })).toHaveText(
		'Welcome, Mia Lee — this device is now paired.'
	);
	await expect(greeting(page)).toContainText('Mia Lee');
	await expect(avatar(page)).toHaveText('ML');

	await reloadLive(page);
	await expect(page.getByText('this device is now paired')).toHaveCount(0);
	await sql`update devices set revoked_at = now() where name = ${device}`;
	await ctx.close();
});

test('/setup never overwrites an existing name and never shows it', async ({ sql }) => {
	await setProfile(sql, 'Anton Schmidt');
	const devices = [`Setup ${uid()}`, `Setup ${uid()}`];
	await pairWithSecret(BASE, { name: devices[0], ip: freshIp(), displayName: 'Intruder' });
	expect((await storedProfile(sql))?.display_name).toBe('Anton Schmidt');

	await withoutDevices(sql, async () => {
		const html = await (await fetch(`${BASE}/setup`)).text();
		expect(html).toContain('Your name');
		expect(html).not.toContain('Anton');
		await pairWithSecret(BASE, { name: devices[1], ip: freshIp(), displayName: 'Intruder' });
	});
	expect((await storedProfile(sql))?.display_name).toBe('Anton Schmidt');
	await sql`update devices set revoked_at = now() where name in ${sql(devices)}`;
});

test('emoji avatar and daily goal: the nav ring reports today, live with the timer, without double counting @mobile', async ({
	page,
	sql,
	api
}) => {
	const task = await createTask(sql, { title: `Goal ${uid()}`, day: await today(sql) });
	await createSession(sql, { taskId: task.id, day: await today(sql), start: '00:05', minutes: 30 });
	const base = await loggedToday(sql); // includes the 30 minutes just logged
	await setProfile(sql, 'Anton');

	await gotoLive(page, '/settings');
	await chooseEmojiStyle(page);
	await page.getByRole('button', { name: 'Use 🦊 as avatar' }).click();
	let done = actionDone(page, 'profile');
	await page.getByRole('button', { name: 'Save profile' }).click();
	await done;
	await page.getByLabel('Goal', { exact: true }).selectOption({ label: '1 h' });
	done = actionDone(page, 'goal');
	await page.getByRole('button', { name: 'Save goal' }).click();
	await done;
	await expect.poll(() => storedExtras(sql)).toEqual({ avatar_emoji: '🦊', daily_goal_min: 60 });

	await reloadLive(page);
	await expect(avatar(page)).toHaveText('🦊');
	const named = (logged: number) =>
		new RegExp(`^Account and devices \\(Anton\\), (${hm(logged)}|${hm(logged + 1)}) of 1 h today$`);
	await expect(avatar(page)).toHaveAccessibleName(named(base));
	const ring = avatar(page).locator('svg.ring');
	await expect(ring).toBeInViewport();
	await expect(ring).toHaveAttribute(
		'data-progress',
		String(Math.round(Math.min(1, Math.floor(base) / 60) * 1000) / 10)
	);
	await expectNoHorizontalScroll(page);

	// A running timer adds its time from the snapshot (shifted in the DB, then pushed by a
	// pause) — no reload. Completing it moves the time into the server number: still +10.
	await timerCmd(api, { action: 'start', taskId: task.id, mode: 'focus', plannedMin: 120 });
	await sql`update sessions set started_at = started_at - interval '10 minutes' where state = 'running'`;
	await timerCmd(api, { action: 'pause' });
	await expect(avatar(page)).toHaveAccessibleName(named(base + 10));
	await timerCmd(api, { action: 'complete' });
	await expect.poll(() => loggedToday(sql)).toBeGreaterThanOrEqual(base + 10);
	await expect(page.locator('html[data-timer=live]')).toBeAttached();
	await expect(avatar(page)).toHaveAccessibleName(named(base + 10));
	await reloadLive(page);
	await expect(avatar(page)).toHaveAccessibleName(named(base + 10));
});

test('daily goal: 16 h passes, 16 h 15 min is rejected, "No daily goal" removes the ring; emoji is validated', async ({
	page,
	sql,
	console
}) => {
	console.allow(/status of 400/);
	await setProfile(sql, null, 'amber', { goalMin: 120 });
	await gotoLive(page, '/settings#goal');
	const base = await loggedToday(sql);
	await expect(avatar(page)).toHaveAccessibleName(progressName(base, '2 h'));

	const saveGoal = async (hours: string, minutes: string) => {
		await page.getByLabel('Goal', { exact: true }).selectOption({ label: 'Custom…' });
		await page.getByLabel('Hours').fill(hours);
		await page.getByLabel('Minutes').selectOption(minutes);
		const done = actionDone(page, 'goal');
		await page.getByRole('button', { name: 'Save goal' }).click();
		await done;
	};
	await saveGoal('16', '15');
	await expect(page.getByRole('alert')).toHaveText(
		'Pick a goal from 15 min to 16 h, in 15-minute steps.'
	);
	expect((await storedExtras(sql))?.daily_goal_min).toBe(120);

	await saveGoal('16', '0');
	await expect.poll(async () => (await storedExtras(sql))?.daily_goal_min).toBe(960);
	await expect(avatar(page)).toHaveAccessibleName(progressName(base, '16 h'));

	await page.getByLabel('Goal', { exact: true }).selectOption({ label: 'No daily goal' });
	let done = actionDone(page, 'goal');
	await page.getByRole('button', { name: 'Save goal' }).click();
	await done;
	await expect.poll(async () => (await storedExtras(sql))?.daily_goal_min).toBeNull();
	await expect(avatar(page)).toHaveAccessibleName('Account and devices');
	await expect(avatar(page).locator('svg.ring')).toHaveCount(0);

	await chooseEmojiStyle(page);
	await page.getByLabel('Avatar emoji').fill('ab');
	done = actionDone(page, 'profile');
	await page.getByRole('button', { name: 'Save profile' }).click();
	await done;
	await expect(page.getByRole('alert')).toHaveText('Use exactly one emoji.');
	expect((await storedExtras(sql))?.avatar_emoji).toBeNull();
});

test('the name in Focus and Review texts', async ({ page, sql, api }) => {
	await setProfile(sql, 'Mia');
	const monday = await emptyPastWeek(sql);
	const task = await createTask(sql, { title: `Named ${uid()}`, day: await today(sql) });
	await createSession(sql, { taskId: task.id, day: monday, start: '09:00', minutes: 90 });

	await gotoLive(page, `/review?week=${monday}`);
	await expect(page.getByText(/^Your week, Mia\. /)).toHaveText(
		/^Your week, Mia\. 1\.5h logged( — .*)?\.$/
	);

	await timerCmd(api, { action: 'start', taskId: task.id, mode: 'focus', plannedMin: 1 });
	await sql`update sessions set started_at = started_at - interval '2 minutes' where state = 'running'`;
	await gotoLive(page, '/focus');
	await expect(page.locator('.cheer')).toHaveText('Nice work, Mia — 1 minute done.');
});
