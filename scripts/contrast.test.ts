import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { QUEST_COLORS, OTHER_COLOR } from '../src/lib/quest-colors.ts';
import {
	TOKENS_PATH,
	contrastRatio,
	deltaE,
	hueDistance,
	oklch,
	over,
	paletteFindings,
	parseHex,
	questColors,
	readTokens,
	resolveColor,
	toHex
} from './contrast.ts';

const tokens = readTokens(readFileSync(TOKENS_PATH, 'utf8'));

describe('colour maths', () => {
	test('WCAG contrast: black/white is 21, a colour with itself 1', () => {
		expect(contrastRatio(parseHex('#000'), parseHex('#fff'))).toBeCloseTo(21, 5);
		expect(contrastRatio(parseHex('#6fdcae'), parseHex('#6fdcae'))).toBe(1);
		// Known reference value: #777 on white ≈ 4.48.
		expect(contrastRatio(parseHex('#777777'), parseHex('#ffffff'))).toBeCloseTo(4.48, 2);
	});

	test('color-mix in srgb, with and without transparency', () => {
		const t = new Map([
			['--a', '#000000'],
			['--b', '#ffffff'],
			['--half', 'color-mix(in srgb, var(--a) 50%, var(--b))'],
			['--rest', 'color-mix(in srgb, var(--a) 25%, var(--b))'],
			['--glass', 'color-mix(in srgb, var(--b) 40%, transparent)']
		]);
		expect(toHex(resolveColor('var(--half)', t))).toBe('#808080');
		expect(toHex(resolveColor('var(--rest)', t))).toBe('#bfbfbf');
		const glass = resolveColor('var(--glass)', t);
		expect(glass.a).toBeCloseTo(0.4, 5);
		expect(toHex(over(glass, parseHex('#000000')))).toBe('#666666');
	});

	test('ΔE is 0 for equal colours and symmetric', () => {
		const a = parseHex('#e3c07a');
		const b = parseHex('#6fa4f0');
		expect(deltaE(a, a)).toBe(0);
		expect(deltaE(a, b)).toBeCloseTo(deltaE(b, a), 10);
	});

	test('OKLCH hue and hue distance wrap around the colour wheel', () => {
		expect(oklch(parseHex('#ff0000')).h).toBeCloseTo(29.2, 0);
		expect(oklch(parseHex('#808080')).c).toBeLessThan(1e-4);
		expect(hueDistance(350, 10)).toBe(20);
		expect(hueDistance(10, 350)).toBe(20);
		expect(hueDistance(0, 180)).toBe(180);
	});

	test('unknown tokens and unsupported values fail loudly', () => {
		expect(() => resolveColor('var(--nope)', tokens)).toThrow();
		expect(() => resolveColor('hsl(0 0% 0%)', tokens)).toThrow();
	});
});

/**
 * Checks the current palette is known to fail — empty since R1b ("Hain") closed the old
 * palette's gaps. Never add one: fix the token instead.
 */
const KNOWN_GAPS: string[] = [];

describe('tokens.css', () => {
	test('every palette check passes, except the documented known gaps', () => {
		const failing = paletteFindings(tokens)
			.filter((f) => !f.ok)
			.map((f) => f.id);
		expect(failing).toEqual(KNOWN_GAPS);
	});

	test('every QUEST_COLORS key has a --quest-<key> token, and no extra ones', () => {
		const keys = [...questColors(tokens).keys()].sort();
		expect(keys).toEqual([...QUEST_COLORS].sort());
	});

	test('"other" stays neutral', () => {
		const slate = resolveColor(`var(--quest-${OTHER_COLOR})`, tokens);
		const spread = Math.max(slate.r, slate.g, slate.b) - Math.min(slate.r, slate.g, slate.b);
		expect(spread).toBeLessThan(24); // near-grey
	});

	test('the checks catch a quest colour too close to the accent', () => {
		const t = new Map(tokens);
		t.set('--quest-teal', tokens.get('--accent')!);
		const ids = paletteFindings(t)
			.filter((f) => !f.ok)
			.map((f) => f.id);
		expect(ids).toContain('quest teal vs accent');
	});
});
