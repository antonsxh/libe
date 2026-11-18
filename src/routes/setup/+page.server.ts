import { fail, redirect } from '@sveltejs/kit';
import { deviceNameFromUA, parseDeviceKind, parseDeviceName, safeNext } from '#lib/auth.ts';
import {
	checkSetupSecret,
	clientKey,
	retryMessage,
	setDeviceCookie,
	setupLimiter,
	setupSecretConfigured
} from '#lib/server/auth.ts';
import { countActiveDevices, createDevice } from '#lib/server/devices.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * `/setup` pairs a device with `LIBE_SETUP_SECRET`. It is the bootstrap for the first device
 * and stays usable afterwards as the owner's recovery path (lost all devices) — whoever
 * knows the server's secret owns the server anyway. Failed attempts are rate-limited per IP.
 */
export const load = (async ({ locals, request, url }) => ({
	configured: setupSecretConfigured(),
	hasDevices: (await countActiveDevices()) > 0,
	pairedAs: locals.device?.name ?? null,
	defaultName: deviceNameFromUA(request.headers.get('user-agent')),
	next: safeNext(url.searchParams.get('next'))
})) satisfies PageServerLoad;

export const actions = {
	default: async (event) => {
		const { request, cookies, url } = event;
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		if (!setupSecretConfigured())
			return fail(503, { name, error: 'Setup is disabled: LIBE_SETUP_SECRET is not set.' });

		const key = clientKey(event);
		const limit = setupLimiter.check(key);
		if (!limit.ok) return fail(429, { name, error: retryMessage(limit.retryAfterMs) });

		const parsedName = parseDeviceName(name);
		if (!parsedName.ok) return fail(400, { name, error: parsedName.error });
		if (!checkSetupSecret(form.get('secret'))) {
			setupLimiter.fail(key);
			return fail(400, { name, error: 'Wrong setup secret.' });
		}

		const { token } = await createDevice({
			name: parsedName.value,
			kind: parseDeviceKind(form.get('kind')),
			userAgent: request.headers.get('user-agent')
		});
		setDeviceCookie(cookies, url, token);
		redirect(303, safeNext(form.get('next')));
	}
} satisfies Actions;
