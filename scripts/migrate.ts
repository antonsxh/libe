/**
 * Applies pending Drizzle migrations from ./drizzle.
 * Runs before the server starts (see `bun run start` / Dockerfile) and via `bun run db:migrate`.
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => {} });
try {
	await migrate(drizzle(client), {
		migrationsFolder: new URL('../drizzle', import.meta.url).pathname
	});
	console.log('[migrate] database is up to date');
} catch (err) {
	console.error('[migrate] failed:', err);
	process.exitCode = 1;
} finally {
	await client.end();
}
