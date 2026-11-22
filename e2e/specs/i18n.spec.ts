/**
 * German UI language: the Settings choice persists and applies everywhere (nav, server-built
 * date labels, `<html lang>`), `auto` follows each browser's `Accept-Language`, server-side
 * validation errors are translated, and the longer German copy fits on a phone.
 *
 * The language is global state (`settings.language`) — every test resets it to `auto`, which
 * the rest of the suite relies on (the config pins `locale: 'en-US'`).
 */
import type { Page } from '@playwright/test';
import {
	test,
	expect,
	gotoLive,
	actionDone,
	reloadLive,
	expectNoHorizontalScroll
} from '../support/fixtures.ts';
import { uid, type Sql } from '../support/db.ts';

const GERMAN_DAY =
	/^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), \d{1,2}\. (Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)$/;
const ENGLISH_DAY =
	/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}$/;

async function setLanguage(sql: Sql, language: 'auto' | 'en' | 'de') {
	await sql`
		insert into settings (id, language) values (1, ${language})
		on conflict (id) do update set language = excluded.language`;
}
const storedLanguage = async (sql: Sql) =>
	(await sql`select language from settings where id = 1`)[0]?.language ?? 'auto';

/** The segmented control's radios are visually hidden: click their label. */
const pick = (page: Page, option: string) =>
	page.locator('label', { has: page.getByRole('radio', { name: option }) }).click();

test.beforeEach(async ({ sql }) => setLanguage(sql, 'auto'));
test.afterEach(async ({ sql }) => setLanguage(sql, 'auto'));

test('Settings → Language: Deutsch persists and applies to every page', async ({ page, sql }) => {
	await gotoLive(page, '/settings');
	const done = actionDone(page, 'language');
	await pick(page, 'Deutsch');
	await done;
	await expect.poll(() => storedLanguage(sql)).toBe('de');
	// Applies without a reload …
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Einstellungen');
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');

	// … and after one, on another page: German nav, server-built German date, <html lang>.
	await gotoLive(page, '/');
	await reloadLive(page);
	await expect(page.locator('html')).toHaveAttribute('lang', 'de');
	const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
	await expect(nav.getByRole('link', { name: 'Kalender' })).toBeVisible();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(GERMAN_DAY);

	// The same browser (en-US) is back to English once the choice is "System default".
	await gotoLive(page, '/settings');
	await expect(page.getByRole('radio', { name: 'Deutsch' })).toBeChecked();
	const back = actionDone(page, 'language');
	await pick(page, 'Systemstandard');
	await back;
	await expect.poll(() => storedLanguage(sql)).toBe('auto');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
});

test('System default: a German browser gets German, an English one English', async ({
	page,
	browser,
	console
}) => {
	const german = await browser.newContext({ locale: 'de-DE' }); // storageState: paired device
	console.watch(german);
	try {
		const de = await german.newPage();
		await gotoLive(de, '/');
		await expect(de.locator('html')).toHaveAttribute('lang', 'de');
		await expect(
			de
				.getByRole('navigation', { name: 'Hauptnavigation' })
				.getByRole('link', { name: 'Rückblick' })
		).toBeVisible();
		await expect(de.getByRole('heading', { level: 1 })).toHaveText(GERMAN_DAY);

		await gotoLive(page, '/');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expect(
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Review' })
		).toBeVisible();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(ENGLISH_DAY);
	} finally {
		await german.close();
	}
});

test('server-side validation errors come back in German', async ({ page, sql, console }) => {
	console.allow(/status of 400/);
	await setLanguage(sql, 'de');
	const name = `Validierung ${uid()}`;
	await gotoLive(page, '/quests');
	await page.getByRole('button', { name: 'Neue Quest' }).first().click();
	const dialog = page.getByRole('dialog', { name: 'Neue Quest' });
	await dialog.getByLabel('Name').fill(name);
	// Two emoji — only the server rejects this.
	await dialog.getByLabel('Icon', { exact: true }).fill('🚀🚀');
	await dialog.getByRole('button', { name: 'Quest erstellen' }).click();

	await expect(dialog.getByText('Verwende genau ein Emoji.')).toBeVisible();
	expect(await sql`select 1 from quests where name = ${name}`).toHaveLength(0);
});

test('German UI: the main pages fit a phone without sideways scrolling @mobile', async ({
	page,
	sql,
	viewport
}) => {
	await setLanguage(sql, 'de');
	for (const path of ['/', '/plan', '/calendar', '/focus', '/quests', '/review', '/settings']) {
		await gotoLive(page, path);
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		await expectNoHorizontalScroll(page);
	}
	if (viewport!.width <= 720) {
		// The icon-only tab bar still names its tabs (in German) and navigates by them.
		await gotoLive(page, '/');
		const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
		await nav.getByRole('link', { name: 'Rückblick' }).tap();
		await expect(page).toHaveURL(/\/review$/);
		await expect(nav.getByRole('link', { name: 'Rückblick' })).toHaveAttribute(
			'aria-current',
			'page'
		);
	}
});
