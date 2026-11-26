/**
 * Settings (AB1) in browser tests: phones show one grouped list whose rows open sheets; wider
 * screens (desktop, iPad) show a sidebar and the selected section's form (`?section=`).
 * Everything saves itself — there are no Save buttons: a choice/switch saves on change, a text
 * field when committed (Enter / blur).
 */
import type { Locator, Page } from '@playwright/test';
import { gotoLive } from './fixtures.ts';

export const isPhone = (page: Page) => page.viewportSize()!.width <= 720;

/** What to edit: a phone sheet (`row-…`) and the wide section that holds it. */
const TARGETS = {
	profile: { row: 'row-profile', section: 'profile', sheet: 'Profile', pane: 'Profile' },
	goal: { row: 'row-goal', section: 'goal', sheet: 'Daily goal', pane: 'Daily goal and streak' },
	rest: { row: 'row-rest', section: 'goal', sheet: 'Rest days', pane: 'Daily goal and streak' },
	pomodoro: { row: 'row-pomodoro', section: 'focus', sheet: 'Pomodoro', pane: 'Focus' },
	appearance: {
		row: 'row-appearance',
		section: 'appearance',
		sheet: 'Appearance',
		pane: 'Appearance'
	},
	language: { row: 'row-language', section: 'language', sheet: 'Language', pane: 'Language' }
} as const;
export type SettingsTarget = keyof typeof TARGETS;

/**
 * Opens Settings at `target` and returns where its fields are: the sheet (phones) or the
 * section's pane (wider screens). Pass `navigate: false` when Settings is already open.
 */
export async function openSettings(
	page: Page,
	target: SettingsTarget,
	{ navigate = true }: { navigate?: boolean } = {}
): Promise<Locator> {
	const t = TARGETS[target];
	if (isPhone(page)) {
		if (navigate) await gotoLive(page, '/settings');
		await page.getByTestId(t.row).click();
		const sheet = page.getByRole('dialog', { name: t.sheet });
		await sheet.waitFor();
		return sheet;
	}
	if (navigate) await gotoLive(page, `/settings?section=${t.section}`);
	else
		await page
			.getByRole('navigation', { name: 'Settings sections' })
			.getByRole('link', { name: t.pane })
			.click();
	const pane = page.getByRole('region', { name: t.pane });
	await pane.waitFor();
	return pane;
}

/** Closes a phone sheet (no-op on wider screens). */
export async function closeSheet(page: Page): Promise<void> {
	if (!isPhone(page)) return;
	const dialog = page.getByRole('dialog');
	await page.keyboard.press('Escape');
	await dialog.waitFor({ state: 'detached' });
}

/**
 * Picks a row of a grouped choice list or checklist by its label (the row takes the tap). The
 * inner locator of `has` is matched inside the label, so it starts from the page, not `scope`.
 */
export async function choose(scope: Locator, name: string | RegExp): Promise<void> {
	const exact = typeof name === 'string';
	const page = scope.page();
	const input = page
		.getByRole('radio', { name, exact })
		.or(page.getByRole('checkbox', { name, exact }));
	await scope.locator('label', { has: input }).click();
}
