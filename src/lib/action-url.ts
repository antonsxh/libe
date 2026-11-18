/**
 * `?<params>&/name` for a form action, keeping the page's own query params.
 *
 * Kit 3 lands a submission — enhanced or native — on the action URL minus its `/name`
 * param. A bare `?/add` resolves to the path *without* the page's params, so every
 * mutation would drop `?week=`, `?q=`, `?hideDone=`… and navigate away from the view.
 * Any previous action param (`/x`) in `search` is dropped.
 */
export function actionWithQuery(search: string, name: string): string {
	const params = new URLSearchParams(search);
	for (const key of [...params.keys()]) if (key.startsWith('/')) params.delete(key);
	const qs = params.toString();
	return qs ? `?${qs}&/${name}` : `?/${name}`;
}
