/**
 * Shared constants of the e2e suite. The app under test is the production build
 * (`build/index.js`) on its own port, backed by its own database on the dev Postgres —
 * the dev database `libe` is never touched.
 */
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Ignored artefacts: traces, screenshots, auth state, temp dirs. */
export const OUTPUT = `${ROOT}e2e/.output`;

const PG = process.env.E2E_PG_URL ?? 'postgres://libe:libe@127.0.0.1:54330';
/** Maintenance DB used to drop/create the e2e databases. */
export const PG_ADMIN_URL = `${PG}/postgres`;
export const dbUrl = (name: string) => `${PG}/${name}`;

/** Main suite (`bun run test:e2e`). */
export const E2E_DB = 'libe_e2e';
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3124);
export const BASE = `http://127.0.0.1:${E2E_PORT}`;

export const SETUP_SECRET = 'e2e-setup-secret-0123';

/**
 * The fake push service of `push.spec.ts` (a local HTTP server). App servers allow push
 * subscriptions to this origin besides the real push services (`LIBE_PUSH_TEST_ENDPOINT_ORIGIN`).
 */
export const FAKE_PUSH_PORT = Number(process.env.E2E_FAKE_PUSH_PORT ?? 3129);
export const FAKE_PUSH_ORIGIN = `http://127.0.0.1:${FAKE_PUSH_PORT}`;
export const TIME_ZONE = 'Europe/Berlin';
export const COOKIE = 'libe_device';

/** Where global setup stores the paired device (storageState + raw token). */
export const STATE_FILE = `${OUTPUT}/state/device.json`;
export const TOKEN_FILE = `${OUTPUT}/state/token.txt`;

/**
 * Environment of an app server instance. `ADDRESS_HEADER`/`XFF_DEPTH` mirror the HTTPS proxy
 * deployment (compose.caddy.yaml): tests that exercise the per-IP rate limits send their own
 * `X-Forwarded-For`, so they never exhaust each other's (or the browser's) budget.
 */
export function serverEnv(port: number, db: string): Record<string, string> {
	return {
		DATABASE_URL: dbUrl(db),
		LIBE_SETUP_SECRET: SETUP_SECRET,
		ORIGIN: `http://127.0.0.1:${port}`,
		PORT: String(port),
		HOST: '127.0.0.1',
		TZ: TIME_ZONE,
		ADDRESS_HEADER: 'x-forwarded-for',
		XFF_DEPTH: '1',
		LIBE_PUSH_TEST_ENDPOINT_ORIGIN: FAKE_PUSH_ORIGIN
	};
}
