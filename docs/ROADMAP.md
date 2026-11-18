# libe — roadmap

## Product

A dark, calm planner that ties every hour to a few **quests** (long-running goals). You plan tasks
per day/week, time-box them on a timeline, run focus sessions against them and review where the
week went. Visual blueprint: `docs/reference/*.png|jpg`.

## Data model

Defined in `src/lib/server/db/schema.ts` (initial migration `drizzle/0000_init.sql`).

```
quests(id, name, description, icon emoji, color key, weekly_budget_h, closed_at, sort_order, created_at)
tasks(id, quest_id NULL, kind quest|other, title, description, duration_min,
      day NULL  ← NULL = backlog, recurrence_rule (RRULE), done_at, sort_order, created_at)
      CHECK kind='quest' ⇔ quest_id IS NOT NULL
blocks(id, task_id, day, start_min, end_min, created_at)        -- planned time on the timeline
sessions(id, task_id, state running|paused|completed, started_at, duration_min,
         paused_ms, paused_at, ended_at, source focus|manual|pomodoro, created_at)   -- logged time
pairing_codes(code, expires_at, used, created_at)
devices(id, token_hash, name, paired_at, last_seen_at)
```

Notes / decisions taken in M0:

- UUID primary keys; `order` is the TS name of column `sort_order`.
- `sessions.paused_at` added (start of the current pause) so the server can compute a running
  timer without client state. Elapsed = `(ended_at ?? now) - started_at - paused_ms - (paused_at ? now - paused_at : 0)`.
- `sessions.duration_min`: countdown target for focus/pomodoro (NULL = stopwatch); logged length for manual entries.
- Session source value is `manual` (English) rather than `manuell`.
- Deleting a quest cascades to its tasks → blocks/sessions. Normal UX should _close_ a quest (`closed_at`) instead.
- Pomodoro settings (intervals) are not in the schema yet → decide in M4 (table `settings` or per-session columns).

## Milestones

| #   | Scope                                                                                                                       | Status  |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------- |
| M0  | Scaffold: SvelteKit 3 + Bun + Drizzle schema + Docker Compose (app + Postgres) + design tokens + nav shell                  | ✅ done |
| M1  | Quests: data + CRUD incl. emoji / colour / weekly budget / close; quest backlog; quest cards (→ basis for pills)            | ⏳      |
| M2  | Home/Today: Quest work + Other lists, backlog input without day, day timeline (blocks + now line), ordering via ↑/↓ buttons | ⏳      |
| M3  | Plan: week kanban (Mon–Sun columns), add per day, collapsible "Other" zones, done/past styling                              | ⏳      |
| M4  | Focus: server-side timer + SSE, pomodoro mode (configurable intervals), "log time afterwards" dialog (manual sessions)      | ⏳      |
| M5  | Calendar: weekly log of sessions with overlap columns, day totals, now line, today column tint                              | ⏳      |
| M6  | Review: KPIs (quest hours vs budget, daily avg, quest vs other), per-day bars, hours by quest, sparklines, quarter sums     | ⏳      |
| M7  | Tauri 2 shell (thin client loading the server URL) + pairing flow (code → device token in OS keychain)                      | ⏳      |

## M0 — what exists

- `vite.config.ts` (Kit 3 config, adapter-node), `src/env.ts` (`DATABASE_URL`)
- `src/lib/server/db/{schema,index}.ts`, `drizzle/0000_init.sql`, `scripts/migrate.ts`
- `Dockerfile` (bun build → bun runtime, migrates on start), `compose.yaml`, `.env.example`
- Tokens `src/lib/styles/tokens.css`, globals `global.css`, `quest-colors.ts`, `dates.ts` (+ tests)
- Shell: `AppNav` (Home · Plan · Calendar · Focus · Quests · Review, search trigger placeholder, avatar)
- Primitives: `Button`, `QuestPill`, `PageHeader`, `ComingSoon`, `Logo`; `/styleguide` page
- `GET /api/health` (DB ping, used by the Docker healthcheck)
