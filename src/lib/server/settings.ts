/** App settings (single row `id = 1`): the pomodoro intervals and the UI language. */
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { settings } from '#lib/server/db/schema.ts';
import {
	DEFAULT_POMODORO,
	type PomodoroSettings,
	type SettingsErrorCodes,
	type SettingsErrors
} from '#lib/timer.ts';
import {
	i18n,
	isLanguageSetting,
	type ErrorCode,
	type LanguageSetting,
	type Locale
} from '#lib/i18n/index.ts';

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

/** The stored UI language (`auto` while the row doesn't exist yet or holds an unknown value). */
export async function getLanguageSetting(q: Queryable = db): Promise<LanguageSetting> {
	const [row] = await q
		.select({ language: settings.language })
		.from(settings)
		.where(eq(settings.id, 1));
	return isLanguageSetting(row?.language) ? row.language : 'auto';
}

export async function saveLanguageSetting(language: LanguageSetting, q: Queryable = db) {
	const cols = { language, updatedAt: new Date() };
	await q
		.insert(settings)
		.values({ id: 1, ...cols })
		.onConflictDoUpdate({ target: settings.id, set: cols });
}

/** `fail(400, …)` payload of the pomodoro settings dialog (Focus and Settings pages). */
export function pomodoroSettingsFailure(
	values: Record<string, FormDataEntryValue>,
	errors: SettingsErrorCodes,
	locale: Locale
) {
	const t = i18n(locale);
	const text: SettingsErrors = {};
	for (const [key, code] of Object.entries(errors) as [keyof SettingsErrors, ErrorCode][])
		text[key] = t.errors[code];
	return {
		intent: 'settings' as const,
		errors: text,
		values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]))
	};
}
