// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { AuthDevice } from '#lib/auth.ts';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			/** The paired device making this request (null on public routes without auth). */
			device: AuthDevice | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
