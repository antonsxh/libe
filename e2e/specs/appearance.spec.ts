/**
 * Appearance (R3 — light mode): the theme is a **per-device** choice (`libe_theme` cookie) that
 * renders on the first paint (`data-theme` on `<html>`, theme metas) and survives reloads and
 * navigations; "Automatic" follows the OS light/dark setting. The cookie lives in the per-test
 * browser context (not server-side like the language), so tests cannot leak into each other.
 */
import type { Page } from '@playwright/test';
import { test, expect, gotoLive, actionDone, reloadLive } from '../support/fixtures.ts';
import { BASE } from '../support/env.ts';
import { openSettings } from '../support/settings.ts';

/** The colour the page ground is actually painted in (computed, per theme). */
const paintedGround = (page: Page) =>
	page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** The resolved value of a token (Chromium may shorten the hex — only compare light values). */
const tokenValue = (page: Page, name: string) =>
	page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

/** Choose an appearance in Settings and wait for the autosave to land. */
async function chooseTheme(page: Page, option: 'Automatic' | 'Light' | 'Dark') {
	const scope = await openSettings(page, 'appearance');
	const done = actionDone(page, 'appearance');
	await scope.locator('label', { has: page.getByRole('radio', { name: option }) }).click();
	await done;
}

test('Light switches the app at once and persists — on every page @mobile', async ({ page }) => {
	await chooseTheme(page, 'Light'); // opens Settings → Appearance itself

	// Applied without a reload: attribute, tokens and the PWA/browser-chrome metas.
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	expect(await tokenValue(page, '--bg')).toBe('#f2f2f7');
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(242, 242, 247)');
	await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f2f2f7');

	// The cookie carries it (about a year, readable by the client).
	const cookie = (await page.context().cookies(BASE)).find((c) => c.name === 'libe_theme');
	expect(cookie?.value).toBe('light');
	expect((cookie?.expires ?? 0) - Date.now() / 1000).toBeGreaterThan(300 * 86_400);

	// Survives a reload and reaches the app's other pages, rendered from the cookie (SSR).
	await reloadLive(page);
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	await gotoLive(page, '/');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
	expect(await paintedGround(page)).toBe('rgb(242, 242, 247)');

	// Back to Dark, so the reset is exercised on both layouts (and leaves the sheet clean).
	await chooseTheme(page, 'Dark');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	expect(await paintedGround(page)).toBe('rgb(0, 0, 0)');
});

test('Per device: another context without the cookie stays dark', async ({
	page,
	browser,
	console
}) => {
	await chooseTheme(page, 'Light');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

	const ctx = await browser.newContext(); // storageState: paired device, no appearance cookie
	console.watch(ctx);
	const other = await ctx.newPage();
	await gotoLive(other, '/settings');
	await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
	expect(await paintedGround(other)).toBe('rgb(0, 0, 0)');
	const scope = await openSettings(other, 'appearance');
	await expect(scope.getByRole('radio', { name: 'Dark' })).toBeChecked();
	await ctx.close();
});

test('Automatic follows the system’s light or dark look', async ({ page }) => {
	await chooseTheme(page, 'Automatic');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'auto');

	// The browser resolves the theme, not the server: one theme-color meta per OS appearance.
	await expect(
		page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')
	).toHaveAttribute('content', '#f2f2f7');
	await expect(
		page.locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')
	).toHaveAttribute('content', '#000000');

	await page.emulateMedia({ colorScheme: 'light' });
	expect(await tokenValue(page, '--bg')).toBe('#f2f2f7');
	await reloadLive(page); // the cookie says "auto" — the OS setting still wins after reload
	expect(await tokenValue(page, '--bg')).toBe('#f2f2f7');

	await page.emulateMedia({ colorScheme: 'dark' });
	expect(await paintedGround(page)).toBe('rgb(0, 0, 0)');

	// Reset to an explicit choice, so nothing else ever renders "auto".
	await chooseTheme(page, 'Dark');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('An unknown cookie value falls back to Dark', async ({ page }) => {
	await page.context().addCookies([{ name: 'libe_theme', value: 'blau', url: BASE }]);
	const scope = await openSettings(page, 'appearance');
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	await expect(scope.getByRole('radio', { name: 'Dark' })).toBeChecked();
});
