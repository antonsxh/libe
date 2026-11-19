import { describe, expect, test } from 'bun:test';
import {
	i18n,
	intlLocale,
	isLanguageSetting,
	localeFromLanguages,
	negotiateLocale,
	parseAcceptLanguage,
	resolveLocale
} from './index.ts';
import { en } from './en.ts';
import { de } from './de.ts';

describe('parseAcceptLanguage', () => {
	test('orders by q, ties keep header order, drops q=0', () => {
		expect(parseAcceptLanguage('fr-CH, fr;q=0.9, en;q=0.8, de;q=0.9, *;q=0.5, it;q=0')).toEqual([
			{ tag: 'fr-ch', q: 1 },
			{ tag: 'fr', q: 0.9 },
			{ tag: 'de', q: 0.9 },
			{ tag: 'en', q: 0.8 },
			{ tag: '*', q: 0.5 }
		]);
	});

	test('whitespace, case and out-of-range q', () => {
		expect(parseAcceptLanguage(' DE-at ;  q=0.7 ,EN ; q=2')).toEqual([
			{ tag: 'en', q: 1 },
			{ tag: 'de-at', q: 0.7 }
		]);
	});

	test('garbage and empty headers', () => {
		expect(parseAcceptLanguage(null)).toEqual([]);
		expect(parseAcceptLanguage('')).toEqual([]);
		expect(parseAcceptLanguage(';;,, ,')).toEqual([]);
		expect(parseAcceptLanguage('<script>, de_DE, 12, de;q=abc')).toEqual([]);
		expect(parseAcceptLanguage('de;q=abc, en')).toEqual([{ tag: 'en', q: 1 }]);
	});
});

describe('negotiateLocale', () => {
	test('German when de is preferred over en', () => {
		expect(negotiateLocale('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
		expect(negotiateLocale('de-AT')).toBe('de');
		expect(negotiateLocale('de-CH, en;q=0.9')).toBe('de');
		expect(negotiateLocale('fr-CH, fr;q=0.9, de;q=0.7, en;q=0.5')).toBe('de');
		expect(negotiateLocale('en;q=0.5, de;q=0.8')).toBe('de');
	});

	test('English when en comes first or nothing supported is asked for', () => {
		expect(negotiateLocale('en-US,en;q=0.9,de;q=0.8')).toBe('en');
		expect(negotiateLocale('en-GB, de')).toBe('en');
		expect(negotiateLocale('de;q=0, en')).toBe('en');
		expect(negotiateLocale('fr, it')).toBe('en');
		expect(negotiateLocale('*')).toBe('en');
		expect(negotiateLocale('*, de;q=0.5')).toBe('de');
		expect(negotiateLocale('nonsense!!')).toBe('en');
		expect(negotiateLocale(undefined)).toBe('en');
	});

	test('navigator.languages lists (offline page, desktop app)', () => {
		expect(localeFromLanguages(['de-AT', 'en-US'])).toBe('de');
		expect(localeFromLanguages(['fr', 'en', 'de'])).toBe('en');
		expect(localeFromLanguages([])).toBe('en');
	});
});

test('resolveLocale: a fixed setting wins over the header', () => {
	expect(resolveLocale('auto', 'de-DE')).toBe('de');
	expect(resolveLocale('auto', 'en-US')).toBe('en');
	expect(resolveLocale('en', 'de-DE')).toBe('en');
	expect(resolveLocale('de', 'en-US')).toBe('de');
	expect(resolveLocale('de', null)).toBe('de');
});

test('settings values and Intl tags', () => {
	expect(['auto', 'en', 'de'].every(isLanguageSetting)).toBe(true);
	expect(isLanguageSetting('fr')).toBe(false);
	expect(isLanguageSetting('')).toBe(false);
	expect(intlLocale('en')).toBe('en-US');
	expect(intlLocale('de')).toBe('de-DE');
	expect(i18n('de').intl).toBe('de-DE');
	expect(i18n('de').nav.calendar).toBe('Kalender');
});

/** Every leaf: path → 'string' | 'function/<arity>'; also collects empty strings. */
function shape(value: unknown, path = '', out: Record<string, string> = {}, empty: string[] = []) {
	if (typeof value === 'string') {
		out[path] = 'string';
		if (value.trim() === '') empty.push(path);
	} else if (typeof value === 'function') {
		out[path] = `function/${value.length}`;
		// Call with placeholder arguments: every function must produce text.
		const text = (value as (...args: unknown[]) => unknown)(
			...Array.from({ length: value.length }, (_, i) => (i % 2 ? 'x' : 2))
		);
		if (typeof text !== 'string' || text.trim() === '') empty.push(`${path}()`);
	} else if (value && typeof value === 'object') {
		for (const [key, child] of Object.entries(value)) shape(child, `${path}.${key}`, out, empty);
	} else {
		out[path] = typeof value;
	}
	return { out, empty };
}

test('de has exactly the keys, kinds and arities of en, and no empty texts', () => {
	const a = shape(en);
	const b = shape(de);
	expect(b.out).toEqual(a.out);
	expect(a.empty).toEqual([]);
	expect(b.empty).toEqual([]);
	expect(Object.keys(a.out).length).toBeGreaterThan(300);
});

test('German texts use real umlauts, not ae/oe/ue transliterations', () => {
	const all: string[] = [];
	const collect = (v: unknown) => {
		if (typeof v === 'string') all.push(v);
		else if (v && typeof v === 'object') Object.values(v).forEach(collect);
	};
	collect(de);
	const suspicious = all.filter((s) =>
		/\b(fuer|ueber|zurueck|loeschen|aendern|schliessen)\b/i.test(s)
	);
	expect(suspicious).toEqual([]);
});
