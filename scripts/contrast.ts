/**
 * Palette checks for `src/lib/styles/tokens.css` — WCAG 2 contrast of the text/UI tokens on
 * their surfaces, and that quest colours stay apart from each other and from the accent.
 *
 *   bun scripts/contrast.ts        # report; exits 1 if a check fails
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
	...TEXT_SURFACES.map((bg) => ({ fg: '--accent', bg, min: AA_TEXT, what: 'today / now text' })),
	...TEXT_SURFACES.map((bg) => ({ fg: '--danger', bg, min: AA_TEXT, what: 'error text' })),
	{ fg: '--overdue', bg: '--surface', min: AA_UI, what: 'overdue dots' },
	{ fg: '--focus-ring', bg: '--bg', min: AA_UI, what: 'focus ring' },
	{ fg: '--focus-ring', bg: '--surface', min: AA_UI, what: 'focus ring' }
];

/** Quest colours must read as colours (UI contrast) and differ from each other and the accent. */
export const QUEST_MIN_CONTRAST = AA_UI;
export const QUEST_MIN_DELTA = 0.06;
export const QUEST_ACCENT_MIN_DELTA = 0.08;

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

if (import.meta.main) {
	const tokens = readTokens(readFileSync(TOKENS_PATH, 'utf8'));
	let failed = 0;
	console.log('WCAG 2 contrast (fg on bg):');
	for (const r of runChecks(tokens)) {
		if (!r.ok) failed++;
		console.log(
			`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.ratio.toFixed(2).padStart(5)}:1 ≥ ${r.min}  ${r.fg} on ${r.bg}  (${r.what})`
		);
	}
	const quests = questColors(tokens);
	const accent = resolveColor('var(--accent)', tokens);
	const surface = resolveColor('var(--surface)', tokens);
	console.log('\nQuest colours (contrast on --surface, ΔE OKLab to --accent):');
	for (const [key, c] of quests) {
		const ratio = contrastRatio(c, surface);
		const d = deltaE(c, accent);
		const ok = ratio >= QUEST_MIN_CONTRAST && d >= QUEST_ACCENT_MIN_DELTA;
		if (!ok) failed++;
		console.log(
			`  ${ok ? 'ok  ' : 'FAIL'} ${key.padEnd(7)} ${toHex(c)}  ${ratio.toFixed(2)}:1  ΔE ${d.toFixed(3)}`
		);
	}
	const closest = closestQuestPair(quests);
	const closeOk = closest.d >= QUEST_MIN_DELTA;
	if (!closeOk) failed++;
	console.log(
		`  ${closeOk ? 'ok  ' : 'FAIL'} closest pair: ${closest.pair.join(' / ')} ΔE ${closest.d.toFixed(3)} ≥ ${QUEST_MIN_DELTA}`
	);
	process.exit(failed ? 1 : 0);
}
