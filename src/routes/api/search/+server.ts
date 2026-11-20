import { json } from '@sveltejs/kit';
import { search } from '#lib/server/search.ts';
import type { RequestHandler } from './$types';

/**
 * Command palette search: `?q=` → `{ q, today, quests, tasks }` (see `server/search.ts`).
 * Authenticated like every `/api/**` route (the hook answers 401 without a device). An empty
 * or blank `q` gives empty groups; longer queries are cut to `SEARCH_MAX_LEN`.
 */
export const GET: RequestHandler = async ({ url }) => {
	return json(await search(url.searchParams.get('q')), {
		headers: { 'cache-control': 'no-store' }
	});
};
