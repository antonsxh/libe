/**
 * Home's "Next up" (phones): the one task to start now — the first open quest task of today
 * in list order, else the first open "other" task. Lists come in Home's order (open first).
 */
export type NextUp<T> = { kind: 'task'; task: T } | { kind: 'empty'; allDone: boolean };

/** Today's tasks for the "All done" rule — counted unfiltered (no `?q=`, no `?hideDone=`). */
export type DayCounts = {
	/** Tasks planned for today (quest work + Other, done or not). */
	total: number;
	/** … of them still open. */
	open: number;
	/** Open overdue tasks (planned before today). */
	overdue: number;
};

/**
 * Home's "All done" card replaces Next up when today had tasks and none is open any more —
 * and nothing overdue is still open either (those are open work too, just older). A day
 * without any task isn't "done", it's empty (Next up's empty state).
 */
export function isAllDone({ total, open, overdue }: DayCounts): boolean {
	return total > 0 && open === 0 && overdue === 0;
}

export function nextUp<T extends { doneAt: Date | string | null }>(
	questTasks: readonly T[],
	otherTasks: readonly T[]
): NextUp<T> {
	const task = questTasks.find((t) => !t.doneAt) ?? otherTasks.find((t) => !t.doneAt);
	if (task) return { kind: 'task', task };
	return { kind: 'empty', allDone: questTasks.length + otherTasks.length > 0 };
}
