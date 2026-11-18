/**
 * (Re)creates an e2e database on the dev Postgres: drop → create → migrate → seed.
 * Refuses any name outside `libe_e2e*`, so it can never touch the dev database `libe`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { PG_ADMIN_URL, ROOT, TIME_ZONE, dbUrl } from './env.ts';

/** The Bun binary (the seed script and the server are Bun programs). */
export function bunBin(): string {
	if (process.versions.bun) return process.execPath;
	const local = `${homedir()}/.bun/bin/bun`;
	return existsSync(local) ? local : 'bun';
}

export async function resetDatabase(name: string, opts: { seed?: boolean } = {}): Promise<void> {
	if (!/^libe_e2e(_[a-z0-9]+)?$/.test(name))
		throw new Error(`refusing to reset database "${name}"`);
	const admin = postgres(PG_ADMIN_URL, { max: 1, onnotice: () => {} });
	try {
		await admin`select pg_terminate_backend(pid) from pg_stat_activity
			where datname = ${name} and pid <> pg_backend_pid()`;
		await admin.unsafe(`drop database if exists "${name}"`);
		await admin.unsafe(`create database "${name}"`);
	} finally {
		await admin.end();
	}

	const client = postgres(dbUrl(name), { max: 1, onnotice: () => {} });
	try {
		await migrate(drizzle(client), { migrationsFolder: `${ROOT}drizzle` });
	} finally {
		await client.end();
	}

	if (opts.seed === false) return;
	const seed = spawnSync(bunBin(), ['scripts/seed.ts'], {
		cwd: ROOT,
		env: { ...process.env, DATABASE_URL: dbUrl(name), TZ: TIME_ZONE },
		encoding: 'utf8'
	});
	if (seed.status !== 0) throw new Error(`seed failed:\n${seed.stdout}\n${seed.stderr}`);
}
