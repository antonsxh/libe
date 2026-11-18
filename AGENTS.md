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
- **Tauri 2** thin desktop client in `src-tauri/` (see `docs/TAURI.md`); iPhone/iPad use the
  installable PWA. The server is the single source of truth.

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
| `bun run tauri:dev`   | desktop app (debug); `tauri:build` = installers   |

### Database without Docker

This dev machine has no Docker. `scripts/dev-db.sh` runs a **real Postgres 17** from prebuilt
binaries (installed once into `~/.cache/libe-pg`, Linux x64):

```sh
bun run db:dev            # = scripts/dev-db.sh start  (stop | status | reset)
export DATABASE_URL=postgres://libe:libe@127.0.0.1:54330/libe
bun run db:migrate && bun run db:seed && bun run dev
```

Every page needs a **paired device**: open `/setup` and enter `LIBE_SETUP_SECRET` (in `.env`,
`dev-setup-secret` locally). The seed creates no devices.

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
  **`$app/env/private`** / `$app/env/public`. Add new vars there. Current: `DATABASE_URL`,
  `LIBE_SETUP_SECRET` (≥ 12 chars; unset = `/setup` disabled). adapter-node reads `ORIGIN`,
  `PROTOCOL_HEADER`, `ADDRESS_HEADER`, `XFF_DEPTH`, `PORT`, `HOST` itself.
- Kit 3 CSRF: non-GET requests that are form-encoded **or have no body/content-type** must come
  from the same `Origin`. Client `fetch` mutations send JSON (`content-type: application/json`).
- `browser`, `dev`, `building` come from **`$app/env`**. Page state from **`$app/state`** (`page.url`, …).
- Generated types: `import type { PageProps, PageServerLoad, Actions } from './$types'`.
- **Form submissions land on the action URL minus `/name`** (enhanced _and_ native). A bare
  `action="?/add"` drops the page's query (`?week=`, `?q=`, `?hideDone=`) and navigates away.
  On pages with query state use `action={formAction('add')}` (`#lib/form-action.ts`).
- `goto` options: `{ reset: false }` keeps scroll/focus (no `noScroll`/`keepFocus`), `replace`
  instead of `replaceState`; links use `data-sveltekit-reset="false"`.

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
  Task-list pieces used by Home and Plan live in `components/tasks/` (`DayTaskCard`,
  `TaskAddForm`, `QuestPicker`, `QuestFilter`); their shared form actions (toggle, ↑/↓,
  backlog, delete, `addTaskAction` factory) in `src/lib/server/task-actions.ts`.
- Week navigation (‹ range › + "This week", `?week=`) is the shared `WeekNav.svelte`
  (Calendar, Review); extra controls go in its children snippet.
- `Menu` popovers are `position: fixed` (placed from the trigger rect) so they escape
  scrolling/clipping containers such as the plan board.
- **Routes/layouts**: pages with the top nav live in the route group `src/routes/(app)/`
  (its `+layout.svelte` renders `AppNav` + `<main>`). `/focus` sits outside the group
  (full-screen, no nav). The root layout only loads global CSS, the timer snapshot and the
  app-wide dialogs.
- **Timer**: never compute timer state on the client. Mutations go through
  `POST /api/timer` (`server/timer.ts`); clients render from the snapshot via the pure
  `timerView()` (`#lib/timer.ts`). In components use `useTimer()` (`#lib/timer-store.svelte.ts`,
  context store created in the root layout — not a module singleton, SSR-safe):
  `timer.view`, `timer.command('pause')`, `timer.start({...})`, `timer.logTarget = task`
  (opens "Log time…"). Code that deletes tasks/sessions behind the timer's back must call
  `broadcastTimer()`.
- **Logged time by day**: stats (`stats-core.ts`) and the Review (`#lib/review.ts`) attribute a
  whole session to the day of `started_at`; the Calendar (`#lib/calendar.ts`) draws/totals actual spans, split at midnight.
  Calendar edits/logs go through `/api/sessions` (`POST`, `PATCH /[id]`, `DELETE /[id]`), validated
  by `validateSessionSpan` / `validateManualLog` in `#lib/manual-log.ts` — reuse them, don't
  re-implement the rules.
- Pages hold an open SSE connection, so `networkidle` never fires in browser tests — wait for
  `html[data-timer=live]` (set by the root layout once the stream is connected) instead.
- **Auth** (M7): `hooks.server.ts` sets `event.locals.device` (cookie `libe_device` or
  `Authorization: Bearer`). Routes outside `isPublicPath()` (`#lib/auth.ts`) can rely on
  `locals.device!`; a new public route must be added there (and to its test). Pure rules live
  in `#lib/auth.ts`, crypto in `server/tokens.ts`, data access in `server/devices.ts`.
  Code that revokes devices goes through `revokeDevice()` (closes their SSE streams).
- **Browser tests/scripts must pair first**: `POST /setup` (form fields `secret`, `name`) with
  `Origin` = the app origin returns the `libe_device` cookie; put it into the browser context
  (`storageState`) or send it as `Authorization: Bearer <token>` to the API. `POST /api/devices/codes`
  (Bearer) issues pairing codes for multi-device tests. The rate limit is 10 failed attempts
  per IP and minute (in memory — restart the server to reset).
- **PWA**: the service worker (`src/service-worker/`, production only) must never cache
  `/api/**`, page data or authenticated HTML — only build assets, `static/` files and
  `/offline`. Full-screen/fixed UI must pad with the `--safe-top/right/bottom/left` tokens.
  On touch screens inputs are ≥ 16 px and buttons get ≥ 44 px hit areas automatically
  (`global.css`); give icon-only links `class="hit-target"`; anything that needs hover or
  drag & drop needs a tap/menu equivalent. `Menu` popovers are portalled into `<body>`.
- UI copy is English (matches the references). Code and comments in English.

## Styling rules

- Only token variables for colours, spacing, radii, font sizes (`var(--surface)`, `var(--space-4)`…).
  Add a token to `tokens.css` instead of hard-coding a value that repeats.
- Global utilities (`src/lib/styles/global.css`): `.label` (uppercase section label), `.card`,
  `.muted`, `.tabular`, `.hatch` (diagonal hatching tinted by `--q`), `.sr-only`.
- Charts are plain divs/SVG (no chart library); sizes come from the `--chart-*` tokens and every
  chart needs a text alternative (aria-label or `.sr-only` text).
- Shared primitives: `Button` (primary/secondary/ghost, sm/md, icon), `QuestPill`, `PageHeader`.
  Look at `/styleguide` in the running app before building new UI.
- Dark theme only. Keep focus rings (`:focus-visible` uses `--ring`). Make layouts work down to ~375px.
  Below 720px the nav is a fixed bottom tab bar (`main` already pads for it).
- Static icons are generated from the logo (`static/favicon.svg`); keep `src-tauri/icons/` in sync.

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
