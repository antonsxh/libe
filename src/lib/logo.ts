/**
 * The libe mark — one source for the in-app logo (`Logo.svelte`) and every generated icon
 * (`scripts/icons.ts`: favicons, PWA/Apple icons, the desktop app's icons), so they can't
 * drift. Geometry in a 32×32 viewBox: a rounded "l" stroke and a dot.
 */
export const LOGO = {
	viewBox: 32,
	stroke: { d: 'M11 7v14.5a3.5 3.5 0 0 0 3.5 3.5H22', width: 3.2 },
	dot: { cx: 21.5, cy: 10.5, r: 2.6 },
	/** The point icons centre on the tile (the mark's optical centre, not its bounding box). */
	center: { x: 16.4, y: 16 }
} as const;

/** Colour tokens (`tokens.css`) of the mark's parts; icons put it on `ground`. */
export const LOGO_TOKENS = {
	stroke: '--accent',
	dot: '--text',
	ground: '--bg'
} as const;
