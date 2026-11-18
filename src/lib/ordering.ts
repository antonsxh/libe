/**
 * Pure ordering math for the gap-tolerant `sort_order` column (ascending, gaps allowed).
 * Server code (`#lib/server/tasks.ts`) derives the current min/max of a list and uses
 * these helpers to insert at either end.
 */

/** Order value that places a new item before everything else (`null` = empty list). */
export function orderAtTop(minOrder: number | null | undefined): number {
	return (minOrder ?? 0) - 1;
}

/** Order value that places a new item after everything else (`null` = empty list). */
export function orderAtBottom(maxOrder: number | null | undefined): number {
	return (maxOrder ?? -1) + 1;
}

/**
 * Move `id` one step up/down within `items` (already in list order), skipping neighbours that
 * are not in the same group (e.g. open vs. done tasks, which the UI renders separately).
 * Returns the reordered list, or `null` when there is nothing to swap with.
 */
export function moveWithinGroup<T extends { id: string }>(
	items: readonly T[],
	id: string,
	dir: 'up' | 'down',
	sameGroup: (a: T, b: T) => boolean = () => true
): T[] | null {
	const i = items.findIndex((t) => t.id === id);
	if (i < 0) return null;
	const step = dir === 'up' ? -1 : 1;
	let j = i + step;
	while (j >= 0 && j < items.length && !sameGroup(items[i], items[j])) j += step;
	if (j < 0 || j >= items.length) return null;
	const next = items.slice();
	[next[i], next[j]] = [next[j], next[i]];
	return next;
}
