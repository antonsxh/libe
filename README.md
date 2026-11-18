<img src="assets/icon.svg" width="64" height="64" alt="">

# libe

A calm, dark planner that ties every hour to a few quests.
SvelteKit 3 · Svelte 5 · Bun · Drizzle + Postgres · Docker Compose · (Tauri 2 shell later).

## Run with Docker

```sh
docker compose up --build
# → http://localhost:3000   (migrations run automatically on start)
```

Env overrides: `POSTGRES_PASSWORD`, `LIBE_PORT`, `LIBE_ORIGIN`, `TZ`.

## Develop

```sh
bun install
cp .env.example .env
docker compose up -d db
bun run db:migrate
bun run dev
```

See [AGENTS.md](AGENTS.md) for conventions and [docs/ROADMAP.md](docs/ROADMAP.md) for the plan.
