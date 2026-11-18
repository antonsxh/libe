/**
 * Direct access to the e2e database: arrange test data, assert server-side effects, shift
 * timestamps instead of sleeping. Wall times are converted by Postgres (`at time zone`), so the
 * expectations never depend on the app's own date code.
 */
import postgres from 'postgres';
import { E2E_DB, TIME_ZONE, dbUrl } from './env.ts';

export type Sql = postgres.Sql;

export function connect(db = E2E_DB): Sql {
	return postgres(dbUrl(db), {
		max: 2,
		onnotice: () => {},
		// `date` columns as `YYYY-MM-DD` strings, like the app's ISO days.
		types: {
			isoDay: { to: 1082, from: [1082], serialize: (v: string) => v, parse: (v: string) => v }
		}
	});
}

let n = 0;
/** Unique, human-readable suffix for test data (`Plan move k3x9a-1`). */
export function uid(): string {
	n += 1;
	return `${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 4)}-${n}`;
}

const TZ = TIME_ZONE;

/** Today in the server time zone (`YYYY-MM-DD`), computed by Postgres. */
export async function today(sql: Sql): Promise<string> {
	const [r] = await sql`select to_char(now() at time zone ${TZ}, 'YYYY-MM-DD') as d`;
	return r.d;
}

/** `day` ± `n` days. */
export function addDays(day: string, n: number): string {
	const d = new Date(`${day}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}

/** Monday of the ISO week containing `day`. */
export function mondayOf(day: string): string {
	const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
	return addDays(day, -dow);
}

export interface QuestRow {
	id: string;
	name: string;
}

export async function createQuest(
	sql: Sql,
	q: { name: string; color?: string; icon?: string; budgetH?: number | null; closed?: boolean }
): Promise<QuestRow> {
	const [row] = await sql`
		insert into quests (name, description, icon, color, weekly_budget_h, closed_at, sort_order)
		values (${q.name}, '', ${q.icon ?? '🧪'}, ${q.color ?? 'teal'}, ${q.budgetH ?? null},
			${q.closed ? sql`now()` : null},
			(select coalesce(max(sort_order), -1) + 1 from quests))
		returning id, name`;
	return row as unknown as QuestRow;
}

export interface TaskRow {
	id: string;
	title: string;
}

/**
 * Insert a task at the bottom of its list (all tasks of its kind on `day`; per quest in the
 * backlog). `questId` null → kind `other`.
 */
export async function createTask(
	sql: Sql,
	t: {
		title: string;
		questId?: string | null;
		day?: string | null;
		durationMin?: number | null;
		done?: boolean;
	}
): Promise<TaskRow> {
	const kind = t.questId ? 'quest' : 'other';
	const day = t.day ?? null;
	const scope =
		day !== null
			? sql`day = ${day} and kind = ${kind}`
			: t.questId
				? sql`day is null and quest_id = ${t.questId}`
				: sql`day is null and quest_id is null`;
	const [row] = await sql`
		insert into tasks (kind, quest_id, title, description, duration_min, day, done_at, sort_order)
		values (${kind}, ${t.questId ?? null}, ${t.title}, '', ${t.durationMin ?? null}, ${day},
			${t.done ? sql`now()` : null},
			(select coalesce(max(sort_order), -1) + 1 from tasks where ${scope}))
		returning id, title`;
	return row as unknown as TaskRow;
}

/** A completed session starting at the wall time `day start` (server TZ), `minutes` long. */
export async function createSession(
	sql: Sql,
	s: {
		taskId: string;
		day: string;
		start: string;
		minutes: number;
		pausedMin?: number;
		source?: 'focus' | 'manual' | 'pomodoro';
	}
): Promise<string> {
	const paused = s.pausedMin ?? 0;
	const [row] = await sql`
		insert into sessions (task_id, state, started_at, ended_at, paused_ms, duration_min, source)
		values (${s.taskId}, 'completed',
			(${s.day}::date + ${s.start}::time) at time zone ${TZ},
			(${s.day}::date + ${s.start}::time) at time zone ${TZ}
				+ make_interval(mins => ${s.minutes + paused}),
			${paused * 60_000}, ${s.minutes}, ${s.source ?? 'manual'})
		returning id`;
	return row.id;
}

/**
 * Logged minutes of a completed session row aliased `s` — the app's rule: span minus pauses,
 * or the planned `duration_min` when that is not positive.
 */
export function loggedMinutes(sql: Sql) {
	return sql`case when extract(epoch from s.ended_at - s.started_at) * 1000 - s.paused_ms > 0
		then (extract(epoch from s.ended_at - s.started_at) * 1000 - s.paused_ms) / 60000.0
		else coalesce(s.duration_min, 0) end`;
}

/** Wall-clock `HH:MM` of a timestamp in the server time zone. */
export async function wallTime(sql: Sql, at: Date): Promise<string> {
	const [r] = await sql`select to_char(${at}::timestamptz at time zone ${TZ}, 'HH24:MI') as t`;
	return r.t;
}

/**
 * A past week (Monday) within the last year that holds no sessions and no tasks, so a test
 * can reason about its exact contents. The seed only fills the last ~10 weeks.
 */
export async function emptyPastWeek(sql: Sql): Promise<string> {
	const monday = mondayOf(await today(sql));
	for (let attempt = 0; attempt < 50; attempt++) {
		const weeks = 14 + Math.floor(Math.random() * 34);
		const start = addDays(monday, -7 * weeks);
		const end = addDays(start, 8);
		const [r] = await sql`
			select
				(select count(*) from sessions
					where started_at < (${end}::date at time zone ${TZ})
					and coalesce(ended_at, now()) > (${addDays(start, -1)}::date at time zone ${TZ}))::int as s,
				(select count(*) from tasks where day between ${start} and ${addDays(start, 6)})::int as t,
				(select count(*) from blocks where day between ${start} and ${addDays(start, 6)})::int as b`;
		if (r.s + r.t + r.b === 0) return start;
	}
	throw new Error('no empty past week found');
}
