/**
 * The quest detail's summary card (`/quests/[id]`): this week's hours against the weekly
 * budget (a bar in the quest colour) and this quarter's hours against the quarter's target
 * so far — the weekly budget × elapsed weeks, the same rule as the Review's quarter. Only
 * what exists is shown: without a budget (or for a closed quest) there is no "/ budget", no
 * bar and no percentage.
 */
import { daysBetween, startOfQuarter, type ISODay } from '#lib/dates.ts';

export interface QuestSummary {
	weekH: number;
	quarterH: number;
	/** Weekly budget in hours; null without one or for a closed quest. */
	budgetH: number | null;
	/** Bar fill 0‥1 (this week ÷ budget, capped); null without a budget. */
	weekFill: number | null;
	/** This quarter ÷ its target so far, in whole percent (may exceed 100); null without a budget. */
	quarterPct: number | null;
}

export function questSummary(input: {
	weekH: number;
	quarterH: number;
	weeklyBudgetH: number | null;
	closed: boolean;
	today: ISODay;
}): QuestSummary {
	const { weekH, quarterH, today } = input;
	const budgetH =
		!input.closed && input.weeklyBudgetH !== null && input.weeklyBudgetH > 0
			? input.weeklyBudgetH
			: null;
	if (budgetH === null) return { weekH, quarterH, budgetH, weekFill: null, quarterPct: null };
	const weeksElapsed = (daysBetween(startOfQuarter(today), today) + 1) / 7;
	return {
		weekH,
		quarterH,
		budgetH,
		weekFill: Math.min(1, weekH / budgetH),
		quarterPct: Math.round((100 * quarterH) / (budgetH * weeksElapsed))
	};
}
