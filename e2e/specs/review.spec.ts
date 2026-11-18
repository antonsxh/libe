/**
 * M6 — Weekly review: every figure checked against an independent SQL aggregate of the
 * completed sessions (whole session on the day of `started_at`, server TZ), empty weeks,
 * closed quests.
 */
import type { Page } from '@playwright/test';
import { test, expect, gotoLive } from '../support/fixtures.ts';
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
const hmin = (min: number) => {
	const m = Math.round(min);
	return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
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
		if (Math.round(o) > 0) expect(label, d).toContain(`other ${hmin(o)}`);
		else expect(label, d).not.toContain('other');
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
	expect(await barLabel(page, wed)).toContain(': 4:00 quest work');
	expect(await barLabel(page, addDays(wed, 1))).toContain(': 0:00 quest work');
	await expect(page.getByTestId('kpi-quest')).toHaveText('4.5h');

	const closedRow = page.locator(`[data-testid="quest-row"][data-quest="${closed.id}"]`);
	await expect(closedRow).toHaveClass(/closed/);
	await expect(closedRow.getByTestId('quest-value')).toHaveText('0.5h');
	const [{ budget }] =
		await sql`select coalesce(sum(weekly_budget_h), 0)::float8 as budget from quests where closed_at is null`;
	await expect(page.getByTestId('kpi-budget')).toHaveText(`/ ${hours(budget * 60)}`);
});

test('weeks without data: future week has no averages or deltas, a past one shows its comparison', async ({
	page,
	sql
}) => {
	const future = addDays(mondayOf(await today(sql)), 70);
	await gotoLive(page, `/review?week=${future}`);
	await expect(page.getByTestId('kpi-quest')).toHaveText('0h');
	await expect(page.getByTestId('kpi-share')).toHaveText('—');
	await expect(page.getByText('This week hasn’t started yet')).toBeVisible();
	await expect(page.locator('.delta')).toHaveCount(0);
	await expect(page.locator('[data-testid="day-bar"]')).toHaveCount(7);
	await expect(page.locator('.col[data-state="future"]')).toHaveCount(7);

	const past = await emptyPastWeek(sql);
	const prevWeek = await minutes(sql, addDays(past, -7), addDays(past, -1));
	await gotoLive(page, `/review?week=${past}`);
	await expect(page.getByTestId('kpi-share')).toHaveText('—');
	await expect(page.getByText('No time logged')).toBeVisible();
	await expect(page.getByTestId('kpi-avg')).toHaveText('0h');
	const prevQuest = sum(prevWeek, (r) => r.questId !== null);
	const signed = Math.round((-prevQuest / 60) * 10) / 10;
	await expect(page.getByTestId('delta-quest')).toHaveText(
		new RegExp(`^${signed === 0 ? '±0h' : `−${Math.abs(signed)}h`.replace('.', '\\.')}`)
	);
});
