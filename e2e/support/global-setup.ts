/**
 * Runs once after the web server is up (its start command reset + seeded `libe_e2e`):
 * pairs one device through `/setup` and stores it as the default `storageState`. Specs about
 * auth create their own contexts/devices.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { BASE, STATE_FILE, TOKEN_FILE } from './env.ts';
import { pairWithSecret, storageStateFor } from './auth.ts';

export default async function globalSetup(): Promise<void> {
	const token = await pairWithSecret(BASE, { name: 'e2e browser' });
	mkdirSync(dirname(STATE_FILE), { recursive: true });
	writeFileSync(STATE_FILE, JSON.stringify(storageStateFor(BASE, token)));
	writeFileSync(TOKEN_FILE, token);
}
