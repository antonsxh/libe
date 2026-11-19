import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { building } from '$app/env';
import { DATABASE_URL } from '$app/env/private';
import * as schema from './schema.ts';

if (!DATABASE_URL && !building) {
	throw new Error('DATABASE_URL is not set (e.g. postgres://libe:libe@localhost:5432/libe)');
}

/**
 * Single shared connection pool. postgres.js connects lazily on the first query, so the
 * placeholder used while `vite build` analyses the routes never opens a connection.
 */
const client = postgres(DATABASE_URL ?? 'postgres://build-time-placeholder', { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
