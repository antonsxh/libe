/**
 * Home's "Next up" (phones): the one task to start now — the first open quest task of today
 * in list order, else the first open "other" task. Lists come in Home's order (open first).
 */
export type NextUp<T> = { kind: 'task'; task: T } | { kind: 'empty'; allDone: boolean };

export function nextUp<T extends { doneAt: Date | string | null }>(
	questTasks: readonly T[],
	otherTasks: readonly T[]
): NextUp<T> {
	const task = questTasks.find((t) => !t.doneAt) ?? otherTasks.find((t) => !t.doneAt);
	if (task) return { kind: 'task', task };
	return { kind: 'empty', allDone: questTasks.length + otherTasks.length > 0 };
}
