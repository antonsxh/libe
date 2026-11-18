/**
 * Tauri desktop app e2e (`bun run test:tauri`): drives the debug build through tauri-driver +
 * WebKitWebDriver under Xvfb (the script wraps this in `xvfb-run`). No Playwright browsers —
 * Playwright is only the runner. The spec starts its own app server on its own database.
 */
import { defineConfig } from '@playwright/test';
import { OUTPUT } from '../support/env.ts';

export default defineConfig({
	testDir: '.',
	testMatch: '*.spec.ts',
	outputDir: `${OUTPUT}/tauri-results`,
	workers: 1,
	retries: 0,
	timeout: 120_000,
	expect: { timeout: 20_000 },
	reporter: [['list']]
});
