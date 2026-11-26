import { slide } from 'svelte/transition';

/**
 * Motion helpers for JS-driven animation. Durations and easings live in `tokens.css`
 * (`--dur-*`, `--ease-*`); JS reads them from there instead of repeating numbers, and every
 * animation respects `prefers-reduced-motion` (the global CSS rule covers CSS animations).
 */

/** A CSS time (`320ms`, `0.2s`, `.5s`) → milliseconds; anything else → `fallback`. */
export function parseCssTime(value: string | null | undefined, fallback = 0): number {
	const m = /^\s*(-?\d*\.?\d+)(ms|s)\s*$/i.exec(value ?? '');
	if (!m) return fallback;
	const n = Number(m[1]) * (m[2].toLowerCase() === 's' ? 1000 : 1);
	return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * The longest of a comma-separated list of CSS times (`getComputedStyle().animationDuration`
 * may list one per animation) → ms.
 */
export function longestCssTime(list: string | null | undefined): number {
	return (list ?? '').split(',').reduce((max, part) => Math.max(max, parseCssTime(part, 0)), 0);
}

/** The user asked the OS for less motion (always false during SSR). */
export function prefersReducedMotion(): boolean {
	return (
		typeof window !== 'undefined' &&
		typeof window.matchMedia === 'function' &&
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/** A duration token (`--dur-sheet`) in ms, 0 under reduced motion or outside the browser. */
export function motionMs(token: `--${string}`, fallback = 0): number {
	if (typeof document === 'undefined' || prefersReducedMotion()) return 0;
	const raw = getComputedStyle(document.documentElement).getPropertyValue(token);
	return parseCssTime(raw, fallback);
}

/** An easing token (`--ease-out`) as a CSS string, for the Web Animations API. */
export function motionEase(token: `--${string}`, fallback = 'ease-out'): string {
	if (typeof document === 'undefined') return fallback;
	const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
	return raw || fallback;
}

/** A cubic Bézier timing function (CSS `cubic-bezier(x1, y1, x2, y2)`) as `t → progress`. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
	const cx = 3 * x1;
	const bx = 3 * (x2 - x1) - cx;
	const ax = 1 - cx - bx;
	const cy = 3 * y1;
	const by = 3 * (y2 - y1) - cy;
	const ay = 1 - cy - by;
	const x = (u: number) => ((ax * u + bx) * u + cx) * u;
	const y = (u: number) => ((ay * u + by) * u + cy) * u;
	const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
	return (t: number) => {
		if (t <= 0) return 0;
		if (t >= 1) return 1;
		// Newton–Raphson on x(u) = t, bisection as the fallback.
		let u = t;
		for (let i = 0; i < 8; i++) {
			const err = x(u) - t;
			if (Math.abs(err) < 1e-6) return y(u);
			const d = dx(u);
			if (Math.abs(d) < 1e-6) break;
			u -= err / d;
		}
		let lo = 0;
		let hi = 1;
		u = t;
		for (let i = 0; i < 30; i++) {
			const v = x(u);
			if (Math.abs(v - t) < 1e-6) break;
			if (v < t) lo = u;
			else hi = u;
			u = (lo + hi) / 2;
		}
		return y(u);
	};
}

const linear = (t: number) => t;

/** A CSS easing string (`cubic-bezier(…)`, `linear`, `ease-out`, …) as a JS easing function. */
export function cssEasing(value: string | null | undefined): (t: number) => number {
	const v = (value ?? '').trim();
	const m = /^cubic-bezier\(([^)]+)\)$/i.exec(v);
	if (m) {
		const n = m[1].split(',').map((p) => Number(p.trim()));
		if (n.length === 4 && n.every(Number.isFinite)) return cubicBezier(n[0], n[1], n[2], n[3]);
	}
	switch (v) {
		case 'linear':
			return linear;
		case 'ease':
			return cubicBezier(0.25, 0.1, 0.25, 1);
		case 'ease-in':
			return cubicBezier(0.42, 0, 1, 1);
		case 'ease-in-out':
			return cubicBezier(0.42, 0, 0.58, 1);
		default:
			return cubicBezier(0, 0, 0.58, 1); // ease-out
	}
}

/** An easing token (`--ease-out`) as a JS easing function (Svelte transitions). */
export function motionEasing(token: `--${string}`): (t: number) => number {
	return cssEasing(motionEase(token, 'ease-out'));
}

/** The phone breakpoint shared with the CSS (`@media (max-width: 720px)`). */
export const PHONE_QUERY = '(max-width: 720px)';

export function isPhoneViewport(): boolean {
	return typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches;
}

/**
 * Svelte transition: rise from (and sink back to) below its own height — the mini-player
 * and other bars that live at the bottom of the screen. Token durations/easings; instant
 * under reduced motion.
 */
export function rise(_node: Element, { enter = true }: { enter?: boolean } = {}) {
	return {
		duration: motionMs(enter ? '--dur-sheet' : '--dur-sheet-out'),
		easing: motionEasing(enter ? '--ease-out' : '--ease-in'),
		css: (t: number) => `transform: translateY(${(1 - t) * 100}%); opacity: ${Math.min(1, t * 2)}`
	};
}

/** Svelte transition: a short rise + fade for values that just changed (`{#key value}`). */
export function tickIn(_node: Element) {
	return {
		duration: motionMs('--dur-pop'),
		easing: motionEasing('--ease-out'),
		css: (t: number) => `opacity: ${t}; transform: translateY(${(1 - t) * 0.25}em)`
	};
}

/**
 * Svelte transition: a one-off pop with a slight spring overshoot (Home's "All done" check).
 * Svelte runs intros only for blocks created after hydration, so it never plays on first paint.
 */
export function pop(_node: Element) {
	return {
		duration: motionMs('--dur-celebrate'),
		easing: motionEasing('--ease-spring'),
		css: (t: number) => `opacity: ${Math.min(1, t * 3)}; transform: scale(${0.3 + 0.7 * t})`
	};
}

/** Svelte transition: fade + slight shrink (cards that give way to something else). */
export function fadeScale(_node: Element) {
	return {
		duration: motionMs('--dur-pop'),
		easing: motionEasing('--ease-out'),
		css: (t: number) => `opacity: ${t}; transform: scale(${0.97 + 0.03 * t})`
	};
}

/**
 * Svelte transition: a list row that was just added slides open (height) and fades in —
 * Home's Today list and Overdue group. Local transitions never run on the list's first paint.
 */
export function rowIn(node: Element, { enabled = true }: { enabled?: boolean } = {}) {
	return slide(node, {
		duration: enabled ? motionMs('--dur-row') : 0,
		easing: motionEasing('--ease-out')
	});
}

/**
 * FLIP for a keyed list whose rows move when their state changes (a checked-off task settles
 * into the done group): `measure` before the DOM update (`$effect.pre`), `play` after it
 * (`$effect`); rows that moved glide from their old place. Rows are the elements with the
 * `key` data attribute. An update that added a row is skipped (the new row's `rowIn` already
 * moves the rows below it); nothing under reduced motion.
 */
export function listFlip(key: string) {
	const attr = `data-${key}`;
	let before = new Map<string, number>();
	const rows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(`[${attr}]`)];
	return {
		measure(root: HTMLElement | undefined) {
			before = new Map();
			if (!root) return;
			for (const el of rows(root))
				before.set(el.getAttribute(attr)!, el.getBoundingClientRect().top);
		},
		play(root: HTMLElement | undefined) {
			const duration = motionMs('--dur-row');
			if (!root || duration === 0 || before.size === 0) return;
			const now = rows(root);
			if (now.some((el) => !before.has(el.getAttribute(attr)!))) return;
			const easing = motionEase('--ease-out');
			for (const el of now) {
				const dy = before.get(el.getAttribute(attr)!)! - el.getBoundingClientRect().top;
				if (Math.abs(dy) < 1) continue;
				el.animate([{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration, easing });
			}
		}
	};
}
