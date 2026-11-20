# Contributing to libe

Thanks for wanting to help! Bug reports, ideas, translations, docs fixes and pull requests are
all welcome — from anyone. You don't need to ask before opening a PR, but for bigger changes a
short issue first saves everyone time (see below).

## Ways to contribute

- **Report a bug** — use the [bug report form](https://github.com/antonsxh/libe/issues/new?template=bug_report.yml).
  Steps to reproduce and where you run libe (browser, iPhone/iPad, desktop app, Docker) help most.
- **Suggest a feature** — use the [feature request form](https://github.com/antonsxh/libe/issues/new?template=feature_request.yml).
  Describe the problem you want solved, not only the solution.
- **Fix or build something** — pick an open issue (look for
  [`good first issue`](https://github.com/antonsxh/libe/labels/good%20first%20issue) and
  [`help wanted`](https://github.com/antonsxh/libe/labels/help%20wanted)) or bring your own idea.
- **Improve the German translation or the docs** — small PRs are perfect for this.

### Small change or big change?

- **Small** (bug fix, typo, translation, a test, a minor UI polish): just open a PR.
- **Bigger** (a new feature, a new page, a schema change, a new dependency, changes to CI or the
  release pipeline): please open an issue or a draft PR first and describe the plan. libe has a
  deliberately small stack and a specific look (see [`docs/reference/`](docs/reference/)), so a
  quick check before you invest a weekend avoids surprises in review.

## Development setup

You need [Bun](https://bun.sh) (the version pinned in `package.json` → `packageManager`) and
Postgres 17. Docker is optional.

```sh
bun install
cp .env.example .env              # LIBE_SETUP_SECRET=dev-setup-secret is fine locally
bun run db:dev                    # local Postgres 17 without Docker (Linux x64)
                                  # or: docker compose up -d db
bun run db:migrate
bun run db:seed                   # demo data (only if the DB is empty)
bun run dev                       # → open /setup and enter the secret
```

Every page needs a paired device: open `/setup` and enter `LIBE_SETUP_SECRET` from your `.env`.

The desktop app (Tauri 2) additionally needs a Rust toolchain and the Tauri system
dependencies — see [`docs/TAURI.md`](docs/TAURI.md). You only need it when you touch `src-tauri/`.

## How the code is organised

**Read [`AGENTS.md`](AGENTS.md) before changing code.** It is the project's single source of
conventions (for humans and coding agents alike): stack, folder layout, data flow, styling,
i18n, testing rules. [`docs/ROADMAP.md`](docs/ROADMAP.md) has the data model and the decisions
behind it. The short version:

- **Svelte 5 runes only**, **SvelteKit 3** (config in `vite.config.ts`, `#lib/...` imports with
  file extensions — not `$lib`), Bun, Drizzle ORM + Postgres.
- **The server is the source of truth.** Read in `load`, write through form actions or
  `src/routes/api/**`, validate on the server. No client-only data.
- **No Tailwind / UI kit.** Use the CSS tokens in `src/lib/styles/tokens.css` and scoped
  `<style>`; icons from `@lucide/svelte`. Check `/styleguide` in the running app first.
- **Every user-visible string** goes into both `src/lib/i18n/en.ts` and `de.ts`.
- **Database changes**: edit `src/lib/server/db/schema.ts`, then
  `bun run db:generate --name <short_name>` and commit the new migration. Never edit a migration
  that is already on `main`.
- Layouts must work down to ~375 px wide and on touch screens.

## Before you open a pull request

Run these locally — CI runs the same and a PR is only merged when everything is green:

```sh
bun run check      # svelte-check / TypeScript: 0 errors, 0 warnings
bun run lint       # prettier (bun run format fixes it)
bun run test       # unit tests
bun run build      # production build
bun run test:e2e   # Playwright e2e (needs `bun run db:dev` running)
```

Also run `bun run test:e2e:mobile` when you change layout or touch UI, and `bun run test:tauri`
when you change `src-tauri/` or the pairing/session API (both also run in CI, so it's fine to
let CI do it if your machine can't).

Tests:

- Add **unit tests** (`*.test.ts` next to the code) for non-trivial pure logic — date math,
  timers, ordering, aggregations.
- New behaviour gets an **e2e test** in `e2e/specs/`. The suite is meant to stay small and
  trustworthy; please follow the rules in [`AGENTS.md`](AGENTS.md) → "End-to-end tests" (assert
  behaviour after a server round-trip, create your own data with `uid()`, no fixed sleeps).
- A bug fix should come with a test that fails without the fix.

## Pull requests

- Branch off `main`, keep a PR focused on one thing. Unrelated refactors belong in their own PR.
- Fill in the PR template: what changed, why, and how you tested it.
- **UI changes need before and after screenshots** (desktop and phone width if the layout
  changed). Add a short video when the change is about motion or timing. Upload them to the PR
  (drag them into the description or a comment). Do not commit them.
- Write commit messages and the PR title in English, in the imperative/topic style used on
  `main`, e.g. `Calendar: keep the now line in view` or `Fix: …`.
- PRs are **squash-merged**, so the PR title becomes the commit on `main`. Don't worry about a
  tidy branch history; merge `main` into your branch if it falls behind.
- Don't bump versions — releases and version numbers are handled by the pipeline
  ([`docs/RELEASING.md`](docs/RELEASING.md)).
- Never commit `.env` or other secrets.
- Using AI coding assistants is fine. You are still responsible for the change: read it,
  understand it and test it like code you wrote yourself.

Review may ask for changes; that's normal and not a judgement on you. If a PR goes quiet for a
while, a friendly ping is welcome.

## Questions

Not sure about something? Open an issue and ask — there are no silly questions.
