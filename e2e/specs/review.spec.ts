/**
 * M6 — Weekly review: every figure checked against an independent SQL aggregate of the
 * completed sessions (whole session on the day of `started_at`, server TZ), empty weeks,
 * closed quests.
 */
import type { Page } from '@playwright/test';
import { test, expect, gotoLive, reloadLive } from '../support/fixtures.ts';
import {
	addDays,
	createQuest,
	createSession,
	createTask,
	emptyPastWeek,
	loggedMinutes,
	mondayOf,
	today,
	uid,
	type Sql
} from '../support/db.ts';

const hours = (min: number) => `${Math.round((min / 60) * 10) / 10}h`;
/** The app's duration text (`#lib/duration.ts`): `45 min`, `2 h`, `2 h 18 min`. */
const hmin = (min: number) => {
	const total = Math.round(min);
	const [h, m] = [Math.floor(total / 60), total % 60];
	return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};

interface Minutes {
	day: string;
	questId: string | null;
	min: number;
}

/** Logged minutes per (start day, quest) of completed sessions with `from ≤ day ≤ to`. */
async function minutes(sql: Sql, from: string, to: string): Promise<Minutes[]> {
	const rows = await sql`
		select to_char(s.started_at at time zone 'Europe/Berlin', 'YYYY-MM-DD') as day,
			t.quest_id as "questId",
			sum(${loggedMinutes(sql)})::float8 as min
		from sessions s join tasks t on t.id = s.task_id
		where s.state = 'completed'
			and (s.started_at at time zone 'Europe/Berlin')::date between ${from}::date and ${to}::date
		group by 1, 2`;
	return rows as unknown as Minutes[];
}
const sum = (rows: Minutes[], pred: (r: Minutes) => boolean = () => true) =>
	rows.filter(pred).reduce((n, r) => n + r.min, 0);

async function barLabel(page: Page, day: string) {
	return page.locator(`[data-testid="day-bar"][data-day="${day}"]`).getAttribute('aria-label');
}

test('this week and quarter match independent SQL aggregates', async ({ page, sql }) => {
	// Fresh data in the week, including "other" work and a closed quest's time.
	const id = uid();
	const day = await today(sql);
	const monday = mondayOf(day);
	const quest = await createQuest(sql, { name: `Review ${id}`, budgetH: 2 });
	const qt = await createTask(sql, { title: `Review quest ${id}`, questId: quest.id });
	const ot = await createTask(sql, { title: `Review other ${id}` });
	await createSession(sql, {
		taskId: qt.id,
		day: monday,
		start: '07:10',
		minutes: 47,
		pausedMin: 3
	});
	await createSession(sql, { taskId: ot.id, day: monday, start: '08:30', minutes: 25 });

	const sunday = addDays(monday, 6);
	const week = await minutes(sql, monday, sunday);
	const [{ qStart, qEnd }] = await sql`
		select to_char(date_trunc('quarter', ${monday}::date), 'YYYY-MM-DD') as "qStart",
			to_char(date_trunc('quarter', ${monday}::date) + interval '3 months - 1 day', 'YYYY-MM-DD') as "qEnd"`;
	const quarter = await minutes(sql, qStart, qEnd);
	const open = await sql`select id, weekly_budget_h from quests where closed_at is null`;
	const budgetMin = open.reduce((n, q) => n + (q.weekly_budget_h ?? 0) * 60, 0);
	const questMin = sum(week, (r) => r.questId !== null);
	const otherMin = sum(week, (r) => r.questId === null);
	const daysElapsed = Math.round((Date.parse(day) - Date.parse(monday)) / 86_400_000) + 1;

	await gotoLive(page, '/review');
	for (let i = 0; i < 7; i++) {
		const d = addDays(monday, i);
		const q = sum(week, (r) => r.day === d && r.questId !== null);
		const o = sum(week, (r) => r.day === d && r.questId === null);
		const label = await barLabel(page, d);
		expect(label, d).toContain(`: ${hmin(q)} quest work`);
		if (Math.round(o) > 0) expect(label, d).toContain(`Other ${hmin(o)}`);
		else expect(label, d).not.toContain('Other');
	}
	await expect(page.getByTestId('kpi-quest')).toHaveText(hours(questMin));
	await expect(page.getByTestId('kpi-budget')).toHaveText(`/ ${hours(budgetMin)}`);
	await expect(page.getByTestId('kpi-target')).toHaveText(
		`${Math.round((questMin / budgetMin) * 100)}% of target`
	);
	await expect(page.getByTestId('kpi-avg')).toHaveText(hours((questMin + otherMin) / daysElapsed));
	await expect(page.getByTestId('kpi-share')).toHaveText(
		String(Math.round((questMin / (questMin + otherMin)) * 100))
	);
	await expect(page.getByTestId('split-quest')).toHaveText(hours(questMin));
	await expect(page.getByTestId('split-other')).toHaveText(hours(otherMin));

	// One row per open quest or quest with time, each with its own week hours.
	const withTime = new Set(week.filter((r) => r.questId).map((r) => r.questId));
	const expectedRows = new Set([...open.map((q) => q.id), ...withTime]);
	const rows = page.getByTestId('quest-row');
	await expect(rows).toHaveCount(expectedRows.size);
	for (const qid of expectedRows) {
		const value = rows.and(page.locator(`[data-quest="${qid}"]`)).getByTestId('quest-value');
		await expect(value).toHaveText(
			new RegExp(`^${hours(sum(week, (r) => r.questId === qid)).replace('.', '\\.')}`)
		);
	}
	await expect(rows.and(page.locator(`[data-quest="${quest.id}"]`))).toContainText('/ 2h');

	await expect(page.getByTestId('quarter-quest')).toHaveText(
		hours(sum(quarter, (r) => r.questId !== null))
	);
	await expect(page.getByTestId('quarter-other')).toHaveText(
		hours(sum(quarter, (r) => r.questId === null))
	);
	await expect(
		page
			.locator(`[data-testid="quarter-row"][data-quest="${quest.id}"]`)
			.getByTestId('quarter-hours')
	).toHaveText(hours(sum(quarter, (r) => r.questId === quest.id)));
});

test('a session crossing midnight counts on its start day; closed quests are listed but have no budget', async ({
	page,
	sql
}) => {
	const id = uid();
	const monday = await emptyPastWeek(sql);
	const wed = addDays(monday, 2);
	const quest = await createQuest(sql, { name: `Night ${id}`, budgetH: 3 });
	const closed = await createQuest(sql, { name: `Closed ${id}`, budgetH: 5, closed: true });
	const night = await createTask(sql, { title: `Night shift ${id}`, questId: quest.id });
	const old = await createTask(sql, { title: `Old quest work ${id}`, questId: closed.id });
	await createSession(sql, { taskId: night.id, day: wed, start: '22:00', minutes: 240 });
	await createSession(sql, { taskId: old.id, day: monday, start: '12:00', minutes: 30 });

	await gotoLive(page, `/review?week=${monday}`);
	expect(await barLabel(page, wed)).toContain(': 4 h quest work');
	expect(await barLabel(page, addDays(wed, 1))).toContain(': 0 min quest work');
	await expect(page.getByTestId('kpi-quest')).toHaveText('4.5h');

	const closedRow = page.locator(`[data-testid="quest-row"][data-quest="${closed.id}"]`);
	await expect(closedRow).toHaveClass(/closed/);
	await expect(closedRow.getByTestId('quest-value')).toHaveText('0.5h');
	const [{ budget }] =
		await sql`select coalesce(sum(weekly_budget_h), 0)::float8 as budget from quests where closed_at is null`;
	await expect(page.getByTestId('kpi-budget')).toHaveText(`/ ${hours(budget * 60)}`);
});

test('weeks without data show one sentence instead of zeros; a week with only Other time is not empty', async ({
	page,
	sql
}) => {
	const future = addDays(mondayOf(await today(sql)), 70);
	await gotoLive(page, `/review?week=${future}`);
	const empty = page.getByTestId('review-empty');
	await expect(empty).toContainText('This week hasn’t started yet');
	await expect(empty.getByRole('link')).toHaveCount(0); // nothing to start in a future week
	await expect(page.getByTestId('kpi-quest')).toHaveCount(0);
	await expect(page.locator('[data-testid="day-bar"]')).toHaveCount(0);
	// The week nav stays.
	await expect(page.getByRole('link', { name: 'Previous week' })).toBeVisible();

	const past = await emptyPastWeek(sql);
	await gotoLive(page, `/review?week=${past}`);
	await expect(page.getByTestId('review-empty')).toContainText('Nothing logged');
	await expect(page.getByTestId('kpi-share')).toHaveCount(0);

	// Only "Other" time: the week has something to show (0 % quest work, not an empty state).
	const errand = await createTask(sql, { title: `Errand ${uid()}` });
	await createSession(sql, {
		taskId: errand.id,
		day: addDays(past, 1),
		start: '10:00',
		minutes: 45
	});
	await reloadLive(page);
	await expect(page.getByTestId('review-empty')).toHaveCount(0);
	await expect(page.getByTestId('kpi-quest')).toHaveText('0h');
	await expect(page.getByTestId('kpi-share')).toHaveText('0');
	await expect(page.getByTestId('split-other')).toHaveText('0.8h');
});

/** `formatSignedHours`: `+2.1h`, `−0.4h`, `±0h`. */
const signedHours = (min: number) => {
	const r = Math.round((min / 60) * 10) / 10;
	return r === 0 ? '±0h' : `${r > 0 ? '+' : '−'}${Math.abs(r)}h`;
};

test('phone: Week | Quarter lives in the URL (reload, Back) and shows the quarter’s numbers @mobile-only', async ({
	page,
	sql,
	viewport
}) => {
	test.skip(viewport!.width > 720, 'Week | Quarter is the phone layout');
	const id = uid();
	const day = await today(sql);
	const monday = mondayOf(day);
	const quest = await createQuest(sql, { name: `Phone review ${id}`, budgetH: 3 });
	const qt = await createTask(sql, { title: `Phone quest ${id}`, questId: quest.id });
	const ot = await createTask(sql, { title: `Phone other ${id}` });
	await createSession(sql, { taskId: qt.id, day: monday, start: '06:10', minutes: 50 });
	await createSession(sql, { taskId: ot.id, day: monday, start: '05:30', minutes: 20 });

	const week = await minutes(sql, monday, addDays(monday, 6));
	const daysElapsed = Math.round((Date.parse(day) - Date.parse(monday)) / 86_400_000) + 1;
	const [q] = await sql`
		select to_char(date_trunc('quarter', ${monday}::date), 'YYYY-MM-DD') as start,
			to_char(date_trunc('quarter', ${monday}::date) + interval '3 months - 1 day', 'YYYY-MM-DD') as end,
			to_char(date_trunc('quarter', ${monday}::date) - interval '3 months', 'YYYY-MM-DD') as "prevStart",
			(date_trunc('quarter', ${monday}::date)::date
				- (date_trunc('quarter', ${monday}::date) - interval '3 months')::date) as "prevLen",
			(${day}::date - date_trunc('quarter', ${monday}::date)::date + 1) as elapsed,
			((date_trunc('quarter', ${monday}::date) + interval '3 months')::date
				- date_trunc('quarter', ${monday}::date)::date) as len`;
	q.elapsed = Math.min(q.elapsed, q.len); // a week whose Monday lies in a finished quarter
	const quarter = await minutes(sql, q.start, q.end);
	// The previous quarter's first `elapsed` days (the whole of it if it is shorter).
	const prevDays = q.elapsed >= q.len ? q.prevLen : Math.min(q.elapsed, q.prevLen);
	const previous = await minutes(sql, q.prevStart, addDays(q.prevStart, prevDays - 1));
	const isQuest = (r: Minutes) => r.questId !== null;

	// Week (the default): one summary card, the quest list with Other as a row.
	await gotoLive(page, '/review');
	await expect(page.getByRole('radio', { name: 'Week' })).toBeChecked();
	await expect(page.getByTestId('kpi-quest')).toBeHidden(); // the desktop KPI cards
	await expect(page.getByTestId('sum-quest')).toHaveText(hours(sum(week, isQuest)));
	await expect(page.getByTestId('sum-avg')).toHaveText(hours(sum(week) / daysElapsed));
	const weekList = page.getByTestId('week-list');
	const weekRow = weekList.locator(`[data-testid="list-row"][data-quest="${quest.id}"]`);
	await expect(weekRow.getByTestId('list-value')).toHaveText(
		`${hours(sum(week, (r) => r.questId === quest.id))} / 3h`
	);
	await expect(
		weekList.locator('[data-testid="list-row"][data-quest="other"]').getByTestId('list-value')
	).toHaveText(hours(sum(week, (r) => r.questId === null)));

	// Quarter: a history entry with `?view=quarter`, kept by a reload.
	await page.locator('label', { has: page.getByRole('radio', { name: 'Quarter' }) }).click();
	await expect(page).toHaveURL(/\/review\?view=quarter$/);
	await reloadLive(page);
	await expect(page.getByRole('radio', { name: 'Quarter' })).toBeChecked();
	await expect(page.getByTestId('week-summary')).toBeHidden();
	await expect(page.getByRole('link', { name: 'Previous week' })).toBeHidden();
	const quarterQuest = sum(quarter, isQuest);
	await expect(page.getByTestId('q-sum-quest')).toHaveText(hours(quarterQuest));
	await expect(page.getByTestId('q-sum-week')).toHaveText(hours(sum(quarter) / (q.elapsed / 7)));
	await expect(page.getByTestId('q-sum-delta')).toHaveText(
		signedHours(quarterQuest - sum(previous, isQuest))
	);
	const quarterList = page.getByTestId('quarter-list');
	await expect(
		quarterList
			.locator(`[data-testid="list-row"][data-quest="${quest.id}"]`)
			.getByTestId('list-value')
	).toHaveText(
		new RegExp(`^${hours(sum(quarter, (r) => r.questId === quest.id)).replace('.', '\\.')} / `)
	);
	await expect(
		quarterList.locator('[data-testid="list-row"][data-quest="other"]').getByTestId('list-value')
	).toHaveText(hours(sum(quarter, (r) => r.questId === null)));

	// Back returns to the week.
	await page.goBack();
	await expect(page).toHaveURL(/\/review$/);
	await expect(page.getByRole('radio', { name: 'Week' })).toBeChecked();
	await expect(page.getByTestId('sum-quest')).toBeVisible();
});
