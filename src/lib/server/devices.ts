/**
 * Devices & pairing — data access. Pure rules live in `#lib/auth.ts`, crypto in `tokens.ts`.
 */
import { and, asc, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import {
	PAIRING_CODE_TTL_MS,
	PAIRING_MAX_ATTEMPTS,
	codeStatus,
	normalizeCode,
	touchPlan,
	type AuthDevice,
	type CodeStatus,
	type DeviceKind
} from '#lib/auth.ts';
import { db } from './db/index.ts';
import { devices, pairingCodes, type Device } from './db/schema.ts';
import { closeDeviceStreams } from './device-streams.ts';
import { generatePairingCode, generateToken, sha256Hex } from './tokens.ts';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface NewDeviceInput {
	name: string;
	kind: DeviceKind;
	userAgent: string | null;
}

const authFields = {
	id: devices.id,
	name: devices.name,
	kind: devices.kind,
	lastSeenAt: devices.lastSeenAt,
	cookieRenewedAt: devices.cookieRenewedAt
};

// ─── Request auth ───────────────────────────────────────────────────────────

/** Last `last_seen_at` write per device in this process (avoids racing duplicate updates). */
const lastTouch = new Map<string, number>();

/**
 * The active (non-revoked) device for a token — one lookup on the unique `token_hash`
 * index. Updates `last_seen_at` (≤ 1/min) in the background and reports whether the
 * cookie should be re-issued (≤ 1/day).
 */
export async function authenticate(
	token: string,
	viaCookie: boolean,
	now = new Date()
): Promise<{ device: AuthDevice; renewCookie: boolean } | null> {
	const [row] = await db
		.select(authFields)
		.from(devices)
		.where(and(eq(devices.tokenHash, sha256Hex(token)), isNull(devices.revokedAt)))
		.limit(1);
	if (!row) return null;

	const plan = touchPlan(row, now, viaCookie);
	const recent = now.getTime() - (lastTouch.get(row.id) ?? 0) < 60_000;
	if (plan.renew || (plan.seen && !recent)) {
		lastTouch.set(row.id, now.getTime());
		db.update(devices)
			.set(plan.renew ? { lastSeenAt: now, cookieRenewedAt: now } : { lastSeenAt: now })
			.where(eq(devices.id, row.id))
			.catch((err) => console.error('[auth] last_seen update failed', err));
	}
	return { device: { id: row.id, name: row.name, kind: row.kind }, renewCookie: plan.renew };
}

export async function isDeviceActive(id: string): Promise<boolean> {
	const [row] = await db
		.select({ id: devices.id })
		.from(devices)
		.where(and(eq(devices.id, id), isNull(devices.revokedAt)))
		.limit(1);
	return !!row;
}

export async function countActiveDevices(): Promise<number> {
	const [row] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(devices)
		.where(isNull(devices.revokedAt));
	return row?.n ?? 0;
}

// ─── Devices ────────────────────────────────────────────────────────────────

async function insertDevice(
	tx: Tx | typeof db,
	input: NewDeviceInput,
	now: Date
): Promise<{ device: Device; token: string }> {
	const token = generateToken();
	const [device] = await tx
		.insert(devices)
		.values({
			tokenHash: sha256Hex(token),
			name: input.name,
			kind: input.kind,
			userAgent: input.userAgent?.slice(0, 400) ?? null,
			pairedAt: now,
			lastSeenAt: now,
			cookieRenewedAt: now
		})
		.returning();
	return { device, token };
}

/** Pair a device with the setup secret (the caller has checked it). */
export function createDevice(input: NewDeviceInput, now = new Date()) {
	return insertDevice(db, input, now);
}

export type DeviceRow = Pick<
	Device,
	'id' | 'name' | 'kind' | 'userAgent' | 'pairedAt' | 'lastSeenAt'
>;

/** Active devices, most recently seen first. */
export function listDevices(): Promise<DeviceRow[]> {
	return db
		.select({
			id: devices.id,
			name: devices.name,
			kind: devices.kind,
			userAgent: devices.userAgent,
			pairedAt: devices.pairedAt,
			lastSeenAt: devices.lastSeenAt
		})
		.from(devices)
		.where(isNull(devices.revokedAt))
		.orderBy(sql`${devices.lastSeenAt} DESC NULLS LAST`, asc(devices.pairedAt));
}

export async function renameDevice(id: string, name: string): Promise<boolean> {
	const rows = await db
		.update(devices)
		.set({ name })
		.where(and(eq(devices.id, id), isNull(devices.revokedAt)))
		.returning({ id: devices.id });
	return rows.length > 0;
}

/** Revoke a device: its token stops working, open streams close, its codes expire. */
export async function revokeDevice(id: string, now = new Date()): Promise<boolean> {
	const rows = await db.transaction(async (tx) => {
		const revoked = await tx
			.update(devices)
			.set({ revokedAt: now })
			.where(and(eq(devices.id, id), isNull(devices.revokedAt)))
			.returning({ id: devices.id });
		await tx
			.update(pairingCodes)
			.set({ expiresAt: now })
			.where(
				and(
					eq(pairingCodes.createdByDeviceId, id),
					isNull(pairingCodes.usedAt),
					gt(pairingCodes.expiresAt, now)
				)
			);
		return revoked;
	});
	lastTouch.delete(id);
	if (rows.length > 0) closeDeviceStreams(id);
	return rows.length > 0;
}

// ─── Pairing codes ──────────────────────────────────────────────────────────

export interface IssuedCode {
	id: string;
	code: string;
	expiresAt: Date;
}

/**
 * A new 6-digit code for pairing another device. Earlier unused codes of the same device
 * are invalidated (only the one on screen works); codes older than a day are deleted.
 */
export async function createPairingCode(byDeviceId: string, now = new Date()): Promise<IssuedCode> {
	return db.transaction(async (tx) => {
		await tx
			.delete(pairingCodes)
			.where(lt(pairingCodes.createdAt, new Date(now.getTime() - 24 * 3600_000)));
		await tx
			.update(pairingCodes)
			.set({ expiresAt: now })
			.where(
				and(
					eq(pairingCodes.createdByDeviceId, byDeviceId),
					isNull(pairingCodes.usedAt),
					gt(pairingCodes.expiresAt, now)
				)
			);
		const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS);
		for (let i = 0; ; i++) {
			const code = generatePairingCode();
			const codeHash = sha256Hex(code);
			// Two live codes must never share digits (vanishingly rare; retry).
			const [clash] = await tx
				.select({ id: pairingCodes.id })
				.from(pairingCodes)
				.where(
					and(
						eq(pairingCodes.codeHash, codeHash),
						isNull(pairingCodes.usedAt),
						gt(pairingCodes.expiresAt, now)
					)
				)
				.limit(1);
			if (clash && i < 5) continue;
			const [row] = await tx
				.insert(pairingCodes)
				.values({ codeHash, expiresAt, createdByDeviceId: byDeviceId, createdAt: now })
				.returning({ id: pairingCodes.id });
			return { id: row.id, code, expiresAt };
		}
	});
}

export interface CodeInfo {
	status: CodeStatus;
	expiresAt: Date;
	/** Name of the device paired with the code (status `used`). */
	deviceName: string | null;
}

/** Status of a code issued by `byDeviceId` (the pairing dialog polls this). */
export async function pairingCodeInfo(
	id: string,
	byDeviceId: string,
	now = new Date()
): Promise<CodeInfo | null> {
	const [row] = await db
		.select({
			expiresAt: pairingCodes.expiresAt,
			usedAt: pairingCodes.usedAt,
			attempts: pairingCodes.attempts,
			deviceName: devices.name
		})
		.from(pairingCodes)
		.leftJoin(devices, eq(devices.id, pairingCodes.deviceId))
		.where(and(eq(pairingCodes.id, id), eq(pairingCodes.createdByDeviceId, byDeviceId)));
	if (!row) return null;
	return { status: codeStatus(row, now), expiresAt: row.expiresAt, deviceName: row.deviceName };
}

export type PairResult =
	| { ok: true; token: string; device: Device }
	| { ok: false; reason: 'format' | 'wrong' | Exclude<CodeStatus, 'active'> };

/**
 * Redeem a pairing code. A guess that matches no live code counts as a wrong attempt
 * against *every* live code (we can't know which one was meant); a code with
 * {@link PAIRING_MAX_ATTEMPTS} wrong attempts is dead.
 */
export async function pairWithCode(
	rawCode: unknown,
	input: NewDeviceInput,
	now = new Date()
): Promise<PairResult> {
	const code = normalizeCode(rawCode);
	if (!code) return { ok: false, reason: 'format' };
	const codeHash = sha256Hex(code);

	return db.transaction(async (tx): Promise<PairResult> => {
		const candidates = await tx
			.select()
			.from(pairingCodes)
			.where(eq(pairingCodes.codeHash, codeHash))
			.orderBy(sql`${pairingCodes.createdAt} DESC`)
			.for('update');
		const match = candidates.find((c) => codeStatus(c, now) === 'active');

		if (!match) {
			const live = await tx
				.select({ id: pairingCodes.id })
				.from(pairingCodes)
				.where(
					and(
						isNull(pairingCodes.usedAt),
						gt(pairingCodes.expiresAt, now),
						lt(pairingCodes.attempts, PAIRING_MAX_ATTEMPTS)
					)
				)
				.for('update');
			if (candidates.length === 0 && live.length > 0) {
				await tx
					.update(pairingCodes)
					.set({ attempts: sql`${pairingCodes.attempts} + 1` })
					.where(
						inArray(
							pairingCodes.id,
							live.map((c) => c.id)
						)
					);
			}
			// Report why a code that did exist can't be used (expired is the common case).
			const latest = candidates[0];
			return { ok: false, reason: latest ? codeStatus(latest, now) : 'wrong' } as PairResult;
		}

		const { device, token } = await insertDevice(tx, input, now);
		await tx
			.update(pairingCodes)
			.set({ usedAt: now, deviceId: device.id })
			.where(eq(pairingCodes.id, match.id));
		return { ok: true, token, device };
	});
}

/** Human message for a failed pairing. */
export function pairErrorMessage(reason: Exclude<PairResult, { ok: true }>['reason']): string {
	switch (reason) {
		case 'format':
			return 'Enter the 6-digit code shown on your other device.';
		case 'expired':
			return 'This code has expired. Generate a new one on your other device.';
		case 'used':
			return 'This code was already used. Generate a new one on your other device.';
		case 'locked':
			return 'Too many wrong attempts for this code. Generate a new one on your other device.';
		case 'wrong':
			return 'Wrong code. Check the code on your other device and try again.';
	}
}
