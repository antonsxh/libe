import { json } from '@sveltejs/kit';
import { formatCode } from '#lib/auth.ts';
import { createPairingCode } from '#lib/server/devices.ts';
import type { RequestHandler } from './$types';

/** A fresh pairing code for another device (replaces this device's previous one). */
export const POST: RequestHandler = async ({ locals, url }) => {
	const issued = await createPairingCode(locals.device!.id);
	return json(
		{
			ok: true,
			id: issued.id,
			code: formatCode(issued.code),
			expiresAt: issued.expiresAt.getTime(),
			now: Date.now(),
			url: new URL(`/pair?code=${issued.code}`, url.origin).href
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
