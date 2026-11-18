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
pomodoro_runs(id, task_id, phase focus|short_break|long_break, round, phase_started_at NULL,
              phase_min, ended_at, created_at)                     -- M4, active run = ended_at NULL
settings(id = 1, pomodoro_focus_min, pomodoro_short_break_min, pomodoro_long_break_min,
         pomodoro_long_break_every, pomodoro_auto_start, updated_at)  -- M4, single row
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
- Pomodoro settings (intervals) → decided in M4: single-row `settings` table (migration `0001_focus_timer`).

## Milestones

| #   | Scope                                                                                                                       | Status  |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------- |
| M0  | Scaffold: SvelteKit 3 + Bun + Drizzle schema + Docker Compose (app + Postgres) + design tokens + nav shell                  | ✅ done |
| M1  | Quests: data + CRUD incl. emoji / colour / weekly budget / close; quest backlog; quest cards (→ basis for pills)            | ✅ done |
| M2  | Home/Today: Quest work + Other lists, backlog input without day, day timeline (blocks + now line), ordering via ↑/↓ buttons | ✅ done |
| M3  | Plan: week kanban (Mon–Sun columns), add per day, collapsible "Other" zones, done/past styling                              | ✅ done |
| M4  | Focus: server-side timer + SSE, pomodoro mode (configurable intervals), "log time afterwards" dialog (manual sessions)      | ✅ done |
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

## M1 — what exists

- `/quests`: quest grid (emoji tile, name, description, this-week hours vs. budget, 8-week
  sparkline, quarter hours), quarter summary, dashed "New quest" tile, collapsible "Closed" section.
  Card menu: Edit, Move up/down, Close/Reopen, Delete (with confirm; cascades).
- Create/Edit dialog (`components/quests/QuestForm.svelte` in `components/Dialog.svelte`): name,
  description, single-emoji icon (+ suggestions), colour swatches, optional weekly budget.
- `/quests/[id]`: quest header, backlog (add with optional minutes, done toggle, ↑/↓, delete),
  read-only "Scheduled" list. 404 for unknown/invalid ids.
- Data layer: `server/quests.ts`, `server/tasks.ts` (generic list ops for M2/M3), `server/stats.ts`
  - pure `stats-core.ts` (week/quarter/sparkline bucketing), `sessions.ts` (`sessionElapsedMs`),
    validation in `quest-form.ts` / `task-form.ts` / `emoji.ts` / `ids.ts` — all unit-tested.
- Shared components: `Menu`, `Dialog`, `Sparkline`, `tasks/TaskRow`.
- `scripts/seed.ts` (`bun run db:seed`): 4 demo quests, tasks, ~10 weeks of sessions.
- `scripts/dev-db.sh` (`bun run db:dev`): real Postgres 17 for machines without Docker.

Decisions / fixes during M1 review:

- Dev DB switched from PGlite to real Postgres 17: PGlite blocks other connections during a
  transaction, and postgres.js loads enum types lazily over a second connection → deadlock.
- Menu actions close the menu from the `use:enhance` callback (closing on click removed the
  form from the DOM before the browser submitted it).
- Sparkline buckets were computed in days instead of weeks — fixed and covered by tests.
- Sessions are attributed to the day of `started_at` (server `TZ`); only `completed` sessions count.

## M2 — what exists

- `/` (Home/Today): header with big date, `X.Xh today` + amber week-progress bar (week hours vs.
  sum of open-quest weekly budgets, capped 100%) + `Xh this week` (`homeTime()` in `server/stats.ts`).
- **Quest work** list: quest-filter popover (funnel icon, URL `?q=<id>,<id>`; all/none = unfiltered),
  dashed add row (quest picker, title, optional minutes, Top/Bottom), task cards (quest-colour bar,
  checkbox in quest colour, `QuestPill`, duration, ▶ → `/focus?task=…` hidden when done, ↑/↓,
  ⋯ menu: Time-block… / Move to backlog / Move to tomorrow / Delete). Done tasks dimmed, struck,
  sorted after open ones.
- **Backlog** card: "Add to backlog…" (creates `day = NULL` quest tasks), collapsible "N open
  tasks" with per-row "→ Today" and delete.
- **Other** card: eye toggle hides done tasks via `?hideDone=1`, add row with Top/Bottom, no pill.
- **Day timeline** (`components/home/DayTimeline.svelte`): 6:00–23:00, tinted card, hour gutter,
  hatched quest-colour blocks (overlapping blocks share columns), amber now line refreshing every
  30 s, auto-scroll to now once. Click empty area or block → `BlockDialog` (task picker, start/end,
  delete) — validated server-side (`0 ≤ start < end ≤ 1440`, existing range checks).
- Data layer: `server/tasks.ts` (`createTask`/`moveTask`/`moveTaskToDay`/toggle/delete, Top =
  `min-1` / Bottom = `max+1` via pure `src/lib/ordering.ts`), `server/blocks.ts` (CRUD + day query).
  All writes are form actions (`?/name` suffix) with `use:enhance`.
- New shared bits: `Menu` optional `trigger` snippet (used by quest picker), `Dialog` `aria-label`,
  `minuteOfDay()` in `dates.ts`, `layoutBlocks()` in `timeline.ts` (overlap columns) — all tested.

Decisions / fixes during M2:

- Add rows put **Bottom first in the DOM** so implicit Enter-submit adds to the bottom; CSS
  `order` keeps the visual Top → Bottom order.
- `moveTask` swaps adjacent siblings and then renumbers the whole bucket 0..n−1 — a bare
  order-value swap is a no-op when stored values aren't normalised (e.g. −1, 0, 1 from Top adds).
- Client `$page.form` is `null` (not `undefined`) — dialog "failed" derivations must use `form != null`.
- `BlockDialog` close via `enhance: { deserialize }` callbacks `await update()` **before**
  `onclose()`, otherwise the component unmounts mid-enhance and the timeline never re-renders.
- 390px overflow fixes: grid columns need `minmax(0, 1fr)` (implicit `auto` tracks size to
  min-content); add-row and card-meta rows wrap.

Fixes during M2 review:

- **List scope**: a scheduled task's list is now _all tasks of the same kind on that day_ (quest
  work of every quest shares one list, as Home/Plan render it); backlog lists stay per quest.
  Previously Top/Bottom and ↑/↓ were computed per quest, so two "Top" adds for different quests
  tied at `-1` and ↑ swapped with an invisible task.
- ↑/↓ never cross between open and done tasks (`moveWithinGroup` in `ordering.ts`; the UI disables
  the buttons at group edges). With a quest filter active, ↑/↓ may swap with a hidden task.

## M3 — what exists

- `/plan` (Plan the week): header with funnel quest filter (`?q=`, same semantics as Home), month
  label of the shown week (`weekMonthLabel`: "November 2026", "Nov – Dec 2026", "Dec 2026 – Jan
  2027"), ‹ / › week links, "Today", eye toggle (`?hideDone=1`). Week in `?week=` (any day →
  its Monday; invalid → current week).
- **Board** (`.board` scrolls horizontally, never the page; today's column is scrolled into view
  on load / week change, other weeks start at the left): collapsible **Backlog** rail +
  7 day columns (`components/plan/PlanColumn.svelte`, 252px). Header "Wed 18"; today = amber
  number + 2px amber underline; past days dimmed (opacity, still interactive).
- Per column: compact add row (dot-only quest picker incl. "Other" → kind `other`, ⤒/⤓) on top,
  compact `DayTaskCard`s (colour bar, wrapping title, check, pill, planned/logged time, ▶ focus
  link, ↑/↓ within open/done group, ⋯ Move to previous day / next day / backlog, Delete), done
  tasks dimmed + struck after open ones, and a collapsible "› Other N" zone (own add row) when the
  day has other tasks.
- **Backlog rail** (`components/plan/BacklogColumn.svelte`): "Add to backlog…" (quest picker),
  open-quest backlog grouped per quest plus an **Other** group (other tasks without a day — they
  were invisible everywhere before), rows with check, duration and ⋯ Move to today / Delete.
  Collapses to a vertical strip (client-only state).
- **Drag & drop** (HTML5): day ↔ day, within a day (before/after the card under the pointer),
  backlog → day, day → backlog. 2px amber indicator before a card or at the end of the list.
  Submits `?/moveTo` (taskId, day | '' = backlog, beforeId | '' = end). Keyboard users keep ↑/↓,
  the ⋯ menus and the backlog "Move to today".
- Server: `listWeekTasks(monday)`, `listOtherBacklog()`, `moveTaskTo(id, day|null, beforeId|null)`
  (renumbers the target list 0..n−1 via pure `dropIntoList` in `ordering.ts`; tested: same-list
  reorder, cross-list, before = null / unknown → end, before = itself → no-op). Plan actions:
  shared ones from `server/task-actions.ts` + `add`, `addOther`, `addBacklog`, `moveTo`,
  `prevDay`, `nextDay` — all ids `isUuid`, days `isISODay`, titles/durations via `task-form.ts`.

Decisions / fixes during M3:

- **Kit 3 form landing**: an enhanced (or native) submission navigates to the action URL minus
  `/name`; `action="?/x"` resolves _without_ the page's query, so every mutation dropped
  `?week=` (jumped back to the current week), `?q=`, `?hideDone=` — also on Home since M2.
  `formAction(name)` (`#lib/form-action.ts`, pure part `actionWithQuery` in `action-url.ts`,
  tested) builds `?<current params>&/name`; used by all Home/Plan task, block and backlog forms.
- **Other-zone expanded state** lives in the URL (`?other=<day>,<day>`, `goto` with
  `replace` + `reset: false`): survives reload and works without JS; week links drop it.
  The backlog rail's collapsed state is client-only `$state` (pure view preference).
- **Drag state** is a tiny shared rune module (`components/plan/drag.svelte.ts`) because
  `dataTransfer` data is unreadable during `dragover`. A task never changes kind by moving, so the
  indicator is always drawn in the list the server will use: a quest task hovering the Other
  zone targets the quest list; an other task targets the Other list (or highlights the collapsed
  toggle); in the backlog the pointer is projected onto the task's own quest group.
- Drops position by pointer y against the task's own list, anywhere in the column (header, add
  row, empty space below = end). A drop before its own card / right after it is a no-op.
- `Menu` popovers switched to `position: fixed` placed from the trigger rect (flip above when no
  room below, clamped to the viewport, follow scrolling) — they were clipped by the scrolling
  board/columns.
- Previous-agent work fixed in review: title said "Today"; ▶ hidden on plan cards; header
  underline 1px + amber weekday instead of number; add row at the column bottom and wrapping
  to three lines (now compact single row at the top, `TaskAddForm compact` + dot-only
  `QuestPicker compact`); the Other zone's add form shared the `add` intent with the main row
  (errors echoed twice → own `addOther` action); `goto` used Kit 2 options (`noScroll`,
  `replaceState`); the scroll-to-today effect re-ran on every mutation (now keyed on a derived
  week string, minimal scroll); `TaskAddForm` echo lost its `form.errors` guard; `moveTo` passed
  an unvalidated `beforeId`; DOM-class juggling for the dragged card replaced by state.
- Known gap (fixed in M4): an "other" task moved to the backlog from Home disappeared from Home
  (it only showed in the Plan backlog's Other group).

## M4 — what exists

- **Server timer** (`server/timer.ts`, migration `drizzle/0001_focus_timer.sql`): at most one
  active session (`running`/`paused`, partial unique index `sessions_one_active_idx`) and at most
  one active pomodoro run (`pomodoro_runs_one_active_idx`). Operations: `start(taskId, mode,
plannedMin?, replace?)`, `pause`, `resume`, `complete` (ends session + marks task done), `stop`
  (ends session, task stays open), `discard` (deletes the active session), pomodoro `startPhase`
  / `skip`, settings update. Each runs in a transaction that locks the active rows, rolls a
  pomodoro run forward, validates the transition and uses server timestamps; starting while a
  timer is active → 409 `conflict` unless `replace` (= stop current, keep its time).
- **Pure model** `src/lib/timer.ts` (tested): pause/resume/finish clock transitions with
  `paused_at`/`paused_ms` bookkeeping, `rolloverPomodoro` (lazy phase rollover from timestamps),
  `startPendingPhase`/`skipBreak`, `timerView` (display text, label, overtime, progress, cycle
  dots, `stale`), `parseTimerCommand`, `parsePlannedMin`, `parsePomodoroSettings`.
- **Countdown**: target = planned minutes (task duration, else 25; empty = stopwatch); past the
  target the timer keeps counting as overtime (`+02:13`, label OVERTIME) until completed/stopped.
- **API**: `GET /api/timer` (snapshot), `POST /api/timer` JSON `{ action, … }` → `{ ok, snapshot }`
  or `{ ok: false, code, error }` (400/404/409); plain form posts (no JS) are accepted and answered
  with a 303 to `redirectTo` (`?timerError=` on failure). `GET /api/timer/stream` = SSE
  (`event: timer` with the full snapshot on connect + every change, `: ping` every 25 s,
  listener removed on abort). `GET/POST /api/sessions`, `DELETE /api/sessions/[id]` for manual logs.
- **Client store** `timer-store.svelte.ts` (`TimerStore`, context via `setTimerStore`/`useTimer`):
  seeded from the root layout `load`, one SSE connection (exponential backoff 1 s → 30 s), 250 ms
  local tick, clock offset = snapshot `now` − `Date.now()`. Stale snapshots (older `now`) are
  ignored. When the active session id changes it calls `refreshAll()` (logged times, done state,
  header hours). `html[data-timer=live|offline]` reflects the stream.
- **Focus screen** `/focus` (outside the `(app)` route group → no nav): "● FOCUS · QUEST" crumb,
  gear (pomodoro settings dialog, form action `?/settings`), ← back to the previous in-app page;
  running view = outlined quest pill, title, huge tabular clock (`--fs-timer`, shrinks with
  `vw`), state label, pomodoro dots, Pause/Resume · Complete · ⋯ (Log time… / Stop (keep task
  open) / Discard session); pomodoro waiting states "Start break / Skip", "Start focus".
  Without a timer: picker of today's open quest + other tasks and the backlog (`?task=`
  preselects, also tasks of other days), Focus/Pomodoro toggle, planned minutes, Start, "Log
  time afterwards…". `<title>` = "36:00 · Task title". `?task=` of another task while running →
  "Start X instead? Stop current and start".
- **Live timer elsewhere**: `DayTaskCard` (Home + Plan) of the active task gets the amber outline
  (`--running-border`), red pulsing dot + live time (link to /focus), pause/resume icon and a
  bottom progress line (elapsed/target). ▶ on other cards starts a focus timer and opens /focus;
  on conflict the root-layout `SwitchTimerDialog` asks "Stop current and start". `AppNav` shows a
  chip (dot · time · truncated title → /focus; title hidden below 900px).
- **Log time afterwards** (`components/focus/LogTimeDialog.svelte`, mounted once in the root
  layout; opened from card ⋯ "Log time…" on Home/Plan and from the Focus screen): date (≤ 365
  days back), start, minutes ↔ end time kept in sync (end ≤ start = next day), "Mark task as
  done"; lists the task's completed sessions of that day (any source) with delete. Server
  validation in pure `src/lib/manual-log.ts` (tested): valid day/HH:MM, 1–1440 min, not in the
  future (60 s slack), within 365 days, no overlap with the active session's `[started_at, now)`;
  wall times interpreted in server `TZ` (`wallTimeToDate`, DST-aware).
- **Home backlog** now also lists "other" tasks without a day (after the quest rows, "Other" pill).

Decisions / fixes during M4:

- **Timer state model**: the DB rows are the only state. Focus mode = one `sessions` row
  (`source = 'focus'`, `duration_min` = target or NULL). Pomodoro = a `pomodoro_runs` row (phase,
  round, `phase_started_at` — NULL means "waiting for the user" —, `phase_min`) plus one
  `sessions` row per focus round (`source = 'pomodoro'`). Breaks are not sessions.
- **Lazy rollover, no server timers**: every read/mutation first calls `rolloverPomodoro` up to
  `now`; a finished focus round's session is completed at its exact end
  (`start + focus + pauses`), auto-started breaks/rounds begin at the computed instants. Clients
  project the same function locally, so the display flips at the right second; when the
  projection is ahead of the snapshot (`view.stale`) the store calls `GET /api/timer` once,
  which persists the rollover and broadcasts it.
- **After a long break the run always waits** for "Start focus", even with auto-start — an
  unattended run logs at most one cycle of rounds.
- **Settings** live in the single-row `settings` table and are global, not snapshotted per run.
  Saving rolls the active run forward with the old values first, so new intervals apply from the
  next phase (the current phase keeps its stored `phase_min` / session `duration_min`).
- **SSE / single process**: fan-out is an in-process listener set (`server/timer-hub.ts`). This
  only works with one server process; several instances would need Postgres `LISTEN/NOTIFY`
  (or similar). Each push carries the server `now` for the client's clock offset.
- **Stop vs. complete vs. discard**: stop and complete both log the session (completed, live
  pause folded into `paused_ms`); only complete marks the task done; discard deletes it. A
  pomodoro's earlier completed rounds are kept on discard.
- Task/quest deletion broadcasts the timer (the cascade may remove the active session/run).
- Root layout skips its post-change `refreshAll` while the page is unloading (a reload could
  otherwise abort it and Kit logs "Failed to fetch").
- Browser tests can't use `networkidle` any more (open SSE stream) — they wait for
  `html[data-timer=live]`.
