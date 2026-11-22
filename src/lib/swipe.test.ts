import { describe, expect, test } from 'bun:test';
import {
	FLICK_MIN_PX,
	FOLLOW_MAX_PX,
	LOCK_PX,
	STEP_PX,
	swipeAxis,
	swipeFollow,
	swipeStep
} from './swipe.ts';

describe('swipeAxis', () => {
	test('undecided within the lock distance', () => {
		expect(swipeAxis(0, 0)).toBeNull();
		expect(swipeAxis(LOCK_PX - 1, 3)).toBeNull();
		expect(swipeAxis(-4, LOCK_PX - 1)).toBeNull();
	});
	test('sideways once clearly horizontal', () => {
		expect(swipeAxis(LOCK_PX, 2)).toBe('x');
		expect(swipeAxis(-30, 12)).toBe('x');
	});
	test('vertical and diagonal starts are scrolls', () => {
		expect(swipeAxis(2, LOCK_PX)).toBe('y');
		expect(swipeAxis(12, -30)).toBe('y');
		expect(swipeAxis(15, 15)).toBe('y');
	});
	test('garbage → undecided', () => {
		expect(swipeAxis(Number.NaN, 40)).toBeNull();
	});
});

describe('swipeFollow', () => {
	test('follows a little, in the finger’s direction, capped', () => {
		expect(swipeFollow(0)).toBe(0);
		expect(swipeFollow(100)).toBeGreaterThan(0);
		expect(swipeFollow(100)).toBeLessThan(100);
		expect(swipeFollow(-100)).toBe(-swipeFollow(100));
		expect(swipeFollow(5000)).toBe(FOLLOW_MAX_PX);
	});
});

describe('swipeStep', () => {
	const width = 390;
	test('finger left → next day, right → previous day, after enough distance', () => {
		expect(swipeStep({ dx: -STEP_PX, velocity: 0, width })).toBe(1);
		expect(swipeStep({ dx: STEP_PX + 5, velocity: 0, width })).toBe(-1);
	});
	test('short slow swipes snap back', () => {
		expect(swipeStep({ dx: -(STEP_PX - 1), velocity: -0.1, width })).toBe(0);
		expect(swipeStep({ dx: 0, velocity: -2, width })).toBe(0);
	});
	test('narrow areas need a share of their width', () => {
		expect(swipeStep({ dx: -60, velocity: 0, width: 200 })).toBe(1);
	});
	test('a quick flick steps after a short swipe, but not jitter', () => {
		expect(swipeStep({ dx: -FLICK_MIN_PX, velocity: -0.6, width })).toBe(1);
		expect(swipeStep({ dx: FLICK_MIN_PX + 1, velocity: 0.6, width })).toBe(-1);
		expect(swipeStep({ dx: -(FLICK_MIN_PX - 1), velocity: -2, width })).toBe(0);
	});
	test('a flick back against the swipe does not step', () => {
		expect(swipeStep({ dx: -50, velocity: 0.8, width })).toBe(0);
	});
	test('garbage → 0', () => {
		expect(swipeStep({ dx: Number.NaN, velocity: 1, width })).toBe(0);
		expect(swipeStep({ dx: -100, velocity: Number.NaN, width: 0 })).toBe(1);
	});
});
