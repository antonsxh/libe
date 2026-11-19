import { isISODay, startOfWeek, todayISO, weekRangeLabel } from '#lib/dates.ts';
import { weeklyReview } from '#lib/server/review.ts';
import { intlLocale } from '#lib/i18n/index.ts';
import type { PageServerLoad } from './$types';

export const load = (async ({ url, locals }) => {
	// `?week=YYYY-MM-DD` — any day of the desired week (normalised to its Monday);
	// invalid or missing → the current week (same rules as the Calendar).
	const weekParam = url.searchParams.get('week');
	const today = todayISO();
	const weekMonday = isISODay(weekParam) ? startOfWeek(weekParam) : startOfWeek(today);

	return {
		weekMonday,
		today,
		isCurrentWeek: weekMonday === startOfWeek(today),
		rangeLabel: weekRangeLabel(weekMonday, intlLocale(locals.locale)),
		review: await weeklyReview(weekMonday)
	};
}) satisfies PageServerLoad;
