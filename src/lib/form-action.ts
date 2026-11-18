import { page } from '$app/state';
import { actionWithQuery } from '#lib/action-url.ts';

/**
 * Form `action` for the named action that keeps the current page's query string
 * (`?week=…&q=…&/add`) — see {@link actionWithQuery}. Call it in markup (it reads
 * `page.url`, so it stays reactive).
 */
export function formAction(name: string): string {
	return actionWithQuery(page.url.search, name);
}
