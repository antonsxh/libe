// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthDevice } from '#lib/auth.ts';
import type { Locale } from '#lib/i18n/index.ts';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** The paired device making this request (null on public routes without auth). */
			device: AuthDevice | null;
			/** Effective UI language: the `settings.language` row, `auto` → `Accept-Language`. */
			locale: Locale;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
