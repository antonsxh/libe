/** App settings (single row `id = 1`); currently the pomodoro intervals. */
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { settings } from '#lib/server/db/schema.ts';
import { DEFAULT_POMODORO, type PomodoroSettings } from '#lib/timer.ts';

/** A transaction or the pool — both expose the query builder. */
type Queryable = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>;

/** Stored pomodoro settings, or the defaults while the row doesn't exist yet. */
export async function getPomodoroSettings(q: Queryable = db): Promise<PomodoroSettings> {
	const [row] = await q.select().from(settings).where(eq(settings.id, 1));
	if (!row) return { ...DEFAULT_POMODORO };
	return {
		focusMin: row.pomodoroFocusMin,
		shortBreakMin: row.pomodoroShortBreakMin,
		longBreakMin: row.pomodoroLongBreakMin,
		longBreakEvery: row.pomodoroLongBreakEvery,
		autoStart: row.pomodoroAutoStart
	};
}

export async function savePomodoroSettings(
	value: PomodoroSettings,
	q: Queryable = db
): Promise<void> {
	const cols = {
		pomodoroFocusMin: value.focusMin,
		pomodoroShortBreakMin: value.shortBreakMin,
		pomodoroLongBreakMin: value.longBreakMin,
		pomodoroLongBreakEvery: value.longBreakEvery,
		pomodoroAutoStart: value.autoStart,
		updatedAt: new Date()
	};
	await q
		.insert(settings)
		.values({ id: 1, ...cols })
		.onConflictDoUpdate({ target: settings.id, set: cols });
}
