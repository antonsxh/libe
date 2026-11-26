import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { QUEST_COLORS, OTHER_COLOR } from '../src/lib/quest-colors.ts';
import {
	TOKENS_PATH,
	contrastRatio,
	deltaE,
	hueDistance,
	lightOverrides,
	oklch,
	over,
	paletteFindings,
	parseHex,
	questColors,
	readTokens,
	resolveColor,
	themeTokens,
	toHex
} from './contrast.ts';

const css = readFileSync(TOKENS_PATH, 'utf8');
const tokens = readTokens(css);
const themes = themeTokens(css);

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
 * Checks the current palette is known to fail — empty since R1b closed the old palette's
 * gaps (and R4 kept it so with `--accent-text`). Never add one: fix the token instead.
 */
const KNOWN_GAPS: string[] = [];

describe('tokens.css', () => {
	test('defines a dark and a light theme', () => {
		expect(themes.map((t) => t.name)).toEqual(['dark', 'light']);
	});

	test('every palette check passes in both themes, except the documented known gaps', () => {
		for (const theme of themes) {
			const failing = paletteFindings(theme.tokens)
				.filter((f) => !f.ok)
				.map((f) => f.id);
			expect(failing, `theme ${theme.name}`).toEqual(KNOWN_GAPS);
		}
	});

	test('the light theme overrides --bg and keeps a token per light value', () => {
		const light = lightOverrides(css);
		expect(light).not.toBeNull();
		expect(light!.explicit.get('--bg')).toBe('#f2f2f7');
		// Everything the checks read exists in both merged palettes.
		for (const theme of themes) {
			expect(theme.tokens.get('--surface'), theme.name).toBeTruthy();
			expect(theme.tokens.get('--accent'), theme.name).toBeTruthy();
		}
	});

	test('the explicit and the automatic light block are identical, the latter media-guarded', () => {
		const light = lightOverrides(css)!;
		expect([...light.automatic.entries()]).toEqual([...light.explicit.entries()]);
		expect(light.explicit.size).toBeGreaterThan(20);
		// The `auto` block only exists inside the light media query — never for a dark OS.
		const media = css.indexOf('@media (prefers-color-scheme: light)');
		expect(media).toBeGreaterThan(0);
		expect(css.indexOf(`:root[data-theme='auto']`)).toBeGreaterThan(media);
		expect(css.split(`:root[data-theme='auto']`).length - 1).toBe(1);
	});

	test('every QUEST_COLORS key has a --quest-<key> token, and no extra ones', () => {
		const keys = [...questColors(tokens).keys()].sort();
		expect(keys).toEqual([...QUEST_COLORS].sort());
		for (const theme of themes) {
			expect([...questColors(theme.tokens).keys()].sort(), theme.name).toEqual(keys);
		}
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
