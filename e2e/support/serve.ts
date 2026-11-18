/**
 * Entry point of an app server under test (Bun): optionally resets its database, then runs
 * the production build in this process. Configured purely through the environment
 * (`serverEnv()` + `E2E_RESET_DB=<name>`), so Playwright's `webServer` and the specs that
 * need a server of their own (PWA offline, Tauri) start it the same way.
 */
import { existsSync } from 'node:fs';
import { ROOT } from './env.ts';
import { resetDatabase } from './db-reset.ts';

const entry = `${ROOT}build/index.js`;
if (!existsSync(entry)) {
	console.error('[e2e] build/index.js is missing — run `bun run build` first');
	process.exit(1);
}
const reset = process.env.E2E_RESET_DB;
if (reset) await resetDatabase(reset);
await import(entry);
