/**
 * The UI language as Svelte context — one instance per app (created in the root layout from
 * the layout data, so SSR requests never share it; same pattern as `useTimer()`).
 *
 * `useI18n()` returns a live view of the current messages: reading `t.nav.home` in markup or
 * a `$derived` tracks the locale, so a language switch (layout data reloaded after the
 * settings form action) re-renders without a full page load.
 */
import { getContext, setContext } from 'svelte';
import { i18n, type I18n, type Locale } from './index.ts';

export class LocaleState {
	locale = $state<Locale>('en');
	constructor(locale: Locale) {
		this.locale = locale;
	}
	/** The current messages (tracked). */
	get t(): I18n {
		return i18n(this.locale);
	}
}

const KEY = Symbol('i18n');

/** Root layout only. Returns the state so the layout can follow `data.locale`. */
export function setI18n(locale: Locale): LocaleState {
	return setContext(KEY, new LocaleState(locale));
}

export function useLocale(): LocaleState {
	const state = getContext<LocaleState | undefined>(KEY);
	if (!state) throw new Error('useI18n() outside the root layout');
	return state;
}

/** Messages of the current locale; property reads are reactive (see module docs). */
export function useI18n(): I18n {
	const state = useLocale();
	return new Proxy({} as I18n, {
		get: (_, key) => (state.t as unknown as Record<PropertyKey, unknown>)[key]
	});
}
