/**
 * Appearance (R3 — light mode): the theme is a **per-device** choice stored in the `libe_theme`
 * cookie (same rules as the device cookie), so the first paint already renders the right palette
 * — no flash. `auto` is resolved by the browser, not the server: tokens.css applies its light
 * overrides to `:root[data-theme='auto']` under `prefers-color-scheme: light`.
 *
 * Keep this module pure (except `applyTheme`, which is DOM-only and guarded); the cookie is set
 * in the Settings form action and read in `hooks.server.ts`.
 */
export const THEME_COOKIE = 'libe_theme';

export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

/** Without a (valid) cookie the app renders dark — the shipped default palette. */
export const DEFAULT_THEME: Theme = 'dark';

/** Keep the choice for a year (the device cookie's lifetime is the same order). */
export const THEME_MAX_AGE_S = 365 * 24 * 60 * 60;

export function isTheme(value: unknown): value is Theme {
	return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** The cookie value, or the default when it is missing or invalid. */
export function parseTheme(value: unknown): Theme {
	return isTheme(value) ? value : DEFAULT_THEME;
}

/** Status-bar / browser-chrome colour of each theme (matches `--bg`). */
export const THEME_COLORS = { dark: '#000000', light: '#f2f2f7' } as const;

/** The `color-scheme` meta content of each theme (native widgets follow it). */
export const COLOR_SCHEME_META = { dark: 'dark', light: 'light', auto: 'light dark' } as const;

export function colorSchemeMeta(theme: Theme): string {
	return COLOR_SCHEME_META[theme];
}

/**
 * The `theme-color` + `color-scheme` head tags of a theme. `auto` gets one `theme-color`
 * per OS appearance (via `media`), so the browser chrome follows the OS like the page does.
 */
export function themeMetaHtml(theme: Theme): string {
	if (theme === 'auto') {
		return (
			`<meta name="theme-color" media="(prefers-color-scheme: light)" content="${THEME_COLORS.light}" />` +
			`<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${THEME_COLORS.dark}" />` +
			`<meta name="color-scheme" content="${colorSchemeMeta(theme)}" />`
		);
	}
	return (
		`<meta name="theme-color" content="${THEME_COLORS[theme]}" />` +
		`<meta name="color-scheme" content="${colorSchemeMeta(theme)}" />`
	);
}

/**
 * Switch this document to a theme right away (after a Settings save, without a reload):
 * `data-theme` on `<html>` plus the head metas. The server sends these on every page load,
 * so SSR never calls this.
 */
export function applyTheme(theme: Theme): void {
	if (typeof document === 'undefined') return;
	document.documentElement.dataset.theme = theme;
	document.head
		.querySelectorAll('meta[name="theme-color"], meta[name="color-scheme"]')
		.forEach((meta) => meta.remove());
	const tags = document.createElement('template');
	tags.innerHTML = themeMetaHtml(theme);
	for (const node of Array.from(tags.content.children)) document.head.append(node);
}
