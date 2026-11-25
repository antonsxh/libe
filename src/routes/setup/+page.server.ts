import { fail, redirect } from '@sveltejs/kit';
import { deviceNameFromUA, parseDeviceKind, parseDeviceName, safeNext } from '#lib/auth.ts';
import {
	checkSetupSecret,
	clientKey,
	retryMessage,
	setDeviceCookie,
	setWelcomeCookie,
	setupLimiter,
	setupSecretConfigured
} from '#lib/server/auth.ts';
import { countActiveDevices, createDevice } from '#lib/server/devices.ts';
import { isOnboarded, setDisplayNameIfUnset } from '#lib/server/settings.ts';
import { normalizeDisplayName } from '#lib/profile.ts';
import { WELCOME_PATH, postSetupTarget } from '#lib/onboarding.ts';
import { i18n } from '#lib/i18n/index.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * `/setup` pairs a device with `LIBE_SETUP_SECRET`. It is the bootstrap for the first device
 * and stays usable afterwards as the owner's recovery path (lost all devices) — whoever
 * knows the server's secret owns the server anyway. Failed attempts are rate-limited per IP.
 *
 * The optional "Your name" (`displayName`, shown for the first device) only fills an empty
 * profile name — a public form never overwrites the stored name, and the page never shows it.
 *
 * The first device of an install that hasn't been through the first-run flow lands on
 * `/welcome` (whatever `next` says) — the flow is its welcome, so no `libe_welcome` notice.
 */
export const load = (async ({ locals, request, url }) => ({
	configured: setupSecretConfigured(),
	hasDevices: (await countActiveDevices()) > 0,
	pairedAs: locals.device?.name ?? null,
	defaultName: deviceNameFromUA(request.headers.get('user-agent'), {
		names: i18n(locals.locale).deviceNames
	}),
	next: safeNext(url.searchParams.get('next'))
})) satisfies PageServerLoad;

export const actions = {
	default: async (event) => {
		const { request, cookies, url, locals } = event;
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const displayName = String(form.get('displayName') ?? '');
		const echo = { name, displayName };
		const t = i18n(locals.locale);
		if (!setupSecretConfigured()) return fail(503, { ...echo, error: t.errors.setupDisabled });

		const key = clientKey(event);
		const limit = setupLimiter.check(key);
		if (!limit.ok)
			return fail(429, { ...echo, error: retryMessage(limit.retryAfterMs, locals.locale) });

		const parsedName = parseDeviceName(name);
		if (!parsedName.ok) return fail(400, { ...echo, error: t.errors[parsedName.error] });
		const parsedDisplayName = normalizeDisplayName(displayName);
		if (!parsedDisplayName.ok)
			return fail(400, { ...echo, error: t.errors[parsedDisplayName.error] });
		if (!checkSetupSecret(form.get('secret'))) {
			setupLimiter.fail(key);
			return fail(400, { ...echo, error: t.errors.wrongSetupSecret });
		}

		const [activeDevices, onboarded] = await Promise.all([countActiveDevices(), isOnboarded()]);
		const target = postSetupTarget({
			firstDevice: activeDevices === 0,
			onboarded,
			next: safeNext(form.get('next'))
		});
		const { token } = await createDevice({
			name: parsedName.value,
			kind: parseDeviceKind(form.get('kind')),
			userAgent: request.headers.get('user-agent')
		});
		if (parsedDisplayName.value) await setDisplayNameIfUnset(parsedDisplayName.value);
		setDeviceCookie(cookies, url, token);
		if (target !== WELCOME_PATH) setWelcomeCookie(cookies, url);
		redirect(303, target);
	}
} satisfies Actions;
