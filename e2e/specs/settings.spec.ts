/**
 * Settings (AB1): every change saves itself — no Save buttons. Choices and switches save on
 * the tap, text and number fields once committed (Enter / blur); a rejected value shows its
 * inline error and is not saved. Phones edit in sheets opened from the grouped list (the row
 * then shows the new value); wider screens in the selected section's pane.
 *
 * Daily goal, rest days and the pomodoro settings are global state: each test puts them back.
 */
import { test, expect, actionDone, reloadLive } from '../support/fixtures.ts';
import type { Sql } from '../support/db.ts';
import { choose, closeSheet, isPhone, openSettings } from '../support/settings.ts';

type Stored = {
	daily_goal_min: number | null;
	streak_rest_days: number;
	pomodoro_focus_min: number;
	pomodoro_auto_start: boolean;
};
const stored = async (sql: Sql): Promise<Stored> =>
	(
		await sql<Stored[]>`
			select daily_goal_min, streak_rest_days, pomodoro_focus_min, pomodoro_auto_start
			from settings where id = 1`
	)[0];

let before: Stored;
test.beforeEach(async ({ sql }) => {
	await sql`insert into settings (id) values (1) on conflict (id) do nothing`;
	await sql`update settings set daily_goal_min = null, streak_rest_days = 0 where id = 1`;
	before = await stored(sql);
});
test.afterEach(async ({ sql }) => {
	await sql`
		update settings set daily_goal_min = null, streak_rest_days = 0,
			pomodoro_focus_min = ${before.pomodoro_focus_min},
			pomodoro_auto_start = ${before.pomodoro_auto_start}
		where id = 1`;
});

test('a daily goal, a rest day and the auto-start switch save themselves and survive a reload @mobile', async ({
	page,
	sql
}) => {
	const goal = await openSettings(page, 'goal');
	await expect(page.getByRole('button', { name: /^Save/ })).toHaveCount(0);
	let done = actionDone(page, 'goal');
	await choose(goal, '2 h');
	await done;
	await expect.poll(async () => (await stored(sql)).daily_goal_min).toBe(120);
	await closeSheet(page);
	if (isPhone(page)) await expect(page.getByTestId('row-goal')).toContainText('2 h');

	const rest = await openSettings(page, 'rest', { navigate: false });
	done = actionDone(page, 'streak');
	await choose(rest, 'Saturday');
	await done;
	await expect.poll(async () => (await stored(sql)).streak_rest_days).toBe(1 << 5);
	await closeSheet(page);
	if (isPhone(page)) await expect(page.getByTestId('row-rest')).toContainText('Sat');

	// Auto-start is a switch row: in the list on phones, in the Focus pane on wider screens.
	if (!isPhone(page)) await openSettings(page, 'pomodoro', { navigate: false });
	const autoStart = page.getByRole('switch', { name: 'Auto-start' });
	await expect(autoStart).toBeChecked({ checked: before.pomodoro_auto_start });
	done = actionDone(page, 'settings');
	await autoStart.click();
	await done;
	await expect
		.poll(async () => (await stored(sql)).pomodoro_auto_start)
		.toBe(!before.pomodoro_auto_start);
	// The other pomodoro values ride along unchanged.
	expect((await stored(sql)).pomodoro_focus_min).toBe(before.pomodoro_focus_min);

	await reloadLive(page);
	await expect(page.getByRole('switch', { name: 'Auto-start' })).toBeChecked({
		checked: !before.pomodoro_auto_start
	});
	if (isPhone(page)) {
		await expect(page.getByTestId('row-goal')).toContainText('2 h');
		await expect(page.getByTestId('row-rest')).toContainText('Sat');
	}
	const after = await openSettings(page, 'rest', { navigate: isPhone(page) });
	await expect(after.getByRole('checkbox', { name: 'Saturday' })).toBeChecked();
	await closeSheet(page);
	const goalAfter = await openSettings(page, 'goal', { navigate: isPhone(page) });
	await expect(goalAfter.getByRole('radio', { name: '2 h' })).toBeChecked();
});

test('pomodoro intervals save once a field is committed; a rejected value is not saved @mobile', async ({
	page,
	sql,
	console
}) => {
	console.allow(/status of 400/);
	const pomodoro = await openSettings(page, 'pomodoro');
	const focus = pomodoro.getByLabel('Focus', { exact: true });

	// Out of range: the field's error, nothing stored.
	await focus.fill('0');
	let done = actionDone(page, 'settings');
	await focus.press('Enter');
	await done;
	await expect(pomodoro.getByRole('alert')).toContainText('Focus:');
	expect((await stored(sql)).pomodoro_focus_min).toBe(before.pomodoro_focus_min);

	// Blur commits too.
	const next = before.pomodoro_focus_min === 30 ? 35 : 30;
	await focus.fill(String(next));
	done = actionDone(page, 'settings');
	await focus.blur();
	await done;
	await expect.poll(async () => (await stored(sql)).pomodoro_focus_min).toBe(next);
	await expect(pomodoro.getByRole('alert')).toHaveCount(0);
	expect((await stored(sql)).pomodoro_auto_start).toBe(before.pomodoro_auto_start);

	await closeSheet(page);
	if (isPhone(page)) await expect(page.getByTestId('row-pomodoro')).toContainText(`${next} ·`);
	await reloadLive(page);
	const again = await openSettings(page, 'pomodoro', { navigate: isPhone(page) });
	await expect(again.getByLabel('Focus', { exact: true })).toHaveValue(String(next));
});
