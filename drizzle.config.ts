import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://libe:libe@localhost:5432/libe' },
	verbose: true,
	strict: true
});
