import { defineEnvVars } from '@sveltejs/kit/env';

/** Keep in sync with `SETUP_SECRET_MIN` in `#lib/auth.ts`. */
const SETUP_SECRET_MIN = 12;

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Postgres connection string, e.g. postgres://libe:libe@localhost:5432/libe',
		// Optional here because `vite build` evaluates the env without a database (Docker/CI);
		// `#lib/server/db/index.ts` refuses to start the server without it.
		schema: (value) => value?.trim() || undefined
	},
	LIBE_SETUP_SECRET: {
		description:
			'Secret that pairs a device on /setup (bootstrap + recovery). Long and random, e.g. `openssl rand -base64 24`. Unset = /setup disabled.',
		schema: (value) => {
			const secret = value?.trim();
			if (!secret) return undefined;
			if (secret.length < SETUP_SECRET_MIN)
				throw new Error(
					`LIBE_SETUP_SECRET must be at least ${SETUP_SECRET_MIN} characters (try: openssl rand -base64 24)`
				);
			return secret;
		}
	},
	LIBE_PUSH_TEST_ENDPOINT_ORIGIN: {
		description:
			'Tests only (e2e): one extra origin push subscriptions may point to, besides the known push services — e.g. http://127.0.0.1:3129 for a fake push endpoint. Loopback only. Leave unset in production.',
		schema: (value) => {
			const raw = value?.trim();
			if (!raw) return undefined;
			let url: URL;
			try {
				url = new URL(raw);
			} catch {
				throw new Error(
					'LIBE_PUSH_TEST_ENDPOINT_ORIGIN must be an origin like http://127.0.0.1:3129'
				);
			}
			if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
				throw new Error('LIBE_PUSH_TEST_ENDPOINT_ORIGIN must be a loopback origin (tests only)');
			return url.origin;
		}
	}
});
