/**
 * UI language (client-safe, pure). Messages live in `en.ts` (source of truth, its type is
 * `Messages`) and `de.ts` (typed `Messages`, so a missing or extra key fails the type check).
 *
 * - Server: `event.locals.locale` (resolved in `hooks.server.ts` from the `settings.language`
 *   row and `Accept-Language`) → `i18n(locals.locale)` for messages built in `load`/actions.
 * - Components: `const t = useI18n()` (`./context.svelte.ts`) → `t.nav.home`, `t.intl`.
 * - Pure modules never import the messages at runtime: they return error codes
 *   (`ErrorCode`, keys of `Messages['errors']`) or take an `I18n` argument.
 */
import { en, type Messages } from './en.ts';
import { de } from './de.ts';

export type { Messages };

export const LOCALES = ['en', 'de'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** `settings.language`: a fixed locale, or `auto` = negotiate per request (`Accept-Language`). */
export const LANGUAGE_SETTINGS = ['auto', 'en', 'de'] as const;
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];

const INTL = { en: 'en-US', de: 'de-DE' } as const;
/** BCP 47 tag for `Intl` formatting of a locale. */
export type IntlLocale = (typeof INTL)[Locale];

/** Messages plus the locale they belong to and its `Intl` tag. */
export type I18n = Messages & { readonly locale: Locale; readonly intl: IntlLocale };

/** A validation / API error that callers translate with `t.errors[code]`. */
export type ErrorCode = keyof Messages['errors'];

const BUNDLES: Record<Locale, I18n> = {
	en: { ...en, locale: 'en', intl: INTL.en },
	de: { ...de, locale: 'de', intl: INTL.de }
};

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function isLanguageSetting(value: unknown): value is LanguageSetting {
	return typeof value === 'string' && (LANGUAGE_SETTINGS as readonly string[]).includes(value);
}

export function intlLocale(locale: Locale): IntlLocale {
	return INTL[locale];
}

/** Messages of a locale (shared objects — never mutate). */
export function i18n(locale: Locale): I18n {
	return BUNDLES[locale] ?? BUNDLES[DEFAULT_LOCALE];
}

export interface LanguageRange {
	/** Lower-cased tag, e.g. `de-at`, `en`, `*`. */
	tag: string;
	q: number;
}

/**
 * `Accept-Language` → ranges by preference: highest `q` first, ties in header order.
 * Malformed entries and `q=0` ("not acceptable") are dropped.
 */
export function parseAcceptLanguage(header: string | null | undefined): LanguageRange[] {
	if (!header) return [];
	const ranges: (LanguageRange & { i: number })[] = [];
	header.split(',').forEach((part, i) => {
		const [rawTag, ...params] = part.trim().split(';');
		const tag = rawTag.trim().toLowerCase();
		if (!/^(\*|[a-z]{1,8}(-[a-z0-9]{1,8})*)$/.test(tag)) return;
		let q = 1;
		for (const p of params) {
			const m = /^\s*q\s*=(.*)$/i.exec(p);
			if (!m) continue;
			// A malformed weight makes the whole range unusable.
			const n = /^\s*\d+(\.\d+)?\s*$/.test(m[1]) ? Number(m[1]) : 0;
			q = Math.min(1, Math.max(0, n));
		}
		if (q > 0) ranges.push({ tag, q, i });
	});
	ranges.sort((a, b) => b.q - a.q || a.i - b.i);
	return ranges.map(({ tag, q }) => ({ tag, q }));
}

/**
 * The first supported language in a preference list (`de-AT` counts as `de`); `*` and
 * unsupported languages are skipped, nothing supported → English.
 */
export function localeFromLanguages(tags: readonly string[]): Locale {
	for (const tag of tags) {
		const primary = tag.trim().toLowerCase().split('-')[0];
		if (isLocale(primary)) return primary;
	}
	return DEFAULT_LOCALE;
}

/** German when the request prefers `de` over `en`, else English. */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
	return localeFromLanguages(parseAcceptLanguage(acceptLanguage).map((r) => r.tag));
}

/** The effective locale for a stored setting and the request's `Accept-Language`. */
export function resolveLocale(
	setting: LanguageSetting,
	acceptLanguage: string | null | undefined
): Locale {
	return setting === 'auto' ? negotiateLocale(acceptLanguage) : setting;
}
