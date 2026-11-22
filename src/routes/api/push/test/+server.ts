import { json } from '@sveltejs/kit';
import { i18n } from '#lib/i18n/index.ts';
import { sendTestPush } from '#lib/server/push.ts';
import type { RequestHandler } from './$types';

/**
 * Send a test notification to this device (JSON body, e.g. `{}`) → `{ ok: true }`;
 * 404 `pushNotSubscribed` without a subscription, 502 `pushSendFailed` when the push service
 * refused it (an expired subscription is removed — the client then shows "off").
 */
export const POST: RequestHandler = async ({ locals }) => {
	const t = i18n(locals.locale);
	const outcome = await sendTestPush(locals.device!.id);
	if (outcome === 'sent') return json({ ok: true });
	const code = outcome === 'none' ? 'pushNotSubscribed' : 'pushSendFailed';
	return json(
		{ ok: false, code, gone: outcome === 'gone', error: t.errors[code] },
		{ status: outcome === 'none' ? 404 : 502 }
	);
};
