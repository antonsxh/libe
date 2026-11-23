import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { QUEST_COLORS, OTHER_COLOR } from '../src/lib/quest-colors.ts';
import {
	QUEST_ACCENT_MIN_DELTA,
	QUEST_MIN_CONTRAST,
	QUEST_MIN_DELTA,
	TOKENS_PATH,
	closestQuestPair,
	contrastRatio,
	deltaE,
	over,
	parseHex,
	questColors,
	readTokens,
	resolveColor,
	runChecks,
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

	test('unknown tokens and unsupported values fail loudly', () => {
		expect(() => resolveColor('var(--nope)', tokens)).toThrow();
		expect(() => resolveColor('hsl(0 0% 0%)', tokens)).toThrow();
	});
});

describe('tokens.css (Hain palette)', () => {
	test('every text/UI pair meets WCAG AA', () => {
		const failed = runChecks(tokens).filter((r) => !r.ok);
		expect(failed.map((r) => `${r.fg} on ${r.bg}: ${r.ratio.toFixed(2)}`)).toEqual([]);
	});

	test('every QUEST_COLORS key has a --quest-<key> token, and no extra ones', () => {
		const keys = [...questColors(tokens).keys()].sort();
		expect(keys).toEqual([...QUEST_COLORS].sort());
	});

	test('quest colours are readable, apart from each other and from the accent', () => {
		const colors = questColors(tokens);
		const accent = resolveColor('var(--accent)', tokens);
		const surface = resolveColor('var(--surface)', tokens);
		for (const [key, c] of colors) {
			expect({ key, ok: contrastRatio(c, surface) >= QUEST_MIN_CONTRAST }).toEqual({
				key,
				ok: true
			});
			expect({ key, ok: deltaE(c, accent) >= QUEST_ACCENT_MIN_DELTA }).toEqual({ key, ok: true });
		}
		expect(closestQuestPair(colors).d).toBeGreaterThanOrEqual(QUEST_MIN_DELTA);
	});

	test('the accent is no quest colour and "other" stays neutral', () => {
		const accent = tokens.get('--accent');
		for (const key of QUEST_COLORS) expect(tokens.get(`--quest-${key}`)).not.toBe(accent);
		const slate = resolveColor(`var(--quest-${OTHER_COLOR})`, tokens);
		const spread = Math.max(slate.r, slate.g, slate.b) - Math.min(slate.r, slate.g, slate.b);
		expect(spread).toBeLessThan(24); // near-grey
	});
});
