/**
 * Profile (display name + avatar colour, global in the `settings` row): Settings → Profile
 * persists and drives the nav avatar, the account menu and Home's greeting; server-side name
 * validation; `/setup`'s optional "Your name" only fills an empty name and is never shown on
 * the public page; the one-time welcome after pairing.
 *
 * The profile is global state — every test resets it (no name, amber), which the rest of the
 * suite relies on.
 */
import type { Browser, Page } from '@playwright/test';
import {
	test,
	expect,
	gotoLive,
	actionDone,
	live,
	reloadLive,
	expectNoHorizontalScroll
} from '../support/fixtures.ts';
import { freshIp, pairWithSecret } from '../support/auth.ts';
import { uid, type Sql } from '../support/db.ts';
import { BASE, SETUP_SECRET } from '../support/env.ts';

async function setProfile(sql: Sql, displayName: string | null, avatarColor = 'amber') {
	await sql`
		insert into settings (id, display_name, avatar_color) values (1, ${displayName}, ${avatarColor})
		on conflict (id) do update
		set display_name = excluded.display_name, avatar_color = excluded.avatar_color`;
}
const storedProfile = async (sql: Sql) =>
	(await sql`select display_name, avatar_color from settings where id = 1`)[0] ?? null;

const avatar = (page: Page) => page.getByRole('button', { name: /^Account and devices/ });
const GREETING = /^(Good morning|Good afternoon|Good evening|Still up)/;
const greeting = (page: Page) => page.getByText(GREETING);

async function saveProfile(page: Page, name: string) {
	await page.getByLabel('Name', { exact: true }).fill(name);
	const done = actionDone(page, 'profile');
	await page.getByRole('button', { name: 'Save profile' }).click();
	await done;
}

test.beforeEach(async ({ sql }) => setProfile(sql, null));
test.afterEach(async ({ sql }) => setProfile(sql, null));

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
