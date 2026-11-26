/**
 * The Focus setup's duration choice (`/focus` before a timer runs): a segmented control
 * 25 · 45 · 60 · 90 · Open · Other…, where "Open" is the stopwatch and "Other…" keeps a custom
 * minute value. Pure rules shared by the page and the `/api/timer` form path (no JS); the
 * minutes themselves are still validated by `parsePlannedMin` on the server.
 */
import { DEFAULT_FOCUS_MIN, MAX_TIMER_MIN } from '#lib/timer.ts';

/** The preset countdowns (minutes), in segment order. */
export const DURATION_PRESETS = [25, 45, 60, 90] as const;

export type DurationChoice = `${(typeof DURATION_PRESETS)[number]}` | 'open' | 'other';

export const DURATION_CHOICES: readonly DurationChoice[] = [
	...DURATION_PRESETS.map((m) => `${m}` as DurationChoice),
	'open',
	'other'
];

export function isDurationChoice(value: unknown): value is DurationChoice {
	return typeof value === 'string' && (DURATION_CHOICES as readonly string[]).includes(value);
}

/**
 * The preselection for a task: its planned minutes when they are a preset, "Other…" with
 * those minutes otherwise; a task without a plan starts at {@link DEFAULT_FOCUS_MIN} (the
 * server's default). `customMin` is what "Other…" shows when picked.
 */
export function initialDuration(durationMin: number | null | undefined): {
	choice: DurationChoice;
	customMin: number;
} {
	const planned =
		durationMin && durationMin > 0 ? Math.min(durationMin, MAX_TIMER_MIN) : DEFAULT_FOCUS_MIN;
	const preset = DURATION_PRESETS.find((m) => m === planned);
	return preset !== undefined
		? { choice: `${preset}` as DurationChoice, customMin: planned }
		: { choice: 'other', customMin: planned };
}

/**
 * The `plannedMin` value to send for a choice: a preset's minutes, `''` for "Open" (the
 * stopwatch), the raw custom value for "Other…" (validated by the server like any input).
 */
export function plannedMinFor(choice: DurationChoice, custom: unknown): number | string {
	if (choice === 'open') return '';
	if (choice === 'other') return typeof custom === 'number' ? custom : String(custom ?? '').trim();
	return Number(choice);
}

/**
 * A plain form post of the Focus setup (no JS) carries `duration` (+ `customMin`) instead of
 * `plannedMin`: fold them into `plannedMin` so `parseTimerCommand` sees the usual field. An
 * unknown `duration` becomes an invalid `plannedMin` (rejected by the server). Other bodies
 * pass through unchanged.
 */
export function withPlannedChoice(raw: Record<string, unknown>): Record<string, unknown> {
	if (!('duration' in raw) || 'plannedMin' in raw) return raw;
	const choice = raw.duration;
	return {
		...raw,
		plannedMin: isDurationChoice(choice) ? plannedMinFor(choice, raw.customMin) : 'invalid'
	};
}
