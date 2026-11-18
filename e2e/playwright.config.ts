/**
 * libe end-to-end suite — see AGENTS.md "End-to-end tests".
 *
 *   bun run test:e2e           desktop project (everything except @mobile-only)
 *   bun run test:e2e:mobile    iPhone + iPad emulation (tests tagged @mobile / @mobile-only)
 *
 * One worker: there is one database and at most one active timer.
 */
import { defineConfig, devices } from '@playwright/test';
import {
	BASE,
	E2E_DB,
	E2E_PORT,
	OUTPUT,
	ROOT,
	STATE_FILE,
	TIME_ZONE,
	serverEnv
} from './support/env.ts';

const IOS_UA = (device: string) =>
	`Mozilla/5.0 (${device}; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1`;

export default defineConfig({
	testDir: './specs',
	outputDir: `${OUTPUT}/results`,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	forbidOnly: !!process.env.CI,
	timeout: 45_000,
	expect: { timeout: 7_000 },
	reporter: [['list'], ['html', { outputFolder: `${OUTPUT}/report`, open: 'never' }]],
	globalSetup: './support/global-setup.ts',
	use: {
		baseURL: BASE,
		storageState: STATE_FILE,
		timezoneId: TIME_ZONE,
		locale: 'en-US',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		// The service worker is exercised by pwa.spec.ts only; elsewhere it would just add noise.
		serviceWorkers: 'block'
	},
	webServer: {
		command: 'bun e2e/support/serve.ts',
		cwd: ROOT,
		url: `${BASE}/api/health`,
		env: { ...serverEnv(E2E_PORT, E2E_DB), E2E_RESET_DB: E2E_DB },
		reuseExistingServer: false,
		timeout: 120_000,
		stdout: 'ignore',
		stderr: 'pipe'
	},
	projects: [
		{
			name: 'desktop',
			grepInvert: /@mobile-only/,
			use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } }
		},
		{
			name: 'mobile-iphone',
			grep: /@mobile/,
			use: {
				browserName: 'chromium',
				viewport: { width: 390, height: 844 },
				deviceScaleFactor: 3,
				isMobile: true,
				hasTouch: true,
				userAgent: IOS_UA('iPhone')
			}
		},
		{
			name: 'mobile-ipad',
			grep: /@mobile/,
			use: {
				browserName: 'chromium',
				viewport: { width: 1024, height: 1366 },
				deviceScaleFactor: 2,
				isMobile: true,
				hasTouch: true,
				userAgent: IOS_UA('iPad')
			}
		}
	]
});
