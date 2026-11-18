import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import type { RequestHandler } from './$types';

/** Liveness + DB connectivity check (used by the Docker healthcheck). */
export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`select 1`);
		return json({ ok: true, db: 'up' });
	} catch (err) {
		console.error('[health] database check failed', err);
		return json({ ok: false, db: 'down' }, { status: 503 });
	}
};
