/**
 * Palette checks for `src/lib/styles/tokens.css` — WCAG 2 contrast of the text/UI tokens on
 * their surfaces, and that quest colours stay apart from each other and from the accent
 * (perceptual distance and hue, so a quest colour never reads as "the accent, a bit off").
 * Both themes are checked: the dark `:root` and the light one (R3 — the light block merged
 * over the dark tokens).
 *
 *   bun scripts/contrast.ts              # report on tokens.css; exits 1 if a check fails
 *   bun scripts/contrast.ts other.css    # the same for another token file (palette drafts;
 *                                        #   a file without light blocks is checked as dark only)
 *
 * Pure helpers (parsing, colour maths) are exported for `contrast.test.ts`, which runs the
 * same checks in `bun run test`. Only what the tokens use is understood: hex colours,
 * `var(--x)` and `color-mix(in srgb, A p%, B)` (B may be `transparent`).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Rgba = { r: number; g: number; b: number; a: number };

export const TOKENS_PATH = fileURLToPath(new URL('../src/lib/styles/tokens.css', import.meta.url));

/** `--name: value;` declarations of the first `:root { … }` block (the default theme). */
export function readTokens(css: string): Map<string, string> {
	const start = css.indexOf(':root');
	const open = css.indexOf('{', start);
	const close = css.indexOf('\n}', open);
	if (start < 0 || open < 0 || close < 0) throw new Error('no :root block');
	const body = css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '');
	const tokens = new Map<string, string>();
	for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
		tokens.set(m[1], m[2].replace(/\s+/g, ' ').trim());
	}
	return tokens;
}

/** Declarations of a selector's style block, matched by brace depth (comments are skipped). */
function styleBlock(css: string, selector: string): string | null {
	const start = css.indexOf(selector);
	if (start < 0) return null;
	const open = css.indexOf('{', start);
	if (open < 0) return null;
	let depth = 0;
	for (let i = open; i < css.length; i++) {
		if (css.startsWith('/*', i)) {
			const end = css.indexOf('*/', i);
			if (end < 0) return null;
			i = end + 1;
			continue;
		}
		if (css[i] === '{') depth++;
		else if (css[i] === '}') {
			if (--depth === 0) return css.slice(open + 1, i);
		}
	}
	return null;
}

function declarations(body: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
		out.set(m[1], m[2].replace(/\s+/g, ' ').trim());
	}
	return out;
}

/**
 * The `--name: value` overrides of the two light theme blocks (R3): the explicit
 * `:root[data-theme='light']` and the automatic `:root[data-theme='auto']` inside
 * `@media (prefers-color-scheme: light)`. Null when the file has no light blocks
 * (palette drafts only define the default theme).
 */
export function lightOverrides(
	css: string
): { explicit: Map<string, string>; automatic: Map<string, string> } | null {
	const body = (sel: string) => styleBlock(css, sel);
	const light = body(`:root[data-theme='light']`);
	const auto = body(`:root[data-theme='auto']`);
	if (light === null || auto === null) return null;
	return { explicit: declarations(light), automatic: declarations(auto) };
}

export type ThemeTokens = { name: 'dark' | 'light'; tokens: Map<string, string> };

/**
 * The token sets of both themes: dark is the bare `:root`, light the same map with the
 * light overrides merged on top (exactly how the browser cascades them). Files without
 * light blocks yield the dark theme only.
 */
export function themeTokens(css: string): ThemeTokens[] {
	const dark = readTokens(css);
	const overrides = lightOverrides(css);
	if (!overrides) return [{ name: 'dark', tokens: dark }];
	const light = new Map(dark);
	for (const [name, value] of overrides.explicit) light.set(name, value);
	return [
		{ name: 'dark', tokens: dark },
		{ name: 'light', tokens: light }
	];
}

export function parseHex(hex: string): Rgba {
	const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) throw new Error(`not a hex colour: ${hex}`);
	const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
	return {
		r: parseInt(h.slice(0, 2), 16),
		g: parseInt(h.slice(2, 4), 16),
		b: parseInt(h.slice(4, 6), 16),
		a: 1
	};
}

export function toHex({ r, g, b }: Rgba): string {
	return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

/** Split a comma list at the top level (ignores commas inside parentheses). */
function splitTop(s: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let cur = '';
	for (const ch of s) {
		if (ch === '(') depth++;
		if (ch === ')') depth--;
		if (ch === ',' && depth === 0) {
			parts.push(cur.trim());
			cur = '';
		} else cur += ch;
	}
	parts.push(cur.trim());
	return parts;
}

/**
 * A token value as a colour. `color-mix(in srgb, …)` mixes premultiplied, gamma-encoded
 * channels like the CSS spec does; a missing percentage takes the rest of 100 %.
 */
export function resolveColor(value: string, tokens: Map<string, string>, depth = 0): Rgba {
	if (depth > 20) throw new Error('var() cycle');
	const v = value.trim();
	if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
	if (v.startsWith('#')) return parseHex(v);
	const ref = /^var\((--[\w-]+)\)$/.exec(v);
	if (ref) {
		const next = tokens.get(ref[1]);
		if (next === undefined) throw new Error(`unknown token ${ref[1]}`);
		return resolveColor(next, tokens, depth + 1);
	}
	const mix = /^color-mix\(\s*in srgb\s*,([\s\S]*)\)$/.exec(v);
	if (mix) {
		const [a, b] = splitTop(mix[1]).map((part) => {
			const pm = /^(.*?)\s+(\d+(?:\.\d+)?)%$/.exec(part);
			return pm ? { color: pm[1], p: Number(pm[2]) / 100 } : { color: part, p: NaN };
		});
		const pa = Number.isNaN(a.p) ? 1 - b.p : a.p;
		const pb = Number.isNaN(b.p) ? 1 - pa : b.p;
		const ca = resolveColor(a.color, tokens, depth + 1);
		const cb = resolveColor(b.color, tokens, depth + 1);
		const alpha = ca.a * pa + cb.a * pb;
		if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
		const ch = (k: 'r' | 'g' | 'b') => (ca[k] * ca.a * pa + cb[k] * cb.a * pb) / alpha;
		return { r: ch('r'), g: ch('g'), b: ch('b'), a: alpha };
	}
	throw new Error(`unsupported colour value: ${v}`);
}

/** `top` composited over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
	const mix = (k: 'r' | 'g' | 'b') => top[k] * top.a + bottom[k] * (1 - top.a);
	return { r: mix('r'), g: mix('g'), b: mix('b'), a: 1 };
}

function linear(c: number): number {
	const s = c / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2 relative luminance. */
export function luminance({ r, g, b }: Rgba): number {
	return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2 contrast ratio (1‥21). */
export function contrastRatio(a: Rgba, b: Rgba): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/** OKLab coordinates (L 0‥1). */
export function oklab(c: Rgba): [number, number, number] {
	const r = linear(c.r);
	const g = linear(c.g);
	const b = linear(c.b);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
	];
}

/** OKLCH lightness, chroma and hue (degrees; meaningless when chroma ≈ 0). */
export function oklch(c: Rgba): { l: number; c: number; h: number } {
	const [l, a, b] = oklab(c);
	const h = (Math.atan2(b, a) * 180) / Math.PI;
	return { l, c: Math.hypot(a, b), h: h < 0 ? h + 360 : h };
}

/** Shortest distance between two hues on the colour wheel (0‥180°). */
export function hueDistance(a: number, b: number): number {
	const d = Math.abs(a - b) % 360;
	return d > 180 ? 360 - d : d;
}

/** Perceptual distance (Euclidean ΔE in OKLab; ~0.02 is barely noticeable). */
export function deltaE(a: Rgba, b: Rgba): number {
	const [l1, a1, b1] = oklab(a);
	const [l2, a2, b2] = oklab(b);
	return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** WCAG AA: 4.5 for text, 3 for large text and UI graphics (dots, rings, bars). */
export const AA_TEXT = 4.5;
export const AA_UI = 3;

type Check = { fg: string; bg: string; min: number; what: string };

const TEXT_SURFACES = ['--bg', '--surface', '--surface-2'];

/** Every pair the UI relies on. `fg` may be translucent; it is composited over `bg`. */
export const CHECKS: Check[] = [
	...['--text', '--text-2', '--text-muted'].flatMap((fg) =>
		TEXT_SURFACES.map((bg) => ({ fg, bg, min: AA_TEXT, what: 'text' }))
	),
	...TEXT_SURFACES.map((bg) => ({
		fg: '--text-faint',
		bg,
		min: AA_UI,
		what: 'placeholders, done tasks'
	})),
	{ fg: '--accent-ink', bg: '--accent', min: AA_TEXT, what: 'primary button label' },
	{ fg: '--accent-ink', bg: '--accent-hover', min: AA_TEXT, what: 'primary button, hover' },
	...TEXT_SURFACES.map((bg) => ({
		fg: '--accent-text',
		bg,
		min: AA_TEXT,
		what: 'today / now text, links'
	})),
	...['--bg', '--surface'].map((bg) => ({
		fg: '--accent',
		bg,
		min: AA_UI,
		what: 'accent lines, rings, dots'
	})),
	...TEXT_SURFACES.map((bg) => ({ fg: '--danger', bg, min: AA_TEXT, what: 'error text' })),
	...TEXT_SURFACES.map((bg) => ({ fg: '--success', bg, min: AA_TEXT, what: 'success text' })),
	...TEXT_SURFACES.map((bg) => ({ fg: '--now-line', bg, min: AA_UI, what: 'now line and dot' })),
	{ fg: '--overdue', bg: '--surface', min: AA_UI, what: 'overdue dots' },
	...TEXT_SURFACES.map((bg) => ({ fg: '--streak', bg, min: AA_UI, what: 'streak flame' })),
	{ fg: '--success-ink', bg: '--success', min: AA_UI, what: 'all-done check' },
	{ fg: '--success', bg: '--surface', min: AA_UI, what: 'all-done circle' },
	{ fg: '--progress-fill', bg: '--track', min: AA_UI, what: 'neutral progress fill' },
	{ fg: '--focus-ring', bg: '--bg', min: AA_UI, what: 'focus ring' },
	{ fg: '--focus-ring', bg: '--surface', min: AA_UI, what: 'focus ring' }
];

/** Quest colours must read as colours (UI contrast) and differ from each other and the accent. */
export const QUEST_MIN_CONTRAST = AA_UI;
export const QUEST_MIN_DELTA = 0.06;
export const QUEST_ACCENT_MIN_DELTA = 0.08;
/** A chromatic quest colour must also sit this far from the accent's hue. */
export const QUEST_ACCENT_MIN_HUE = 25;
/** Below this OKLCH chroma a colour counts as grey (hue checks don't apply). */
export const CHROMA_GREY = 0.04;

export type Result = Check & { ratio: number; ok: boolean };

export function runChecks(tokens: Map<string, string>): Result[] {
	return CHECKS.map((c) => {
		const bg = resolveColor(`var(${c.bg})`, tokens);
		const fg = over(resolveColor(`var(${c.fg})`, tokens), bg);
		const ratio = contrastRatio(fg, bg);
		return { ...c, ratio, ok: ratio >= c.min };
	});
}

export function questColors(tokens: Map<string, string>): Map<string, Rgba> {
	const out = new Map<string, Rgba>();
	for (const name of tokens.keys()) {
		const m = /^--quest-([\w-]+)$/.exec(name);
		if (m) out.set(m[1], resolveColor(`var(${name})`, tokens));
	}
	return out;
}

/** Closest pair among the chromatic quest colours (all but the neutral `slate`). */
export function closestQuestPair(colors: Map<string, Rgba>): { pair: [string, string]; d: number } {
	const keys = [...colors.keys()].filter((k) => k !== 'slate');
	let best = { pair: ['', ''] as [string, string], d: Infinity };
	for (let i = 0; i < keys.length; i++) {
		for (let j = i + 1; j < keys.length; j++) {
			const d = deltaE(colors.get(keys[i])!, colors.get(keys[j])!);
			if (d < best.d) best = { pair: [keys[i], keys[j]], d };
		}
	}
	return best;
}

/** One line of the palette report. `id` is stable, so tests can name the checks that fail. */
export type Finding = { id: string; ok: boolean; line: string };

/** Every palette check: contrast pairs, then per quest colour, then the closest quest pair. */
export function paletteFindings(tokens: Map<string, string>): Finding[] {
	const out: Finding[] = runChecks(tokens).map((r) => ({
		id: `contrast ${r.fg} on ${r.bg}`,
		ok: r.ok,
		line: `${r.ratio.toFixed(2).padStart(5)}:1 ≥ ${r.min}  ${r.fg} on ${r.bg}  (${r.what})`
	}));
	const accent = resolveColor('var(--accent)', tokens);
	const accentHue = oklch(accent).h;
	const surface = resolveColor('var(--surface)', tokens);
	for (const [key, c] of questColors(tokens)) {
		const ratio = contrastRatio(c, surface);
		const d = deltaE(c, accent);
		const { c: chroma, h } = oklch(c);
		const hue = hueDistance(h, accentHue);
		const grey = chroma < CHROMA_GREY;
		const info = `${key.padEnd(7)} ${toHex(c)}  h ${h.toFixed(0).padStart(3)}°`;
		out.push(
			{
				id: `quest ${key} contrast`,
				ok: ratio >= QUEST_MIN_CONTRAST,
				line: `${info}  ${ratio.toFixed(2)}:1 on --surface ≥ ${QUEST_MIN_CONTRAST}`
			},
			{
				id: `quest ${key} vs accent`,
				ok: d >= QUEST_ACCENT_MIN_DELTA && (grey || hue >= QUEST_ACCENT_MIN_HUE),
				line: `${info}  ΔE ${d.toFixed(3)} ≥ ${QUEST_ACCENT_MIN_DELTA}, hue ${grey ? 'n/a (grey)' : `${hue.toFixed(0)}° ≥ ${QUEST_ACCENT_MIN_HUE}°`} from --accent`
			}
		);
	}
	const closest = closestQuestPair(questColors(tokens));
	out.push({
		id: 'quest closest pair',
		ok: closest.d >= QUEST_MIN_DELTA,
		line: `closest quest pair: ${closest.pair.join(' / ')} ΔE ${closest.d.toFixed(3)} ≥ ${QUEST_MIN_DELTA}`
	});
	return out;
}

if (import.meta.main) {
	const path = process.argv[2] ?? TOKENS_PATH;
	const themes = themeTokens(readFileSync(path, 'utf8'));
	console.log(`Palette checks for ${path}:`);
	let failed = 0;
	for (const { name, tokens } of themes) {
		console.log(`\n${name} theme`);
		for (const f of paletteFindings(tokens)) {
			console.log(`  ${f.ok ? 'ok  ' : 'FAIL'} ${f.line}`);
			if (!f.ok) failed++;
		}
	}
	console.log(failed ? `\n${failed} failed` : '\nall ok');
	process.exit(failed ? 1 : 0);
}
