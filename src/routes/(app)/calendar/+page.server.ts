import {
	formatDayLabel,
	isISODay,
	startOfWeek,
	todayISO,
	weekDays,
	weekRangeLabel
} from '#lib/dates.ts';
import { listWeekBlocks } from '#lib/server/blocks.ts';
import { listPickTasks, listWeekSessions, serverTimeZone } from '#lib/server/calendar.ts';
import { listOpenQuests } from '#lib/server/quests.ts';
import { intlLocale } from '#lib/i18n/index.ts';
import type { PageServerLoad } from './$types';

export const load = (async ({ url, locals }) => {
	const intl = intlLocale(locals.locale);
	// `?week=YYYY-MM-DD` — any day of the desired week (normalised to its Monday);
	// invalid or missing → the current week. `?plan=1` overlays the week's planned blocks.
	const weekParam = url.searchParams.get('week');
	const today = todayISO();
	const weekMonday = isISODay(weekParam) ? startOfWeek(weekParam) : startOfWeek(today);
	const showPlan = url.searchParams.get('plan') === '1';

	const [sessions, quests_, pickTasks, blocks] = await Promise.all([
		listWeekSessions(weekMonday),
		listOpenQuests(),
		listPickTasks(weekMonday),
		showPlan ? listWeekBlocks(weekMonday) : Promise.resolve([])
	]);

	return {
		weekMonday,
		today,
		timeZone: serverTimeZone(),
		/** Server clock at render time (first paint of the now line / live entry). */
		now: Date.now(),
		rangeLabel: weekRangeLabel(weekMonday, intl),
		days: weekDays(weekMonday).map((day) => ({
			day,
			weekday: formatDayLabel(day, { weekday: 'short' }, intl),
			dayNum: Number(day.slice(8, 10)),
			label: formatDayLabel(day, { weekday: 'short', month: 'short', day: 'numeric' }, intl),
			isToday: day === today
		})),
		sessions,
		blocks,
		showPlan,
		pickTasks,
		/** Sum of the open quests' weekly budgets (header progress bar). */
		budgetMin: quests_.reduce((sum, q) => sum + (q.weeklyBudgetH ?? 0) * 60, 0)
	};
}) satisfies PageServerLoad;
