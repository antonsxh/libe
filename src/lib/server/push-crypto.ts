/**
 * Web Push crypto with WebCrypto only (no dependency): VAPID (RFC 8292, an ES256 JWT) and
 * the `aes128gcm` message encryption of RFC 8291 / RFC 8188. Works in Bun and Node.
 *
 * Keys travel as base64url strings, the format browsers use: a public key is the 65-byte
 * uncompressed P-256 point, a private key the 32-byte scalar `d`.
 */

const enc = new TextEncoder();

export function b64urlEncode(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode base64url (padding optional). Throws on characters outside the alphabet. */
export function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
	if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value)) throw new Error('invalid base64url');
	const b64 = value.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
}

export interface KeyPair {
	/** base64url, 65-byte uncompressed P-256 point. */
	publicKey: string;
	/** base64url, 32-byte private scalar. */
	privateKey: string;
}

/** A P-256 key pair in the browser's format (VAPID application server keys). */
export async function generateVapidKeys(): Promise<KeyPair> {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
		'sign',
		'verify'
	])) as CryptoKeyPair;
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
	const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
	return { publicKey: b64urlEncode(raw), privateKey: jwk.d! };
}

/** JWK of a P-256 private key from the raw public point + scalar. */
function privateJwk(keys: KeyPair): JsonWebKey {
	const pub = b64urlDecode(keys.publicKey);
	if (pub.length !== 65 || pub[0] !== 4) throw new Error('invalid P-256 public key');
	return {
		kty: 'EC',
		crv: 'P-256',
		x: b64urlEncode(pub.subarray(1, 33)),
		y: b64urlEncode(pub.subarray(33, 65)),
		d: keys.privateKey,
		ext: true
	};
}

/** VAPID JWTs are valid for at most 24 h; 12 h leaves room for clock skew. */
export const VAPID_EXPIRY_S = 12 * 3600;

/**
 * The `Authorization` header value for a push to `endpoint`: `vapid t=<JWT>, k=<public key>`.
 * `aud` is the push service's origin, `sub` a contact URL (https: or mailto:).
 */
export async function vapidAuthorization(
	endpoint: string,
	keys: KeyPair,
	subject: string,
	nowMs = Date.now()
): Promise<string> {
	const header = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
	const claims = {
		aud: new URL(endpoint).origin,
		exp: Math.floor(nowMs / 1000) + VAPID_EXPIRY_S,
		sub: subject
	};
	const payload = b64urlEncode(enc.encode(JSON.stringify(claims)));
	const key = await crypto.subtle.importKey(
		'jwk',
		privateJwk(keys),
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['sign']
	);
	// WebCrypto returns the raw `r || s` (64 bytes) — exactly the JWS ES256 encoding.
	const sig = await crypto.subtle.sign(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		enc.encode(`${header}.${payload}`)
	);
	return `vapid t=${header}.${payload}.${b64urlEncode(new Uint8Array(sig))}, k=${keys.publicKey}`;
}

async function hkdf(
	salt: Uint8Array<ArrayBuffer>,
	ikm: Uint8Array<ArrayBuffer>,
	info: Uint8Array<ArrayBuffer>,
	bytes: number
): Promise<Uint8Array<ArrayBuffer>> {
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'HKDF', hash: 'SHA-256', salt, info },
		key,
		bytes * 8
	);
	return new Uint8Array(bits);
}

/** Record size announced in the header; a push message is a single record. */
const RECORD_SIZE = 4096;
/** Largest plaintext that fits one record (4096 − 16 tag − 1 delimiter). */
export const MAX_PLAINTEXT = RECORD_SIZE - 17;

export interface EncryptOptions {
	/** Fixed salt / server key pair — test vectors only; random by default. */
	salt?: Uint8Array<ArrayBuffer>;
	serverKeys?: KeyPair;
}

/**
 * Encrypt a push message for a subscription (`p256dh` = the browser's public key, `auth` =
 * its 16-byte secret) → the request body: `salt(16) ‖ rs(4) ‖ idlen(1) ‖ keyid(65) ‖
 * ciphertext` (RFC 8291 §3.4 + RFC 8188 §2.1).
 */
export async function encryptPayload(
	plaintext: Uint8Array,
	p256dh: string,
	auth: string,
	opts: EncryptOptions = {}
): Promise<Uint8Array<ArrayBuffer>> {
	if (plaintext.length > MAX_PLAINTEXT) throw new Error('push payload too large');
	const uaPublic = b64urlDecode(p256dh);
	const authSecret = b64urlDecode(auth);
	if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('invalid p256dh key');
	if (authSecret.length !== 16) throw new Error('invalid auth secret');

	const server = opts.serverKeys ?? (await generateEcdhKeys());
	const asPublic = b64urlDecode(server.publicKey);
	const asPrivate = await crypto.subtle.importKey(
		'jwk',
		privateJwk(server),
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		['deriveBits']
	);
	const peer = await crypto.subtle.importKey(
		'raw',
		uaPublic,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	const ecdhSecret = new Uint8Array(
		await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, asPrivate, 256)
	);

	const keyInfo = concat(enc.encode('WebPush: info\0'), uaPublic, asPublic);
	const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
	const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
	const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

	const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
	const record = concat(plaintext, new Uint8Array([2])); // last-record delimiter, no padding
	const ciphertext = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record)
	);

	const header = new Uint8Array(21);
	header.set(salt, 0);
	new DataView(header.buffer).setUint32(16, RECORD_SIZE);
	header[20] = asPublic.length;
	return concat(header, asPublic, ciphertext);
}

/** A fresh ephemeral ECDH key pair for one message. */
async function generateEcdhKeys(): Promise<KeyPair> {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits'
	])) as CryptoKeyPair;
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
	const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
	return { publicKey: b64urlEncode(raw), privateKey: jwk.d! };
}
