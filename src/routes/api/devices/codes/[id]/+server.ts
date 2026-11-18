import { json } from '@sveltejs/kit';
import { isUuid } from '#lib/ids.ts';
import { pairingCodeInfo } from '#lib/server/devices.ts';
import type { RequestHandler } from './$types';

/** Status of a code this device issued: active | used (+ device name) | expired | locked. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const info = isUuid(params.id) ? await pairingCodeInfo(params.id, locals.device!.id) : null;
	if (!info) return json({ ok: false, code: 'not_found', error: 'Unknown code.' }, { status: 404 });
	return json(
		{ ok: true, status: info.status, deviceName: info.deviceName },
		{ headers: { 'cache-control': 'no-store' } }
	);
};
