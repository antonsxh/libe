/**
 * Crypto helpers for device auth (no DB access, so they are unit-testable).
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { PAIRING_CODE_DIGITS } from '#lib/auth.ts';

/** A new device token: 32 random bytes, base64url (43 chars). */
export function generateToken(): string {
	return randomBytes(32).toString('base64url');
}

/** SHA-256 hex — what the database stores for tokens and pairing codes. */
export function sha256Hex(value: string): string {
	return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** A uniformly random pairing code with leading zeros, e.g. "048213". */
export function generatePairingCode(): string {
	return String(randomInt(0, 10 ** PAIRING_CODE_DIGITS)).padStart(PAIRING_CODE_DIGITS, '0');
}

/**
 * Constant-time string comparison (for the setup secret). Both sides are hashed first so
 * neither the content nor the length leaks through timing.
 */
export function secretsEqual(a: string, b: string): boolean {
	const ha = createHash('sha256').update(a, 'utf8').digest();
	const hb = createHash('sha256').update(b, 'utf8').digest();
	return timingSafeEqual(ha, hb) && a.length === b.length;
}
