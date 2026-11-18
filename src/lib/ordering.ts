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
