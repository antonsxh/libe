/**
 * Streaks (`#lib/streak.ts`): consecutive days that reach the daily goal, judged on all
 * completed sessions (server TZ) — Home's chip, the account menu, Review's longest streak and
 * markers; rest days from Settings bridge a gap; a running timer flips "pending" to "active"
 * (and shows a milestone) without a reload.
 *
 * Isolation: the streak depends on *every* session in the shared e2e database. Each test sets
 * the daily goal to 16 h (the maximum) so that only this spec's own 16-hour sessions qualify,
 * and removes its own tasks (sessions cascade) afterwards. The goal, the rest days and the
 * timer are global state — reset around every test (no goal, no rest days, no timer).
 */
import type { Page } from '@playwright/test';
import {
	test,
	expect,
	gotoLive,
	actionDone,
	reloadLive,
	expectNoHorizontalScroll,
	discardTimer,
	timerCmd
} from '../support/fixtures.ts';
import {
	addDays,
	createSession,
	createTask,
	loggedMinutes,
	mondayOf,
	today,
	uid,
	type Sql
} from '../support/db.ts';

const GOAL = 960; // 16 h — nothing but this spec's own sessions reaches it
const PREFIX = 'Streak e2e';

async function setStreakSettings(sql: Sql, goalMin: number | null, restDays = 0) {
	await sql`
		insert into settings (id, daily_goal_min, streak_rest_days, display_name)
		values (1, ${goalMin}, ${restDays}, null)
		on conflict (id) do update
		set daily_goal_min = excluded.daily_goal_min, streak_rest_days = excluded.streak_rest_days,
			display_name = null`;
}
const removeOwnData = (sql: Sql) => sql`delete from tasks where title like ${PREFIX + ' %'}`;

/** A task of this spec with a full 16-hour session on each day `offsets` (relative to today). */
async function qualifyingDays(sql: Sql, offsets: number[]) {
	const day = await today(sql);
	const task = await createTask(sql, { title: `${PREFIX} ${uid()}` });
	for (const off of offsets)
		await createSession(sql, {
			taskId: task.id,
			day: addDays(day, off),
			start: '00:05',
			minutes: GOAL
		});
	return { task, day };
}

/** Minutes logged today (completed sessions started today, server TZ) — Home's definition. */
async function loggedToday(sql: Sql): Promise<number> {
	const [r] = await sql`
		select coalesce(sum(${loggedMinutes(sql)}), 0)::float8 as min from sessions s
		where s.state = 'completed'
			and (s.started_at at time zone 'Europe/Berlin')::date = ${await today(sql)}::date`;
	return r.min;
}

const streakBox = (page: Page) => page.getByTestId('streak');
const chip = (page: Page) => page.getByTestId('streak-chip');
const avatar = (page: Page) => page.getByRole('button', { name: /^Account and devices/ });
/** "Wednesday" for an ISO day (the weekday toggles' accessible names). */
const weekdayName = (day: string) =>
	new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(
		new Date(`${day}T12:00:00Z`)
	);

test.beforeEach(async ({ sql, api }) => {
	await discardTimer(api);
	await removeOwnData(sql);
	await setStreakSettings(sql, GOAL);
});
test.afterEach(async ({ sql, api }) => {
	await discardTimer(api);
	await removeOwnData(sql);
	await setStreakSettings(sql, null);
});

test('Home shows the current streak (pending today), menu and Review the longest @mobile', async ({
	page,
	sql
}) => {
	// Current run: the last three days; an older run of five, broken by a missed day.
	await qualifyingDays(sql, [-1, -2, -3, -10, -11, -12, -13, -14]);

	await gotoLive(page, '/');
	await expect(streakBox(page)).toHaveAttribute('data-state', 'pending');
	await expect(chip(page)).toHaveText('3-day streak');
	await expect(page.getByTestId('streak-hint')).toHaveText(/^Log .+ more today to keep it$/);
	await expect(chip(page)).toBeInViewport();
	await expectNoHorizontalScroll(page);

	await avatar(page).click();
	await expect(page.getByTestId('menu-streak')).toHaveText('3-day streak · Longest: 5 days');
	await page.keyboard.press('Escape');

	await gotoLive(page, '/review');
	await expect(page.getByTestId('longest-streak')).toHaveText('Longest streak: 5 days');
	await expectNoHorizontalScroll(page);
});

test('a rest day saved in Settings bridges a gap; seven rest days are rejected', async ({
	page,
	sql,
	console
}) => {
	console.allow(/status of 400/);
	const { day } = await qualifyingDays(sql, [-1, -3]);
	const gap = addDays(day, -2);
	const gapIndex = (new Date(`${gap}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Monday

	await gotoLive(page, '/');
	await expect(chip(page)).toHaveText('1-day streak');

	await gotoLive(page, '/settings#streak');
	await expect(page.getByTestId('streak-rule')).toHaveText(
		'A day counts toward your streak once you reach your daily goal (16 h).'
	);
	// All seven: at least one day has to count.
	for (const i of [0, 1, 2, 3, 4, 5, 6])
		await page.locator('label', { has: page.locator(`input[name=restDay][value="${i}"]`) }).click();
	let done = actionDone(page, 'streak');
	await page.getByRole('button', { name: 'Save rest days' }).click();
	await done;
	await expect(page.getByRole('alert')).toHaveText(
		'Pick at most 6 rest days — at least one day a week has to count.'
	);
	expect((await sql`select streak_rest_days from settings where id = 1`)[0].streak_rest_days).toBe(
		0
	);

	// Only the gap's weekday stays checked (the rejected input was echoed).
	for (const i of [0, 1, 2, 3, 4, 5, 6])
		if (i !== gapIndex)
			await page
				.locator('label', { has: page.locator(`input[name=restDay][value="${i}"]`) })
				.click();
	await expect(page.getByRole('checkbox', { name: weekdayName(gap) })).toBeChecked();
	done = actionDone(page, 'streak');
	await page.getByRole('button', { name: 'Save rest days' }).click();
	await done;
	await expect
		.poll(async () => (await sql`select streak_rest_days from settings where id = 1`)[0])
		.toEqual({ streak_rest_days: 1 << gapIndex });

	await reloadLive(page);
	await expect(page.getByRole('checkbox', { name: weekdayName(gap) })).toBeChecked();
	await gotoLive(page, '/');
	await expect(chip(page)).toHaveText('2-day streak');

	// Review marks the gap as a rest day between two streak days.
	await gotoLive(page, `/review?week=${gap}`);
	const mark = (d: string) => page.locator(`[data-testid=day-bar][data-day="${d}"] [data-mark]`);
	await expect(mark(gap)).toHaveAttribute('data-mark', 'rest');
	await expect(page.locator(`[data-testid=day-bar][data-day="${gap}"]`)).toHaveAccessibleName(
		/; rest day$/
	);
	for (const d of [addDays(day, -3), addDays(day, -1)])
		if (mondayOf(d) === mondayOf(gap)) await expect(mark(d)).toHaveAttribute('data-mark', 'done');
});

test('a running timer crossing the goal flips pending to active live, with the 7-day milestone', async ({
	page,
	sql,
	api
}) => {
	const { task } = await qualifyingDays(sql, [-1, -2, -3, -4, -5, -6]);
	// Today: just under the goal (other tests' time today included).
	const base = await loggedToday(sql);
	const day = await today(sql);
	await createSession(sql, {
		taskId: task.id,
		day,
		start: '00:00',
		minutes: GOAL - 5 - Math.ceil(base)
	});

	await gotoLive(page, '/');
	await expect(streakBox(page)).toHaveAttribute('data-state', 'pending');
	await expect(chip(page)).toHaveText('6-day streak');
	await expect(page.getByTestId('streak-hint')).toHaveText(/^Log (5|6) min more today to keep it$/);

	// The running session (shifted 10 minutes back in the DB, pushed by a pause) crosses the goal.
	await timerCmd(api, { action: 'start', taskId: task.id, mode: 'focus', plannedMin: 120 });
	await sql`update sessions set started_at = started_at - interval '10 minutes' where state = 'running'`;
	await timerCmd(api, { action: 'pause' });
	await expect(streakBox(page)).toHaveAttribute('data-state', 'active');
	await expect(streakBox(page).getByRole('status')).toHaveText('7-day streak — nice!');

	// Completing it moves the time into the server's numbers: still today, still 7.
	await timerCmd(api, { action: 'complete' });
	await expect.poll(() => loggedToday(sql)).toBeGreaterThanOrEqual(GOAL);
	await reloadLive(page);
	await expect(streakBox(page).getByRole('status')).toHaveText('7-day streak — nice!');
	await avatar(page).click();
	await expect(page.getByTestId('menu-streak')).toHaveText('7-day streak · Longest: 7 days');
});
