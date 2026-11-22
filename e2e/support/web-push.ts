/**
 * The browser's half of Web Push, for tests: a subscription key pair, decryption of an
 * `aes128gcm` push message (RFC 8291 / RFC 8188) and a check of the VAPID header (RFC 8292).
 * Written independently of the app's `push-crypto.ts` (WebCrypto only, no Playwright
 * imports) so the unit tests can use it too.
 */

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64url');
}
function unb64url(value: string): Uint8Array<ArrayBuffer> {
	return new Uint8Array(Buffer.from(value, 'base64url'));
}

export interface SubscriptionKeys {
	/** base64url public key, as `PushSubscription.toJSON().keys.p256dh`. */
	p256dh: string;
	/** base64url 16-byte secret, as `keys.auth`. */
	auth: string;
	privateKey: CryptoKey;
}

export async function subscriptionKeys(): Promise<SubscriptionKeys> {
	const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
		'deriveBits'
	])) as CryptoKeyPair;
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
	return {
		p256dh: b64url(raw),
		auth: b64url(crypto.getRandomValues(new Uint8Array(16))),
		privateKey: pair.privateKey
	};
}

/** Import a raw private scalar (+ its public point) as an ECDH key — for RFC test vectors. */
export async function importEcdhPrivate(publicKey: string, d: string): Promise<CryptoKey> {
	const pub = unb64url(publicKey);
	return crypto.subtle.importKey(
		'jwk',
		{
			kty: 'EC',
			crv: 'P-256',
			x: b64url(pub.subarray(1, 33)),
			y: b64url(pub.subarray(33, 65)),
			d
		},
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		['deriveBits']
	);
}

async function hkdf(
	salt: Uint8Array<ArrayBuffer>,
	ikm: Uint8Array<ArrayBuffer>,
	info: Uint8Array<ArrayBuffer>,
	bytes: number
) {
	const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
	return new Uint8Array(
		await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8)
	);
}

const cat = (...parts: Uint8Array[]) => {
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let at = 0;
	for (const p of parts) out.set(p, (at += p.length) - p.length);
	return out;
};

/** Decrypt one `aes128gcm` push body for the subscription `keys` → the plaintext. */
export async function decryptPush(
	body: Uint8Array,
	keys: { p256dh: string; auth: string; privateKey: CryptoKey }
): Promise<string> {
	const salt = body.slice(0, 16);
	const idlen = body[20];
	const asPublic = body.slice(21, 21 + idlen);
	const ciphertext = body.slice(21 + idlen);
	const uaPublic = unb64url(keys.p256dh);
	const peer = await crypto.subtle.importKey(
		'raw',
		asPublic,
		{ name: 'ECDH', namedCurve: 'P-256' },
		false,
		[]
	);
	const secret = new Uint8Array(
		await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, keys.privateKey, 256)
	);
	const ikm = await hkdf(
		unb64url(keys.auth),
		secret,
		cat(enc.encode('WebPush: info\0'), uaPublic, asPublic),
		32
	);
	const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
	const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
	const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
	const record = new Uint8Array(
		await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext)
	);
	// Strip padding: the last non-zero octet is the delimiter (2 = last record).
	let end = record.length - 1;
	while (end >= 0 && record[end] === 0) end--;
	if (record[end] !== 2) throw new Error('missing last-record delimiter');
	return new TextDecoder().decode(record.subarray(0, end));
}

/**
 * Parse and verify `Authorization: vapid t=<JWT>, k=<key>` → the JWT claims and the key.
 * Throws when the format or the ES256 signature is wrong.
 */
export async function verifyVapid(
	header: string
): Promise<{ claims: { aud: string; exp: number; sub: string }; publicKey: string }> {
	const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
	if (!m) throw new Error(`unexpected Authorization header: ${header}`);
	const [, h, p, s, k] = m;
	const jwtHeader = JSON.parse(Buffer.from(h, 'base64url').toString());
	if (jwtHeader.alg !== 'ES256') throw new Error('VAPID JWT is not ES256');
	const key = await crypto.subtle.importKey(
		'raw',
		unb64url(k),
		{ name: 'ECDSA', namedCurve: 'P-256' },
		false,
		['verify']
	);
	const ok = await crypto.subtle.verify(
		{ name: 'ECDSA', hash: 'SHA-256' },
		key,
		unb64url(s),
		enc.encode(`${h}.${p}`)
	);
	if (!ok) throw new Error('VAPID signature does not verify');
	return { claims: JSON.parse(Buffer.from(p, 'base64url').toString()), publicKey: k };
}
