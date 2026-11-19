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
- **Docker Compose**: `compose.yaml` (app + Postgres 17); the app image is published to
  `ghcr.io/antonsxh/libe` by the release pipeline (see "CI and releases").
- **No Tailwind, no shadcn, no UI kit.** Design tokens are CSS custom properties in
  `src/lib/styles/tokens.css`; components use Svelte-scoped `<style>`. Icons: `@lucide/svelte`.
- **Tauri 2** thin desktop client in `src-tauri/` (see `docs/TAURI.md`), auto-updating on a
  Stable/Nightly track (`src-tauri/src/updates.rs`); iPhone/iPad use the installable PWA. The
  server is the single source of truth.

## Commands

Bun lives in `~/.bun/bin` — run `export PATH=$HOME/.bun/bin:$PATH` first if `bun` is not found.

| Command                   | What                                                        |
| ------------------------- | ----------------------------------------------------------- |
| `bun install`             | install deps                                                |
| `bun run dev`             | dev server (needs `DATABASE_URL`, see `.env`)               |
| `bun run check`           | svelte-check / TypeScript — **must be 0 errors**            |
| `bun run test`            | unit tests (`bun test`, `src/**/*.test.ts`, `scripts/`)     |
| `bun run lint`            | prettier check (`bun run format` to fix)                    |
| `bun run build`           | production build into `build/`                              |
| `bun run db:generate`     | create a SQL migration from `schema.ts` changes             |
| `bun run db:migrate`      | apply migrations (`scripts/migrate.ts`)                     |
| `bun run db:seed`         | demo data (only if `quests` is empty)                       |
| `bun run db:dev`          | local Postgres 17 without Docker (see below)                |
| `docker compose up`       | full stack on http://localhost:3000                         |
| `bun run tauri:dev`       | desktop app (debug); `tauri:build` = installers             |
| `bun run test:e2e`        | browser e2e suite, desktop (see "End-to-end tests")         |
| `bun run test:e2e:mobile` | the same suite's `@mobile` tests on iPhone + iPad emulation |
| `bun run test:tauri`      | Tauri app e2e (debug build, tauri-driver, `xvfb-run`; slow) |
| `bun scripts/release.ts`  | release planning / `set-version` (see docs/RELEASING.md)    |

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
  `html[data-timer=live]` (set by the root layout once the stream is connected) instead
  (`gotoLive` / `live` in `e2e/support/fixtures.ts`).
- **Auth** (M7): `hooks.server.ts` sets `event.locals.device` (cookie `libe_device` or
  `Authorization: Bearer`). Routes outside `isPublicPath()` (`#lib/auth.ts`) can rely on
  `locals.device!`; a new public route must be added there (and to its test). Pure rules live
  in `#lib/auth.ts`, crypto in `server/tokens.ts`, data access in `server/devices.ts`.
  Code that revokes devices goes through `revokeDevice()` (closes their SSE streams).
- **Browser tests/scripts must pair first**: `POST /setup` (form fields `secret`, `name`) with
  `Origin` = the app origin returns the `libe_device` cookie; put it into the browser context
  (`storageState`) or send it as `Authorization: Bearer <token>` to the API. `POST /api/devices/codes`
  (Bearer) issues pairing codes for multi-device tests. The rate limit is 10 failed attempts
  per IP and minute (in memory — restart the server to reset); the e2e server runs with
  `ADDRESS_HEADER=x-forwarded-for`, so tests send a fresh `X-Forwarded-For` (`freshIp()`).
- **Desktop app from the server's pages**: only `#lib/desktop.ts` talks to Tauri
  (`desktopApp()` → `null` outside the app). Remote pages may call nothing but the four
  `update_*` commands (runtime capability in `src-tauri/src/lib.rs`); a new command must be
  listed in `src-tauri/build.rs` and granted explicitly. Settings → Desktop app
  (`components/settings/DesktopAppSection.svelte`) is the update UI.
- **PWA**: the service worker (`src/service-worker/`, production only) must never cache
  `/api/**`, page data or authenticated HTML — only build assets, `static/` files and
  `/offline`. Full-screen/fixed UI must pad with the `--safe-top/right/bottom/left` tokens.
  On touch screens inputs are ≥ 16 px and buttons get ≥ 44 px hit areas automatically
  (`global.css`); give icon-only links `class="hit-target"`; anything that needs hover or
  drag & drop needs a tap/menu equivalent. `Menu` popovers are portalled into `<body>`.
- **UI language (i18n)**: English (default) and German, no library. Every user-visible string
  lives in `src/lib/i18n/en.ts` (source of truth, type `Messages`) **and** `de.ts` (typed
  `Messages` — a missing key fails `bun run check`); add new strings to both (German: informal
  „du“, real Umlauts, glossary in `docs/ROADMAP.md`). Components: `const t = useI18n()`
  (`#lib/i18n/context.svelte.ts`) → `t.nav.home`, `t.intl`. Server: `i18n(locals.locale)`
  (`locals.locale` from `hooks.server.ts`: `settings.language`, `auto` → `Accept-Language`).
  Pure modules return error codes (`ErrorCode`) that the action/endpoint translates
  (`t.errors[code]`, `translateErrors`) — never English text. Display dates/numbers via
  `Intl` with `t.intl` (`formatDayLabel(day, opts, t.intl)`, `formatHours(h, t.intl)`); fixed
  `en-US`/`en-CA` formatters are only for machine parsing. Desktop-app texts: `src-tauri/ui/main.js`
  translates Rust `Problem` codes. e2e runs with `locale: 'en-US'` and asserts English; only
  `i18n.spec.ts` switches language (and resets it to `auto`). Code and comments in English.

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

## End-to-end tests

Playwright (`@playwright/test`, pinned) in `e2e/`: config `e2e/playwright.config.ts`, specs per
feature in `e2e/specs/` (quests, home, plan, focus, calendar, review, auth, pwa, pages, mobile,
i18n),
helpers in `e2e/support/`, the Tauri spec in `e2e/tauri/`. Artefacts (traces/screenshots only on
failure, HTML report, auth state) go to the ignored `e2e/.output/`.

- **Isolation**: the suite never touches the dev DB `libe`. Playwright's `webServer` runs
  `e2e/support/serve.ts`, which drops/creates **`libe_e2e`** on the dev Postgres (:54330,
  `bun run db:dev` must be up), migrates, seeds, then serves the **production build**
  (`build/index.js`) on **:3124** with its own `LIBE_SETUP_SECRET`, `ORIGIN`, `TZ=Europe/Berlin`
  and `ADDRESS_HEADER=x-forwarded-for`. Global setup pairs one device via `/setup` and stores
  it as the default `storageState` (token in `e2e/.output/state/`). The Tauri spec uses
  `libe_e2e_tauri` on :3125; the PWA offline test starts a second server on :3126.
  `reset` refuses any database not named `libe_e2e*`.
- **Projects**: `desktop` (1600×1000 Chromium, everything except `@mobile-only`),
  `mobile-iphone` / `mobile-ipad` (`isMobile`, `hasTouch`, iOS UA; only tests whose title
  contains `@mobile` or `@mobile-only`). `workers: 1` — one DB, one active timer.
- **Running**: `bun run test:e2e` builds first (`vite build`), then runs; to iterate without
  rebuilding: `bunx playwright test -c e2e/playwright.config.ts --project=desktop plan` (add
  `-g "<title>"`, `--repeat-each=2`, `--headed`, `--debug`). `bun run test:tauri` also builds
  `src-tauri` (debug) and needs Xvfb, WebKitWebDriver and `~/.cargo/bin/tauri-driver`.
- **Fixtures** (`e2e/support/fixtures.ts`): `sql` (postgres.js on `libe_e2e`), `api`
  (Bearer-authenticated request context), `token`, and an automatic `console` guard that fails
  a test on any browser console error/uncaught exception — expected ones are allowed
  explicitly (`console.allow(/status of 400/)`); extra contexts are watched with
  `console.watch(ctx)`. Helpers: `gotoLive`, `reloadLive` (waits until no page data is in
  flight), `actionDone(page, 'name')` (form action answered **and** page data reloaded —
  create it before the click), `timerCmd` / `discardTimer`, `expectNoHorizontalScroll`.
  `e2e/support/db.ts`: `createQuest/createTask/createSession` (wall times converted by
  Postgres in `Europe/Berlin`), `today`, `emptyPastWeek`, `loggedMinutes`, `uid()`.

**Adding a test** — rules (the suite is meant to stay small and trustworthy):

1. Assert behaviour a plausible code change could break: state **after a reload**, the DB
   row (`sql`), propagation to another page/tab, validation boundaries, ordering, permissions.
   Never assert static markup, constants, or values the test typed without a server round-trip;
   "the page loads" belongs only in `pages.spec.ts` (one test per page).
2. Create your own data with unique names (`uid()`), or read seed data without changing it.
   Never depend on test order or on another test's leftovers (`--repeat-each=2` must pass).
   Global state (the timer, pomodoro settings) is reset in `beforeEach`/`afterEach`.
3. No fixed sleeps: Playwright's auto-waiting `expect`, `expect.poll` (DB), `actionDone`.
   Shift time in the DB (`started_at - interval '…'`) instead of waiting for it.
4. Don't re-test pure logic the unit tests cover (`src/**/*.test.ts`) — test its integration.
   No pixel/screenshot comparisons.
5. When a test guards a bug, check that it fails with the bug reintroduced (temporarily —
   never commit the mutation), and that it passes again afterwards.

## CI and releases

GitHub Actions (`.github/workflows/`), runbook in [`docs/RELEASING.md`](docs/RELEASING.md).
`ci.yml` runs `checks.yml` (check/lint/unit/build, e2e desktop + iPhone/iPad against a Postgres
service on :54330, Tauri clippy + e2e) and `docker.yml` (amd64 + arm64 image build + smoke test)
on every PR and push to `main`. `release.yml` publishes **nightly** (hourly check: `main` moved and
the last nightly is ≥ 6 h old), **preview** (manual, any branch, draft) and **stable** (manual
promotion of the latest nightly, or a `vX.Y.Z` tag): GitHub release with desktop installers +
`ghcr.io/antonsxh/libe` tags (`nightly` / `stable`, `latest`, versions).

- Versions: `package.json` = last stable release; `scripts/release.ts set-version` keeps
  `src-tauri/tauri.conf.json`, `Cargo.toml` and `Cargo.lock` equal — never bump by hand.
  Release logic lives in `scripts/release.ts` (unit tests next to it; `bun run test` covers `scripts/`).
- `vite build` must work **without** `.env` (Docker, CI): env vars read at build time need a
  schema that allows `undefined`; enforce them at runtime instead (see `DATABASE_URL` in
  `src/env.ts` / `#lib/server/db/index.ts`). Bun auto-loads `.env` from the cwd, so test that
  from a clean checkout.
- Bun's version is pinned by `packageManager` in `package.json` (used by CI); keep the
  Dockerfile's `oven/bun` tag on the same minor. Actions are pinned by commit SHA.
- Validate workflow edits with `actionlint` before pushing.
- CI time goes mostly to apt mirror downloads, not builds: the Tauri job caches its `.deb`s
  (`~/apt-archives`), the e2e job installs no system packages (the runner image has Chromium's
  libraries). Rust and Docker layer caches are saved from `main` only (10 GB repo quota);
  PRs and releases restore them. Desktop and iPhone/iPad e2e run in one job.
- Releases skip `checks.yml` when the commit already passed it (`ci.yml` push run, or the
  nightly a stable promotes); scheduled nightlies wait for CI and never ship a red commit
  (`checksDecision` in `scripts/release.ts`). Jobs after the optional `checks` need explicit
  `if: !cancelled() && …` conditions, or a skipped job skips the whole release.
- Desktop auto-update: release builds sign updater payloads with the secret
  `TAURI_SIGNING_PRIVATE_KEY` (public key in `tauri.conf.json`); the release job writes
  `latest.json` (`release.ts updater-manifest`) and copies it to the `update-feed` release as
  `stable.json` / `nightly.json`. Never change the public key without a migration plan —
  installed apps only accept updates signed with the key they shipped with.

## Database changes

1. Edit `src/lib/server/db/schema.ts`.
2. `bun run db:generate --name <short_name>` → commit the new file in `drizzle/` (and `drizzle/meta`).
3. Never edit or delete a migration that is already committed; add a new one.

## Definition of done (every milestone)

- `bun run check` → 0 errors, 0 warnings
- `bun run test` → green (add tests for non-trivial pure logic: date math, timers, ordering, aggregations)
- `bun run lint` → clean
- `bun run build` → succeeds
- `bun run test:e2e` → green (and `test:e2e:mobile` when touching layout/touch UI,
  `test:tauri` when touching `src-tauri/` or the pairing/session API); new behaviour gets an
  e2e test that follows the rules in "End-to-end tests"
- Manually exercised against a real DB (`bun run db:dev`): migrations apply on an empty DB, pages
  render (no SSR errors / console errors), mutations persist after reload.
- Update `docs/ROADMAP.md` (status + any decisions) and keep this file accurate.
- Commit with a clear message (`M<n>: …`). Do not commit `.env`.
