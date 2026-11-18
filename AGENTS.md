# libe — agent guide

Personal quest/time planner. Read this file fully before changing code. The milestone plan and
data model live in [`docs/ROADMAP.md`](docs/ROADMAP.md); reference screenshots in
[`docs/reference/`](docs/reference/) are the visual blueprint (match layout, spacing and colours,
but use the name **libe** and our own logo — never "Quest" branding).

## Stack

- **Svelte 5 with runes only** (`$state`, `$derived`, `$effect`, `$props`). No legacy `export let`,
  no `$:`; avoid stores unless a value must cross unrelated components.
- **SvelteKit 3** (see "Kit 3 differences" below), adapter-node, run with **Bun**.
- **Drizzle ORM + Postgres** (postgres.js driver). Schema: `src/lib/server/db/schema.ts`.
- **Docker Compose**: `compose.yaml` (app + Postgres 17).
- **No Tailwind, no shadcn, no UI kit.** Design tokens are CSS custom properties in
  `src/lib/styles/tokens.css`; components use Svelte-scoped `<style>`. Icons: `@lucide/svelte`.
- Later: Tauri 2 as a thin client shell (M7). The server is the single source of truth.

## Commands

Bun lives in `~/.bun/bin` — run `export PATH=$HOME/.bun/bin:$PATH` first if `bun` is not found.

| Command               | What                                              |
| --------------------- | ------------------------------------------------- |
| `bun install`         | install deps                                      |
| `bun run dev`         | dev server (needs `DATABASE_URL`, see `.env`)     |
| `bun run check`       | svelte-check / TypeScript — **must be 0 errors**  |
| `bun run test`        | unit tests (`bun test`, files `src/**/*.test.ts`) |
| `bun run lint`        | prettier check (`bun run format` to fix)          |
| `bun run build`       | production build into `build/`                    |
| `bun run db:generate` | create a SQL migration from `schema.ts` changes   |
| `bun run db:migrate`  | apply migrations (`scripts/migrate.ts`)           |
| `bun run db:seed`     | demo data (only if `quests` is empty)             |
| `bun run db:dev`      | local Postgres 17 without Docker (see below)      |
| `docker compose up`   | full stack on http://localhost:3000               |

### Database without Docker

This dev machine has no Docker. `scripts/dev-db.sh` runs a **real Postgres 17** from prebuilt
binaries (installed once into `~/.cache/libe-pg`, Linux x64):

```sh
bun run db:dev            # = scripts/dev-db.sh start  (stop | status | reset)
export DATABASE_URL=postgres://libe:libe@127.0.0.1:54330/libe
bun run db:migrate && bun run db:seed && bun run dev
```

Do **not** use PGlite / pglite-socket as the dev database: it shares one session across all
connections and blocks them during a transaction. postgres.js loads enum type info lazily over a
second connection, so any transaction whose first enum parameter is new deadlocks (hangs ~60 s,
then `CONNECTION_CLOSED`). That is a PGlite artefact, not an app bug.

## Kit 3 differences (important — training data is mostly Kit 2)

- Kit config lives in **`vite.config.ts`** inside `sveltekit({...})`. There is no `svelte.config.js`.
- Use **`#lib/...` subpath imports with explicit file extensions**:
  `import { db } from '#lib/server/db/index.ts'`, `import Button from '#lib/components/Button.svelte'`.
  Do **not** use `$lib`. Relative imports also need extensions (`'./schema.ts'`).
- Env vars are declared in **`src/env.ts`** via `defineEnvVars` and imported from
  **`$app/env/private`** / `$app/env/public`. Add new vars there.
- `browser`, `dev`, `building` come from **`$app/env`**. Page state from **`$app/state`** (`page.url`, …).
- Generated types: `import type { PageProps, PageServerLoad, Actions } from './$types'`.

## Code conventions

- **Server is the source of truth.** Read in `+page.server.ts` `load`, write via **form actions**
  (progressive enhancement with `use:enhance`) or JSON endpoints under `src/routes/api/**`
  (needed for SSE/Tauri). Validate all input on the server. No client-side DB or local-only state for data.
- Server-only code goes in `src/lib/server/**`. Put data access for a feature in
  `src/lib/server/<feature>.ts` (e.g. `quests.ts`) rather than inline in routes.
- **Days** are ISO strings `YYYY-MM-DD` (`date` columns). Use helpers in `src/lib/dates.ts`
  (`todayISO`, `weekDays`, `startOfWeek`, …). Weeks start Monday. Server "today" uses `TZ`.
- Minutes-of-day (`start_min`, `end_min`) are 0‥1440. Timestamps are `timestamptz` → `Date`.
- Ordering: the TS property `order` maps to the column `sort_order`; sort ascending.
- Quest colours: store a key from `QUEST_COLORS` (`src/lib/quest-colors.ts`), render with
  `questColorVar(key)` → `var(--quest-<key>)`. Tasks of kind `other` use `slate`.
- Keep components small; shared ones in `src/lib/components/`, feature-specific ones in
  `src/lib/components/<feature>/`. Use `type Props = {...}; let {...}: Props = $props()`.
- UI copy is English (matches the references). Code and comments in English.

## Styling rules

- Only token variables for colours, spacing, radii, font sizes (`var(--surface)`, `var(--space-4)`…).
  Add a token to `tokens.css` instead of hard-coding a value that repeats.
- Global utilities (`src/lib/styles/global.css`): `.label` (uppercase section label), `.card`,
  `.muted`, `.tabular`, `.hatch` (diagonal hatching tinted by `--q`), `.sr-only`.
- Shared primitives: `Button` (primary/secondary/ghost, sm/md, icon), `QuestPill`, `PageHeader`.
  Look at `/styleguide` in the running app before building new UI.
- Dark theme only. Keep focus rings (`:focus-visible` uses `--ring`). Make layouts work down to ~375px.

## Database changes

1. Edit `src/lib/server/db/schema.ts`.
2. `bun run db:generate --name <short_name>` → commit the new file in `drizzle/` (and `drizzle/meta`).
3. Never edit or delete a migration that is already committed; add a new one.

## Definition of done (every milestone)

- `bun run check` → 0 errors, 0 warnings
- `bun run test` → green (add tests for non-trivial pure logic: date math, timers, ordering, aggregations)
- `bun run lint` → clean
- `bun run build` → succeeds
- Manually exercised against a real DB (`bun run db:dev`): migrations apply on an empty DB, pages
  render (no SSR errors / console errors), mutations persist after reload.
- Update `docs/ROADMAP.md` (status + any decisions) and keep this file accurate.
- Commit with a clear message (`M<n>: …`). Do not commit `.env`.
