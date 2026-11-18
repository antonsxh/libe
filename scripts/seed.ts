/**
 * Seeds a demo dataset: 4 quests with backlog + scheduled tasks and completed focus
 * sessions spread over the last ~10 weeks (rising trend) so stats and sparklines
 * show real data. Refuses to run when `quests` is not empty.
 *
 *   bun run db:seed
 */
import { count } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { addDays, startOfWeek, todayISO } from '#lib/dates.ts';
import { quests, sessions, tasks, type NewSession } from '#lib/server/db/schema.ts';
import type { QuestColor } from '#lib/quest-colors.ts';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
const db = drizzle(client);

/** Deterministic LCG so repeated seeds (on fresh DBs) look alike. */
let seedState = 42;
function rng(): number {
	seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
	return seedState / 0x7fffffff;
}

const DAY_MS = 86_400_000;

/** Monday midnight UTC of the week `weeksAgo` before this week. */
function weekMondayMs(monday: string, weeksAgo: number): number {
	return new Date(`${monday}T00:00:00Z`).getTime() - 7 * weeksAgo * DAY_MS;
}

type SeedTask = { title: string; day?: number; durationMin?: number };

try {
	await seed();
} catch (err) {
	console.error('[seed] failed:', err);
	process.exitCode = 1;
} finally {
	await client.end();
}

async function seed(): Promise<void> {
	const [existing] = await db.select({ n: count() }).from(quests);
	if ((existing?.n ?? 0) > 0) {
		console.log('[seed] quests table is not empty — skipping');
		return;
	}

	const monday = startOfWeek(todayISO());
	const questDefs = [
		{
			name: 'Launch my idea',
			description: 'Turn the idea into something people love.',
			icon: '🚀',
			color: 'red',
			weeklyBudgetH: 10,
			order: 0,
			list: [
				{ title: 'Design the next chapter' },
				{ title: 'Make the first impression feel effortless' },
				{ title: 'Map the ideas worth pursuing', day: 0, durationMin: 90 },
				{ title: 'Outline the landing page', day: 2, durationMin: 45 }
			]
		},
		{
			name: 'Run a half marathon',
			description: 'Make room for a stronger, healthier me.',
			icon: '🏃',
			color: 'lime',
			weeklyBudgetH: 4,
			order: 1,
			list: [
				{ title: 'Plan the 12-week build-up' },
				{ title: 'Find a lighter, more efficient stride' },
				{ title: 'Easy 5 km. Leave the headphones at home.', day: 1, durationMin: 35 },
				{ title: 'Long run at an easy pace', day: 5, durationMin: 75 }
			]
		},
		{
			name: 'Write every week',
			description: 'Build a body of work, one page at a time.',
			icon: '📖',
			color: 'orange',
			weeklyBudgetH: 3,
			order: 2,
			list: [
				{ title: 'Write the next entry like it is for a friend' },
				{ title: 'Collect small moments worth keeping', day: 4, durationMin: 30 },
				{ title: "Draft this week's essay", day: 0, durationMin: 60 }
			]
		},
		{
			name: 'Keep learning',
			description: 'Follow my curiosity a little further.',
			icon: '✨',
			color: 'green',
			weeklyBudgetH: 2,
			order: 3,
			list: [
				{ title: 'Read a chapter a day, notes after', day: 0, durationMin: 30 },
				{ title: 'Follow one rabbit hole properly', day: 3, durationMin: 45 },
				{ title: 'Summarise what stuck' }
			]
		}
	] satisfies {
		name: string;
		description: string;
		icon: string;
		color: QuestColor;
		weeklyBudgetH: number;
		order: number;
		list: SeedTask[];
	}[];

	const newSessions: NewSession[] = [];
	let taskCount = 0;

	// One transaction so a failed seed never leaves a half-filled database behind.
	await db.transaction(async (tx) => {
		for (const def of questDefs) {
			// `list` is seed-only data; omit it from the row (unused is allowed with rest siblings).
			const { list: _list, ...questRow } = def;
			const [quest] = await tx.insert(quests).values(questRow).returning();

			const taskIds: string[] = [];
			// The DB is empty, so list positions can be counted here (one list per quest + day).
			const nextOrder = new Map<string, number>();
			for (const t of def.list as SeedTask[]) {
				const day = t.day !== undefined ? addDays(monday, t.day) : null;
				const [task] = await tx
					.insert(tasks)
					.values({
						kind: 'quest',
						questId: quest!.id,
						title: t.title,
						durationMin: t.durationMin ?? null,
						day,
						order: takeOrder(nextOrder, day ?? 'backlog')
					})
					.returning();
				taskIds.push(task!.id);
				taskCount++;
			}

			// Completed focus sessions, oldest → newest, rising towards ~1.3× the weekly budget.
			const budgetMin = quest!.weeklyBudgetH! * 60;
			for (let weeksAgo = 9; weeksAgo >= 0; weeksAgo--) {
				const rise = 0.4 + 0.1 * (9 - weeksAgo);
				const weekMin = Math.max(20, Math.round((budgetMin * rise * (0.85 + 0.3 * rng())) / 5) * 5);
				const chunks = weekMin > 150 ? 3 : 2;
				const weekMonday = weekMondayMs(monday, weeksAgo);
				for (let c = 0; c < chunks; c++) {
					const minutes = Math.max(15, Math.round(weekMin / chunks / 5) * 5);
					const day = Math.min(6, Math.max(0, Math.round((c * 7) / chunks + rng() * 2 - 1)));
					const hour = day >= 5 ? 9 + Math.floor(rng() * 3) : 18 + Math.floor(rng() * 3);
					const startedAt = new Date(
						weekMonday + day * DAY_MS + (hour * 60 + Math.floor(rng() * 4) * 15) * 60_000
					);
					if (startedAt.getTime() + minutes * 60_000 > Date.now()) continue; // no future logs
					newSessions.push({
						taskId: taskIds[(weeksAgo + c) % taskIds.length]!,
						state: 'completed',
						startedAt,
						durationMin: minutes,
						pausedMs: 0,
						endedAt: new Date(startedAt.getTime() + minutes * 60_000),
						source: 'focus'
					});
				}
			}
		}

		// A couple of "other" tasks (no quest).
		await tx.insert(tasks).values([
			{
				kind: 'other',
				title: 'Pay the quarterly taxes',
				day: addDays(monday, 1),
				durationMin: 30,
				order: 0
			},
			{ kind: 'other', title: 'Clear the inbox to zero', order: 0 }
		]);
		taskCount += 2;

		await tx.insert(sessions).values(newSessions);
	});
	console.log(
		`[seed] created ${questDefs.length} quests, ${taskCount} tasks, ${newSessions.length} sessions`
	);
}

function takeOrder(counters: Map<string, number>, key: string): number {
	const n = counters.get(key) ?? 0;
	counters.set(key, n + 1);
	return n;
}
