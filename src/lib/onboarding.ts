/**
 * First-run flow (`/welcome`) — pure, client-safe rules: which step a URL shows, the links
 * between steps, the choices of the goal and first-step screens and where a pairing lands.
 *
 * The step lives in the URL (`/welcome?step=2&task=<id>`): every step is its own history
 * entry, so the browser's back/forward and a reload show the same screen. `task` is the
 * quest task created in step 2; it travels along so step 3 can show it and "Back" to step 2
 * edits it instead of creating a second one.
 */
import { GOAL_OFF } from '#lib/daily-goal.ts';
import type { ErrorCode } from '#lib/i18n/index.ts';

export const WELCOME_PATH = '/welcome';

/** 0 welcome · 1 daily goal · 2 first quest + first step · 3 first focus. */
export type WelcomeStep = 0 | 1 | 2 | 3;
export const LAST_STEP: WelcomeStep = 3;
/** Steps with a page dot (the welcome screen has none). */
export const DOT_STEPS = [1, 2, 3] as const satisfies readonly WelcomeStep[];

/** `?step=` → a step; anything but `1`…`3` is the welcome screen. */
export function parseStep(raw: string | null | undefined): WelcomeStep {
	switch (raw) {
		case '1':
			return 1;
		case '2':
			return 2;
		case '3':
			return 3;
		default:
			return 0;
	}
}

/** The URL of a step, carrying the created task (if any). */
export function welcomeHref(step: WelcomeStep, taskId?: string | null): string {
	const params = new URLSearchParams();
	if (step > 0) params.set('step', String(step));
	if (taskId) params.set('task', taskId);
	const query = params.toString();
	return query ? `${WELCOME_PATH}?${query}` : WELCOME_PATH;
}

/** The step "Back" leads to (none on the welcome screen). */
export function previousStep(step: WelcomeStep): WelcomeStep | null {
	return step === 0 ? null : ((step - 1) as WelcomeStep);
}

// ─── Step 1: daily goal ─────────────────────────────────────────────────────

/** The goal choices in minutes (a subset of `DAILY_GOAL_PRESETS`), plus "No daily goal". */
export const WELCOME_GOALS = [30, 60, 120, 180] as const;
export const WELCOME_GOAL_DEFAULT = 60;

/**
 * The preselected row (form value: minutes or `GOAL_OFF`): the stored goal when it is one of
 * the choices, else 1 h. A missing goal preselects 1 h too — on a fresh install null only
 * means "never set".
 */
export function initialGoalChoice(stored: number | null): string {
	const known = (WELCOME_GOALS as readonly number[]).includes(stored ?? -1);
	return String(known ? stored : WELCOME_GOAL_DEFAULT);
}

/** Form values of the goal list, in display order. */
export const WELCOME_GOAL_VALUES = [...WELCOME_GOALS.map(String), GOAL_OFF] as const;

// ─── Step 2: first quest + first step ───────────────────────────────────────

/** The segmented control's planned durations (minutes). */
export const FIRST_STEP_DURATIONS = [25, 45, 60] as const;
export const FIRST_STEP_DEFAULT_MIN = 25;

/** One of {@link FIRST_STEP_DURATIONS}; anything else → `taskDurationInvalid`. */
export function parseFirstStepDuration(
	raw: unknown
): { ok: true; minutes: number } | { ok: false; error: ErrorCode } {
	const n = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
	return (FIRST_STEP_DURATIONS as readonly number[]).includes(n)
		? { ok: true, minutes: n }
		: { ok: false, error: 'taskDurationInvalid' };
}

/** The control's value for a stored duration (unknown → the default). */
export function firstStepDurationChoice(min: number | null | undefined): number {
	return (FIRST_STEP_DURATIONS as readonly number[]).includes(min ?? -1)
		? (min as number)
		: FIRST_STEP_DEFAULT_MIN;
}

// ─── After pairing ──────────────────────────────────────────────────────────

/**
 * Where `/setup` sends a freshly paired device: the first device of an install that hasn't
 * been through the first-run flow goes to `/welcome`, every other pairing to `next`.
 */
export function postSetupTarget(opts: {
	firstDevice: boolean;
	onboarded: boolean;
	next: string;
}): string {
	return opts.firstDevice && !opts.onboarded ? WELCOME_PATH : opts.next;
}
