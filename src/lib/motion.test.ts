import { describe, expect, test } from 'bun:test';
import { cssEasing, cubicBezier, longestCssTime, parseCssTime } from './motion.ts';

describe('parseCssTime', () => {
	test('milliseconds and seconds', () => {
		expect(parseCssTime('320ms')).toBe(320);
		expect(parseCssTime(' 0.2s ')).toBe(200);
		expect(parseCssTime('.5s')).toBe(500);
		expect(parseCssTime('0.01ms')).toBe(0.01);
	});
	test('garbage and negatives fall back', () => {
		expect(parseCssTime('', 140)).toBe(140);
		expect(parseCssTime(undefined, 7)).toBe(7);
		expect(parseCssTime('fast', 10)).toBe(10);
		expect(parseCssTime('-5ms', 3)).toBe(3);
		expect(parseCssTime('5px', 3)).toBe(3);
	});
});

describe('longestCssTime', () => {
	test('picks the longest entry of a list', () => {
		expect(longestCssTime('0s, 320ms, 0.1s')).toBe(320);
		expect(longestCssTime('0s')).toBe(0);
		expect(longestCssTime('')).toBe(0);
	});
});

describe('cssEasing', () => {
	test('linear and the endpoints', () => {
		const lin = cssEasing('linear');
		expect(lin(0.3)).toBeCloseTo(0.3, 6);
		const e = cssEasing('cubic-bezier(0.22, 1, 0.36, 1)');
		expect(e(0)).toBe(0);
		expect(e(1)).toBe(1);
	});
	test('cubic-bezier matches known values', () => {
		// cubic-bezier(0.42, 0, 0.58, 1) (ease-in-out) is symmetric around 0.5.
		const e = cssEasing('cubic-bezier(0.42, 0, 0.58, 1)');
		expect(e(0.5)).toBeCloseTo(0.5, 4);
		expect(e(0.25) + e(0.75)).toBeCloseTo(1, 4);
		// A decelerating curve is ahead of linear early on.
		expect(cssEasing('cubic-bezier(0.22, 1, 0.36, 1)')(0.2)).toBeGreaterThan(0.5);
	});
	test('overshooting curves exceed 1 in between', () => {
		const spring = cubicBezier(0.34, 1.56, 0.64, 1);
		const peak = Math.max(...Array.from({ length: 99 }, (_, i) => spring((i + 1) / 100)));
		expect(peak).toBeGreaterThan(1);
	});
	test('unknown strings fall back to an ease-out', () => {
		const e = cssEasing('bogus');
		expect(e(0.5)).toBeGreaterThan(0.5);
		expect(cssEasing('cubic-bezier(1, x, 2, 3)')(0.5)).toBeGreaterThan(0.5);
	});
});
