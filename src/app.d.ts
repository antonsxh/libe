// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthDevice } from '#lib/auth.ts';
import type { Locale } from '#lib/i18n/index.ts';
import type { Profile } from '#lib/profile.ts';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** The paired device making this request (null on public routes without auth). */
			device: AuthDevice | null;
			/** Effective UI language: the `settings.language` row, `auto` → `Accept-Language`. */
			locale: Locale;
			/** The owner's profile (`settings` row) — null without a paired device. */
			profile: Profile | null;
			/** Daily goal in minutes (`settings.daily_goal_min`; null = none or no paired device). */
			dailyGoalMin: number | null;
			/** Streak rest weekdays (`settings.streak_rest_days` bitmask; 0 = none or no device). */
			streakRestDays: number;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
