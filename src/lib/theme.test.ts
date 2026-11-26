import { describe, expect, test } from 'bun:test';
import {
	COLOR_SCHEME_META,
	DEFAULT_THEME,
	THEME_COOKIE,
	THEME_COLORS,
	THEMES,
	applyTheme,
	colorSchemeMeta,
	isTheme,
	parseTheme,
	themeMetaHtml
} from './theme.ts';

describe('parseTheme', () => {
	test('accepts exactly the three known themes', () => {
		for (const theme of THEMES) expect(parseTheme(theme)).toBe(theme);
	});

	test('missing and invalid cookie values fall back to dark', () => {
		expect(DEFAULT_THEME).toBe('dark');
		for (const value of [undefined, null, '', 'blau', 'Light', 'LIGHT', '0', 'constructor']) {
			expect(parseTheme(value)).toBe('dark');
		}
	});

	test('isTheme is a type guard over THEMES only (no prototype keys)', () => {
		expect(isTheme('auto')).toBe(true);
		expect(isTheme('toString')).toBe(false);
		expect(isTheme(42)).toBe(false);
	});
});

describe('head metas', () => {
	test('the cookie is named like the device cookie is', () => {
		expect(THEME_COOKIE).toBe('libe_theme');
	});

	test('color-scheme follows the theme, auto covers both', () => {
		expect(colorSchemeMeta('dark')).toBe('dark');
		expect(colorSchemeMeta('light')).toBe('light');
		expect(colorSchemeMeta('auto')).toBe('light dark');
	});

	test('theme-colour matches each theme’s --bg', () => {
		expect(COLOR_SCHEME_META).toEqual({ dark: 'dark', light: 'light', auto: 'light dark' });
		expect(THEME_COLORS.dark).toBe('#000000');
		expect(THEME_COLORS.light).toBe('#f2f2f7');
	});

	test('dark and light get one theme-color, auto one per OS appearance', () => {
		const dark = themeMetaHtml('dark');
		expect(dark.match(/name="theme-color"/g)).toHaveLength(1);
		expect(dark).toContain('content="#000000"');
		expect(dark).toContain('<meta name="color-scheme" content="dark" />');

		const light = themeMetaHtml('light');
		expect(light.match(/name="theme-color"/g)).toHaveLength(1);
		expect(light).toContain('content="#f2f2f7"');
		expect(light).toContain('<meta name="color-scheme" content="light" />');

		const auto = themeMetaHtml('auto');
		expect(auto.match(/name="theme-color"/g)).toHaveLength(2);
		expect(auto).toContain('media="(prefers-color-scheme: light)" content="#f2f2f7"');
		expect(auto).toContain('media="(prefers-color-scheme: dark)" content="#000000"');
		expect(auto).toContain('<meta name="color-scheme" content="light dark" />');
	});
});

describe('applyTheme', () => {
	test('is a no-op without a document (SSR)', () => {
		expect(() => applyTheme('light')).not.toThrow();
	});
});
