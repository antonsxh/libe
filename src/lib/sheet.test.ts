import { describe, expect, test } from 'bun:test';
import {
	DISMISS_MAX_PX,
	RUBBER_MAX_PX,
	releaseVelocity,
	sheetOffset,
	shouldDismissSheet
} from './sheet.ts';

describe('sheetOffset', () => {
	test('follows the finger downwards', () => {
		expect(sheetOffset(0)).toBe(0);
		expect(sheetOffset(120)).toBe(120);
	});
	test('resists upwards and never passes the rubber-band limit', () => {
		const small = sheetOffset(-10);
		const big = sheetOffset(-1000);
		expect(small).toBeLessThan(0);
		expect(small).toBeGreaterThan(-10);
		expect(big).toBeGreaterThan(-RUBBER_MAX_PX);
		expect(big).toBeLessThan(small);
	});
	test('garbage → 0', () => {
		expect(sheetOffset(Number.NaN)).toBe(0);
	});
});

describe('shouldDismissSheet', () => {
	test('far enough (share of the height) dismisses', () => {
		expect(shouldDismissSheet({ dy: 90, velocity: 0, height: 300 })).toBe(true);
		expect(shouldDismissSheet({ dy: 89, velocity: 0, height: 300 })).toBe(false);
	});
	test('tall sheets cap the distance', () => {
		expect(shouldDismissSheet({ dy: DISMISS_MAX_PX, velocity: 0, height: 2000 })).toBe(true);
		expect(shouldDismissSheet({ dy: DISMISS_MAX_PX - 1, velocity: 0, height: 2000 })).toBe(false);
	});
	test('a quick flick dismisses after a short drag, a jittery tap does not', () => {
		expect(shouldDismissSheet({ dy: 30, velocity: 0.8, height: 600 })).toBe(true);
		expect(shouldDismissSheet({ dy: 10, velocity: 2, height: 600 })).toBe(false);
		expect(shouldDismissSheet({ dy: 30, velocity: 0.2, height: 600 })).toBe(false);
	});
	test('upwards or no movement never dismisses', () => {
		expect(shouldDismissSheet({ dy: -200, velocity: -3, height: 600 })).toBe(false);
		expect(shouldDismissSheet({ dy: 0, velocity: 5, height: 600 })).toBe(false);
		expect(shouldDismissSheet({ dy: Number.NaN, velocity: 5, height: 600 })).toBe(false);
	});
});

describe('releaseVelocity', () => {
	test('slope over the last 100 ms', () => {
		const samples = [
			{ t: 0, y: 0 },
			{ t: 500, y: 10 }, // old, slow part
			{ t: 560, y: 40 },
			{ t: 600, y: 90 }
		];
		expect(releaseVelocity(samples)).toBeCloseTo(0.8, 5); // (90 − 10) / 100 ms
	});
	test('needs two samples and elapsed time', () => {
		expect(releaseVelocity([])).toBe(0);
		expect(releaseVelocity([{ t: 1, y: 1 }])).toBe(0);
		expect(
			releaseVelocity([
				{ t: 1, y: 1 },
				{ t: 1, y: 9 }
			])
		).toBe(0);
	});
	test('a long gap still uses the last pair', () => {
		expect(
			releaseVelocity([
				{ t: 0, y: 0 },
				{ t: 1000, y: 100 }
			])
		).toBeCloseTo(0.1, 5);
	});
});
