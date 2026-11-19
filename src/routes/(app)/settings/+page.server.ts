import { fail, redirect } from '@sveltejs/kit';
import { parseDeviceName } from '#lib/auth.ts';
import { isUuid } from '#lib/ids.ts';
import { clearDeviceCookie } from '#lib/server/auth.ts';
import { listDevices, renameDevice, revokeDevice } from '#lib/server/devices.ts';
import { updatePomodoroSettings } from '#lib/server/timer.ts';
import { SERVER_VERSION } from '#lib/server/version.ts';
import { parsePomodoroSettings } from '#lib/timer.ts';
import {
	getLanguageSetting,
	pomodoroSettingsFailure,
	saveLanguageSetting
} from '#lib/server/settings.ts';
import { i18n, isLanguageSetting } from '#lib/i18n/index.ts';
import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ locals, url }) => ({
	devices: await listDevices(),
	currentId: locals.device!.id,
	now: Date.now(),
	/** `?pair` (avatar menu "Pair new device") opens the pairing dialog. */
	pairOpen: url.searchParams.has('pair'),
	/** Shown next to the desktop app's update track. */
	serverVersion: SERVER_VERSION,
	/** Stored UI language choice (`auto` | `en` | `de`); `locale` (layout) is the effective one. */
	language: await getLanguageSetting()
})) satisfies PageServerLoad;

export const actions = {
	rename: async ({ request, locals }) => {
		const form = await request.formData();
		const id = form.get('id');
		const name = parseDeviceName(form.get('name'));
		const t = i18n(locals.locale);
		if (!isUuid(id))
			return fail(400, { intent: 'rename' as const, id: null, error: t.errors.unknownDevice });
		if (!name.ok) return fail(400, { intent: 'rename' as const, id, error: t.errors[name.error] });
		if (!(await renameDevice(id, name.value)))
			return fail(404, { intent: 'rename' as const, id, error: t.errors.unknownDevice });
		return { intent: 'rename' as const, id };
	},

	/** Revoke a device. Revoking this device signs it out. */
	revoke: async ({ request, locals, cookies, url }) => {
		const form = await request.formData();
		const id = form.get('id');
		if (!isUuid(id))
			return fail(400, {
				intent: 'revoke' as const,
				error: i18n(locals.locale).errors.unknownDevice
			});
		await revokeDevice(id);
		if (id === locals.device!.id) {
			clearDeviceCookie(cookies, url);
			redirect(303, '/pair');
		}
		return { intent: 'revoke' as const };
	},

	/** "Sign out this device" (avatar menu, no JS needed). */
	signout: async ({ locals, cookies, url }) => {
		await revokeDevice(locals.device!.id);
		clearDeviceCookie(cookies, url);
		redirect(303, '/pair');
	},

	/** UI language for every device: `auto` (each browser's `Accept-Language`), `en`, `de`. */
	language: async ({ request, locals }) => {
		const language = (await request.formData()).get('language');
		if (!isLanguageSetting(language))
			return fail(400, {
				intent: 'language' as const,
				error: i18n(locals.locale).errors.languageInvalid
			});
		await saveLanguageSetting(language);
		return { intent: 'language' as const, saved: true };
	},

	/** Pomodoro settings (same dialog as the Focus screen's gear). */
	settings: async ({ request, locals }) => {
		const values = Object.fromEntries(await request.formData());
		const parsed = parsePomodoroSettings(values);
		if (!parsed.ok) return fail(400, pomodoroSettingsFailure(values, parsed.errors, locals.locale));
		await updatePomodoroSettings(parsed.value);
		return { intent: 'settings' as const, saved: true };
	}
} satisfies Actions;
