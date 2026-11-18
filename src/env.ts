import { defineEnvVars } from '@sveltejs/kit/env';

/** Keep in sync with `SETUP_SECRET_MIN` in `#lib/auth.ts`. */
const SETUP_SECRET_MIN = 12;

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Postgres connection string, e.g. postgres://libe:libe@localhost:5432/libe'
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
	}
});
