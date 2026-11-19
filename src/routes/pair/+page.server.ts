import { fail, redirect } from '@sveltejs/kit';
import {
	deviceNameFromUA,
	formatCode,
	normalizeCode,
	parseDeviceKind,
	parseDeviceName,
	safeNext
} from '#lib/auth.ts';
import { clientKey, pairLimiter, retryMessage, setDeviceCookie } from '#lib/server/auth.ts';
import { countActiveDevices, pairErrorMessage, pairWithCode } from '#lib/server/devices.ts';
import { i18n } from '#lib/i18n/index.ts';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ locals, request, url }) => {
	const code = normalizeCode(url.searchParams.get('code'));
	return {
		code: code ? formatCode(code) : '',
		hasDevices: (await countActiveDevices()) > 0,
		pairedAs: locals.device?.name ?? null,
		defaultName: deviceNameFromUA(request.headers.get('user-agent'), {
			names: i18n(locals.locale).deviceNames
		}),
		next: safeNext(url.searchParams.get('next'))
	};
}) satisfies PageServerLoad;

export const actions = {
	/** Pair this browser with a code from an already paired device. */
	default: async (event) => {
		const { request, cookies, url, locals } = event;
		const form = await request.formData();
		const values = { code: String(form.get('code') ?? ''), name: String(form.get('name') ?? '') };

		const key = clientKey(event);
		const limit = pairLimiter.check(key);
		if (!limit.ok)
			return fail(429, { ...values, error: retryMessage(limit.retryAfterMs, locals.locale) });

		const name = parseDeviceName(values.name);
		if (!name.ok) return fail(400, { ...values, error: i18n(locals.locale).errors[name.error] });

		const result = await pairWithCode(values.code, {
			name: name.value,
			kind: parseDeviceKind(form.get('kind')),
			userAgent: request.headers.get('user-agent')
		});
		if (!result.ok) {
			if (result.reason !== 'format') pairLimiter.fail(key);
			return fail(400, { ...values, error: pairErrorMessage(result.reason, locals.locale) });
		}
		setDeviceCookie(cookies, url, result.token);
		redirect(303, safeNext(form.get('next')));
	}
} satisfies Actions;
