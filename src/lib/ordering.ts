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

/**
 * Rebuild `items` so `moved` sits directly before `beforeId`; the array indexes are the
 * new `order` values (0..n−1) the caller writes back. `items` may or may not already
 * contain `moved` (same-list reorder vs. cross-list move). `beforeId` `null` or an id
 * not in the list means "append at the end"; dropping the card directly before itself
 * keeps its position.
 */
export function dropIntoList<T extends { id: string }>(
	items: readonly T[],
	moved: T,
	beforeId: string | null
): T[] {
	const current = items.findIndex((t) => t.id === moved.id);
	const rest = items.filter((t) => t.id !== moved.id);
	if (beforeId !== null && beforeId !== moved.id) {
		const idx = rest.findIndex((t) => t.id === beforeId);
		if (idx >= 0) {
			const next = rest.slice();
			next.splice(idx, 0, moved);
			return next;
		}
	} else if (beforeId === moved.id && current >= 0) {
		const next = rest.slice();
		next.splice(Math.min(current, next.length), 0, moved);
		return next;
	}
	rest.push(moved);
	return rest;
}

/** Split a task list so finished tasks sink below the open ones (order preserved). */
export function doneLast<T extends { doneAt: Date | string | null }>(
	list: readonly T[]
): { open: T[]; done: T[] } {
	const open: T[] = [];
	const done: T[] = [];
	for (const item of list) (item.doneAt ? done : open).push(item);
	return { open, done };
}

/**
 * `first`/`last` flags for row `i` of a list rendered as open/done groups: ↑/↓ must
 * never cross the group boundary (see `moveWithinGroup`), so buttons are disabled at
 * the edges of a *group*, not just of the list.
 */
export function groupEdges<T extends { doneAt: Date | string | null }>(
	list: readonly T[],
	i: number
): { first: boolean; last: boolean } {
	const done = (t: T) => t.doneAt !== null;
	return {
		first: i === 0 || done(list[i - 1]) !== done(list[i]),
		last: i === list.length - 1 || done(list[i + 1]) !== done(list[i])
	};
}
