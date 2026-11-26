/**
 * Pure timeline helpers (client-safe, no DB imports): layout of overlapping blocks
 * into side-by-side columns, and clock-time parsing for the block dialog.
 */
import type { ErrorCode } from '#lib/i18n/index.ts';

/** Anything with a position in minutes-of-day, e.g. a `blocks` row. */
export interface TimedBlock {
	startMin: number;
	endMin: number;
}

/** A block placed in the grid: `column` is its 0-based lane, `columns` the cluster's lane count. */
export interface PlacedBlock<T> {
	block: T;
	column: number;
	columns: number;
}

/**
 * Assign each block a column index and the total column count of its overlap cluster.
 * Blocks are grouped into clusters of transitively overlapping intervals (touching
 * intervals, `end === start`, do NOT overlap). Within a cluster each block goes into
 * the leftmost lane whose previous block ends at or before its start; every block in
 * the cluster then reports that cluster's lane count.
 *
 * The result preserves the input order.
 */
export function layoutBlocks<T extends TimedBlock>(blocks: T[]): Array<PlacedBlock<T>> {
	// Work on indices sorted by start, then end, so lanes can be filled greedily.
	const order = blocks
		.map((_, i) => i)
		.sort(
			(a, b) =>
				blocks[a].startMin - blocks[b].startMin || blocks[a].endMin - blocks[b].endMin || a - b
		);

	const column = new Array<number>(blocks.length).fill(0);
	const columns = new Array<number>(blocks.length).fill(1);

	let cluster: number[] = [];
	/** End time of the last block placed in each lane of the current cluster. */
	let laneEnds: number[] = [];
	/** Latest end time within the current cluster (sorted input → max end seen so far). */
	let clusterEnd = -Infinity;

	function flushCluster(): void {
		for (const i of cluster) columns[i] = laneEnds.length;
		cluster = [];
		laneEnds = [];
		clusterEnd = -Infinity;
	}

	for (const i of order) {
		const { startMin, endMin } = blocks[i];
		// Blocks are sorted by start; one starting at/after every earlier block's end
		// cannot overlap the cluster and opens the next one (touching does not overlap).
		if (cluster.length > 0 && startMin >= clusterEnd) flushCluster();

		let lane = laneEnds.findIndex((end) => end <= startMin);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(endMin);
		} else {
			laneEnds[lane] = endMin;
		}
		column[i] = lane;
		cluster.push(i);
		clusterEnd = Math.max(clusterEnd, endMin);
	}
	flushCluster();

	return blocks.map((block, i) => ({ block, column: column[i], columns: columns[i] }));
}

/** Minutes-of-day bounds for a block: `0 ≤ start < end ≤ 1440` (mirrors the DB check). */
export const DAY_START_MIN = 0;
export const DAY_END_MIN = 1440;

/** Shape returned by the block form actions (merged into `data.form`). */
export interface BlockFormResult {
	ok?: boolean;
	intent?: string;
	taskId?: string;
	blockId?: string;
	errors?: { time?: string; duration?: string };
	start?: string;
	duration?: string;
}

/** Client state for the open "Time-block" dialog (create or edit mode). */
export interface BlockEditor {
	taskId: string;
	blockId?: string;
	taskTitle: string;
	/** `HH:MM` */
	start: string;
	/** minutes, as typed */
	duration: string;
}

/** Validate a block span: whole minutes, `0 ≤ start < end ≤ 1440`. */
export function validateBlockSpan(
	startMin: number,
	durationMin: number
): { ok: true; endMin: number } | { ok: false; error: ErrorCode } {
	if (!Number.isInteger(startMin) || startMin < DAY_START_MIN || startMin >= DAY_END_MIN)
		return { ok: false, error: 'blockStartInvalid' };
	if (!Number.isInteger(durationMin) || durationMin <= 0)
		return { ok: false, error: 'blockDurationInvalid' };
	const endMin = startMin + durationMin;
	if (endMin > DAY_END_MIN) return { ok: false, error: 'blockPastMidnight' };
	return { ok: true, endMin };
}

/** `'09:30'` → `570`; `null` when the value is not a valid `HH:MM` clock time (00:00‥23:59). */
export function parseClock(value: unknown): number | null {
	if (typeof value !== 'string') return null;
	const m = /^(\d{2}):(\d{2})$/.exec(value);
	if (!m) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h > 23 || min > 59) return null;
	return h * 60 + min;
}

/**
 * Default start for a new block: the next full half hour, capped so a 30-minute block
 * still ends by midnight (`0 … 1380`). Takes a clock to stay pure and testable.
 */
export function nextHalfHourMinutes(now: Date = new Date()): number {
	const minutes = now.getHours() * 60 + now.getMinutes();
	const next = (Math.floor(minutes / 30) + 1) * 30;
	return Math.min(next, 24 * 60 - 30);
}

/** The whole-day timeline: 06:00 until midnight, earlier when a block starts before 6. */
export const TIMELINE_DAY_START_HOUR = 6;

/** Hours shown by a timeline (`startHour` inclusive, `endHour` exclusive, 0‥24). */
export interface TimelineWindow {
	startHour: number;
	endHour: number;
}

/** The whole day: 06:00–24:00, or from the hour of a block that starts earlier. */
export function dayWindow(blocks: readonly TimedBlock[]): TimelineWindow {
	const first = Math.min(TIMELINE_DAY_START_HOUR * 60, ...blocks.map((b) => b.startMin));
	return { startHour: Math.max(0, Math.floor(first / 60)), endHour: 24 };
}

/**
 * Home's compact timeline: a window around now (`before` minutes back, `after` ahead, whole
 * hours), stretched to cover every block that hasn't ended before the window starts (what is
 * still planned today; earlier blocks are in the whole-day view). Kept inside the day and at
 * least `minHours` long (late evening: 19–24 rather than 23–24).
 */
export function nowWindow(
	blocks: readonly TimedBlock[],
	nowMin: number,
	{ before = 60, after = 240, minHours = 5 } = {}
): TimelineWindow {
	let start = Math.floor((nowMin - before) / 60);
	let end = Math.ceil((nowMin + after) / 60);
	for (const b of blocks) {
		if (b.endMin <= start * 60) continue;
		start = Math.min(start, Math.floor(b.startMin / 60));
		end = Math.max(end, Math.ceil(b.endMin / 60));
	}
	start = Math.max(0, start);
	end = Math.min(24, end);
	if (end - start < minHours) {
		if (end === 24) start = Math.max(0, 24 - minHours);
		else end = Math.min(24, start + minHours);
	}
	return { startHour: start, endHour: end };
}

/**
 * One line about today's plan (Home's "Daily plan" row on phones): the block running now or
 * the next one, else how many blocks are already behind, else nothing planned.
 */
export type PlanSummary<T> =
	| { kind: 'now'; block: T }
	| { kind: 'next'; block: T }
	| { kind: 'past'; count: number }
	| { kind: 'empty' };

export function planSummary<T extends TimedBlock>(
	blocks: readonly T[],
	nowMin: number
): PlanSummary<T> {
	if (blocks.length === 0) return { kind: 'empty' };
	const ahead = blocks
		.filter((b) => b.endMin > nowMin)
		.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
	const current = ahead.find((b) => b.startMin <= nowMin);
	if (current) return { kind: 'now', block: current };
	if (ahead.length > 0) return { kind: 'next', block: ahead[0] };
	return { kind: 'past', count: blocks.length };
}
