import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'Postgres connection string, e.g. postgres://libe:libe@localhost:5432/libe'
	}
});
