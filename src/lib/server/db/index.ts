import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from '$app/env/private';
import * as schema from './schema.ts';

/** Single shared connection pool. postgres.js connects lazily on the first query. */
const client = postgres(DATABASE_URL, { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
