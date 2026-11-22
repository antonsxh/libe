import { describe, expect, test } from 'bun:test';
import {
	MAX_PLAINTEXT,
	VAPID_EXPIRY_S,
	b64urlDecode,
	b64urlEncode,
	encryptPayload,
	generateVapidKeys,
	vapidAuthorization
} from './push-crypto.ts';
import {
	decryptPush,
	importEcdhPrivate,
	subscriptionKeys,
	verifyVapid
} from '../../../e2e/support/web-push.ts';

const join = (s: string) => s.replace(/\s+/g, '');

/** RFC 8291 §5 / Appendix A. */
const RFC = {
	plaintext: 'When I grow up, I want to be a watermelon',
	asPublic: join(`BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg
		Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8`),
	asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
	uaPublic: join(`BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-
		JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4`),
	uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
	salt: 'DGv6ra1nlYgDCS1FRnbzlw',
	auth: 'BTBZMqHH6r4Tts7J_aSIgg',
	header: join(`DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml
		mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8`),
	ciphertext: join(`8pfeW0KbunFT06SuDKoJH9Ql87S1QUrdirN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs
		bI_0LpXMuGvnzQ`)
};

describe('base64url', () => {
	test('round-trips bytes and accepts optional padding', () => {
		const bytes = new Uint8Array([0, 255, 62, 63, 1, 2, 3]);
		const s = b64urlEncode(bytes);
		expect(s).not.toMatch(/[+/=]/);
		expect(b64urlDecode(s)).toEqual(bytes);
		expect(b64urlDecode(`${s}=`)).toEqual(bytes);
	});
	test('rejects other alphabets', () => {
		expect(() => b64urlDecode('ab+/')).toThrow();
		expect(() => b64urlDecode('a b')).toThrow();
	});
});

describe('encryptPayload (RFC 8291 aes128gcm)', () => {
	test('reproduces the RFC 8291 example byte for byte', async () => {
		const body = await encryptPayload(
			new TextEncoder().encode(RFC.plaintext),
			RFC.uaPublic,
			RFC.auth,
			{
				salt: b64urlDecode(RFC.salt),
				serverKeys: { publicKey: RFC.asPublic, privateKey: RFC.asPrivate }
			}
		);
		expect(b64urlEncode(body.subarray(0, 86))).toBe(RFC.header);
		expect(b64urlEncode(body.subarray(86))).toBe(RFC.ciphertext);
	});

	test('the RFC example decrypts with the user agent key', async () => {
		const body = await encryptPayload(
			new TextEncoder().encode(RFC.plaintext),
			RFC.uaPublic,
			RFC.auth,
			{
				salt: b64urlDecode(RFC.salt),
				serverKeys: { publicKey: RFC.asPublic, privateKey: RFC.asPrivate }
			}
		);
		const privateKey = await importEcdhPrivate(RFC.uaPublic, RFC.uaPrivate);
		expect(await decryptPush(body, { p256dh: RFC.uaPublic, auth: RFC.auth, privateKey })).toBe(
			RFC.plaintext
		);
	});

	test('fresh salt and server key per message; a subscription decrypts each', async () => {
		const keys = await subscriptionKeys();
		const msg = new TextEncoder().encode(JSON.stringify({ title: 'Zeit ist um ✓' }));
		const a = await encryptPayload(msg, keys.p256dh, keys.auth);
		const b = await encryptPayload(msg, keys.p256dh, keys.auth);
		expect(b64urlEncode(a.subarray(0, 16))).not.toBe(b64urlEncode(b.subarray(0, 16)));
		expect(b64urlEncode(a.subarray(21, 86))).not.toBe(b64urlEncode(b.subarray(21, 86)));
		expect(await decryptPush(a, keys)).toBe('{"title":"Zeit ist um ✓"}');
		expect(await decryptPush(b, keys)).toBe('{"title":"Zeit ist um ✓"}');
	});

	test('rejects bad keys and oversized payloads', async () => {
		const keys = await subscriptionKeys();
		const one = new Uint8Array(1);
		await expect(encryptPayload(one, keys.p256dh.slice(4), keys.auth)).rejects.toThrow();
		await expect(encryptPayload(one, keys.p256dh, 'AAAA')).rejects.toThrow();
		await expect(
			encryptPayload(new Uint8Array(MAX_PLAINTEXT + 1), keys.p256dh, keys.auth)
		).rejects.toThrow();
	});
});

describe('VAPID', () => {
	test('generated keys are a raw P-256 point and a 32-byte scalar', async () => {
		const keys = await generateVapidKeys();
		const pub = b64urlDecode(keys.publicKey);
		expect(pub.length).toBe(65);
		expect(pub[0]).toBe(4);
		expect(b64urlDecode(keys.privateKey).length).toBe(32);
	});

	test('Authorization header: ES256 JWT for the push service origin, signed with the key', async () => {
		const keys = await generateVapidKeys();
		const now = Date.UTC(2026, 10, 22, 12);
		const header = await vapidAuthorization(
			'https://web.push.apple.com/QGuQyavXutnMH-1/abc?x=1',
			keys,
			'https://libe.example.com',
			now
		);
		const { claims, publicKey } = await verifyVapid(header);
		expect(publicKey).toBe(keys.publicKey);
		expect(claims).toEqual({
			aud: 'https://web.push.apple.com',
			exp: now / 1000 + VAPID_EXPIRY_S,
			sub: 'https://libe.example.com'
		});
		expect(VAPID_EXPIRY_S).toBeLessThanOrEqual(24 * 3600);
	});

	test('a signature from another key does not verify', async () => {
		const a = await generateVapidKeys();
		const b = await generateVapidKeys();
		const header = await vapidAuthorization(
			'https://fcm.googleapis.com/fcm/send/x',
			a,
			'https://x.y'
		);
		const forged = header.replace(/k=.*/, `k=${b.publicKey}`);
		await expect(verifyVapid(forged)).rejects.toThrow();
	});
});
