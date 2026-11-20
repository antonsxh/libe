/**
 * App settings (single row `id = 1`): the pomodoro intervals, the UI language, the profile and
 * the daily goal.
 */
import { and, eq, isNull } from 'drizzle-orm';
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
import { toProfile, type Profile } from '#lib/profile.ts';
import { toDailyGoal } from '#lib/daily-goal.ts';

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

/**
 * What every authenticated request needs (`hooks.server.ts`): the language choice, the
 * profile (nav avatar, greeting) and the daily goal (avatar ring) — one query, so they cost
 * no extra round trip.
 */
export async function getRequestSettings(
	q: Queryable = db
): Promise<{ language: LanguageSetting; profile: Profile; dailyGoalMin: number | null }> {
	const [row] = await q
		.select({
			language: settings.language,
			displayName: settings.displayName,
			avatarColor: settings.avatarColor,
			avatarEmoji: settings.avatarEmoji,
			dailyGoalMin: settings.dailyGoalMin
		})
		.from(settings)
		.where(eq(settings.id, 1));
	return {
		language: isLanguageSetting(row?.language) ? row.language : 'auto',
		profile: toProfile(row),
		dailyGoalMin: toDailyGoal(row?.dailyGoalMin)
	};
}

/**
 * Save the profile from Settings (already validated: `normalizeDisplayName`,
 * `parseAvatarColor`, `parseAvatarEmoji`).
 */
export async function saveProfile(profile: Profile, q: Queryable = db): Promise<void> {
	const cols = {
		displayName: profile.displayName,
		avatarColor: profile.avatarColor,
		avatarEmoji: profile.avatarEmoji,
		updatedAt: new Date()
	};
	await q
		.insert(settings)
		.values({ id: 1, ...cols })
		.onConflictDoUpdate({ target: settings.id, set: cols });
}

/**
 * Set the display name only while none is set (the public `/setup` form must never overwrite
 * an existing name). Returns whether it was stored.
 */
export async function setDisplayNameIfUnset(name: string, q: Queryable = db): Promise<boolean> {
	const rows = await q
		.insert(settings)
		.values({ id: 1, displayName: name, updatedAt: new Date() })
		.onConflictDoUpdate({
			target: settings.id,
			set: { displayName: name, updatedAt: new Date() },
			setWhere: and(eq(settings.id, 1), isNull(settings.displayName))
		})
		.returning({ id: settings.id });
	return rows.length > 0;
}

/** Save the daily goal (already validated: `parseDailyGoal`; null = no goal). */
export async function saveDailyGoal(goalMin: number | null, q: Queryable = db): Promise<void> {
	const cols = { dailyGoalMin: goalMin, updatedAt: new Date() };
	await q
		.insert(settings)
		.values({ id: 1, ...cols })
		.onConflictDoUpdate({ target: settings.id, set: cols });
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
