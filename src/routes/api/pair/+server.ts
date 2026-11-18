import { json } from '@sveltejs/kit';
import { parseDeviceKind, parseDeviceName } from '#lib/auth.ts';
import { clientKey, pairLimiter, retryMessage } from '#lib/server/auth.ts';
import { pairErrorMessage, pairWithCode } from '#lib/server/devices.ts';
import type { RequestHandler } from './$types';

/**
 * Pair a non-browser client (Tauri shell, scripts): JSON `{ code, name, kind? }` →
 * `{ ok: true, token, device }`. No cookie is set — the client keeps the token (OS keychain)
 * and sends it as `Authorization: Bearer`. A webview gets its cookie via
 * `POST /api/pair/session`. JSON bodies are not subject to SvelteKit's form CSRF check, and
 * the Tauri shell calls this from Rust (no browser CORS involved).
 */
export const POST: RequestHandler = async (event) => {
	const key = clientKey(event);
	const limit = pairLimiter.check(key);
	if (!limit.ok) {
		return json(
			{ ok: false, code: 'rate_limited', error: retryMessage(limit.retryAfterMs) },
			{ status: 429, headers: { 'retry-after': String(Math.ceil(limit.retryAfterMs / 1000)) } }
		);
	}

	let body: Record<string, unknown>;
	try {
		body = (await event.request.json()) as Record<string, unknown>;
		if (typeof body !== 'object' || body === null) throw new Error();
	} catch {
		return json({ ok: false, code: 'invalid', error: 'Expected a JSON body.' }, { status: 400 });
	}

	const name = parseDeviceName(body.name);
	if (!name.ok) return json({ ok: false, code: 'invalid', error: name.error }, { status: 400 });

	const result = await pairWithCode(body.code, {
		name: name.value,
		kind: parseDeviceKind(body.kind, 'tauri'),
		userAgent: event.request.headers.get('user-agent')
	});
	if (!result.ok) {
		if (result.reason !== 'format') pairLimiter.fail(key);
		return json(
			{ ok: false, code: result.reason, error: pairErrorMessage(result.reason) },
			{ status: result.reason === 'format' ? 400 : 401 }
		);
	}
	const { device, token } = result;
	return json({ ok: true, token, device: { id: device.id, name: device.name, kind: device.kind } });
};
