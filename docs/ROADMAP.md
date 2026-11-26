# libe — roadmap

## Product

A dark, calm planner that ties every hour to a few **quests** (long-running goals). You plan tasks
per day/week, time-box them on a timeline, run focus sessions against them and review where the
week went. Visual reference: the existing pages and `/styleguide`.

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
         pomodoro_long_break_every, pomodoro_auto_start, language auto|en|de, display_name,
         avatar_color, avatar_emoji, daily_goal_min, streak_rest_days, onboarded_at, updated_at)
                                                       -- M4, single row; language: 0003_ui_language;
                                                       -- profile 0004/0005; rest days 0006;
                                                       -- first-run flow 0008 (O2)
devices(id, token_hash UNIQUE, name, kind browser|pwa|tauri, user_agent, paired_at, last_seen_at,
        cookie_renewed_at, revoked_at)                                    -- M7 (0002_devices)
pairing_codes(id, code_hash, expires_at, used_at, attempts, created_by_device_id → devices,
              device_id → devices, created_at)                            -- M7, 6-digit codes, hashed
push_config(id = 1, vapid_public_key, vapid_private_key, subject, last_event_key, last_event_at,
            created_at)                                   -- Web Push (0007_web_push), single row
push_subscriptions(id, device_id → devices UNIQUE, endpoint UNIQUE, p256dh, auth, locale en|de,
                   created_at, last_success_at, last_failure_at, last_failure_status)
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
| M5  | Calendar: weekly log of sessions with overlap columns, day totals, now line, today column tint                              | ✅ done |
| M6  | Review: KPIs (quest hours vs budget, daily avg, quest vs other), per-day bars, hours by quest, sparklines, quarter sums     | ✅ done |
| M7  | Device pairing for every client, Tauri 2 thin client (token in OS keychain), iPhone/iPad home-screen PWA, HTTPS deployment  | ✅ done |

## M0 — what exists

- `vite.config.ts` (Kit 3 config, adapter-node), `src/env.ts` (`DATABASE_URL`)
- `src/lib/server/db/{schema,index}.ts`, `drizzle/0000_init.sql`, `scripts/migrate.ts`
- `Dockerfile` (bun build → bun runtime, migrates on start), `compose.yaml`, `.env.example`
- Tokens `src/lib/styles/tokens.css`, globals `global.css`, `quest-colors.ts`, `dates.ts` (+ tests)
- Shell: `AppNav` (Home · Plan · Calendar · Focus · Quests · Review, search trigger — a placeholder until the command palette, see below — avatar)
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

## M5 — what exists

- `/calendar` (weekly log): header "Calendar", ‹ `Nov 9 – 15` › (`weekRangeLabel`: "Oct 26 – Nov 1"
  across months/years), "This week" (muted + `aria-disabled` on the current week), "Show plan"
  toggle (`?plan=1`). Right: week total `52h 37m`, muted `/ 20h quest` and a thin amber bar =
  quest time vs. the sum of open quests' weekly budgets (capped 100%). Week in `?week=` (any day →
  its Monday; invalid → current week), links keep `?plan=`.
- **Week grid** (`components/calendar/WeekGrid.svelte`): one scrolling card (both axes), sticky
  header row (`Mon 9` + day total, `0m` when empty) and sticky hour gutter, 7 columns
  (`minmax(var(--cal-col-min), 1fr)` → on phones the card scrolls horizontally, never the page).
  Range 6:00–24:00, extended earlier to the earliest entry/planned block of the week; 50px/h
  (`--cal-hour`). Today's header + column tinted (`--today-tint`), amber day number. On load /
  week change it scrolls to ~1 h before now (current week) or 30 min before the first entry.
- **Entries** = sessions at their real wall-clock span in the server `TZ`: hatched in the quest
  colour (slate for "other"), title + `10:58 – 13:20` when ≥ 42 min tall, else one ellipsised line;
  a small check when the task is done; midnight-crossing sessions split into one segment per day
  (label `Thu 22:56 – Fri 00:08`). Overlapping entries share columns (`layoutDay` →
  `layoutBlocks`), laid out with their drawn height (min 20 min) so short entries never cover
  each other.
- **Active session** (from the timer store, not the DB query): amber outline, pulsing dot,
  `15:09 – now` (`– paused`), links to `/focus`; grows every 5 s and updates on every SSE
  snapshot; its live elapsed time is included in the day/week totals.
- **Now line**: amber line + dot across all 7 columns, only in the week containing today,
  refreshed every 30 s (5 s while a timer runs).
- **Plan overlay**: the week's `blocks` as dashed outlines (no fill, faint title) behind the
  entries, own overlap columns, click-through.
- **Edit / log**: click an entry → "Edit session" (`components/calendar/SessionDialog.svelte`:
  searchable grouped `TaskPicker` — that day's tasks, this week, backlog, open tasks of other
  days; start date+time, end date+time, live duration, Delete). Click an empty slot (each column
  is a `<button>`; keyboard activation → 30 min before now today, else 9:00) → "Log time"
  prefilled with that day, the clicked time rounded down to 15 min and 30 minutes (moving the
  start keeps the duration). After each change `refreshAll()` reloads the week before closing.
- Server: `server/calendar.ts` — `listWeekSessions(monday)` (completed sessions overlapping the
  week, task title/done + quest name/colour joined), `listPickTasks(monday)`, `serverTimeZone()`;
  `listWeekBlocks(monday)` in `server/blocks.ts`; `getLoggedSession` / `updateLoggedSession` in
  `server/sessions.ts`.
- API: `POST /api/sessions` also accepts `{ taskId, day, start, endDay, end }`;
  `PATCH /api/sessions/[id]` edits a completed session (task + span; 404 for active/unknown).
  Both use `validateSessionSpan` (`manual-log.ts`), which shares the "not in the future / ≤ 365
  days / no overlap with the active session" rules with `validateManualLog` (`checkSpan`), plus
  end > start and ≤ 24 h; unchanged `HH:MM` fields keep the original seconds (`keepSameMinute`).
- Pure, tested `src/lib/calendar.ts`: `splitSession`, `calendarWeek` (segments + per-day, week,
  quest/other totals), `layoutDay`, `gridStartHour`, `slotMinute`, `formatHM`, `wallMinutes`,
  `sessionSpanLabel` — incl. midnight splits, chains of overlaps and the DST week of 2026-10-25.

Decisions during M5:

- **Calendar shows actual spans, stats attribute by start day.** Home/Quests/sparklines still
  count a whole session on the day of `started_at`; the calendar splits it at midnight and gives
  each day its part. A session crossing midnight therefore counts fully on day 1 in Home's
  "today" but split in the calendar's day totals (the week sums agree unless the split crosses
  a week boundary).
- **Paused time is ignored for placement**: a block spans `started_at → ended_at` (pauses are not
  cut out of it); logged minutes = span − `paused_ms`, and for split sessions the pause is spread
  proportionally over the parts.
- Positions are wall-clock minutes in the server `TZ` (sent to the client as `timeZone`, so a
  browser in another zone still sees server days). On a 25-hour DST day the repeated hour is
  drawn over itself; if that makes a segment's end precede its start it keeps its real length.
- **Edits**: changing a session's span resets its `paused_ms` to 0 (the edited span is taken as
  the time worked); changing only the task keeps pauses. `duration_min` follows the span for
  manual logs and stays the countdown target for focus/pomodoro sessions. The active session is
  not editable here (it belongs to the timer) — clicking it opens `/focus`.
- Week totals include the running session's live time (Home's header counts completed sessions
  only).
- `PageHeader`'s title row now wraps (the calendar's week navigation drops under the title on
  phones).

## M6 — what exists

- `/review` (Weekly review): header "Weekly review" + subtitle; right: ‹ `Nov 9 – 15` › and
  "This week" — the shared `components/WeekNav.svelte` (extracted from the Calendar, which now
  uses it too; `?week=` = any day → its Monday, invalid → current week, other params kept).
- **KPI row** (3 cards, one column below 720px): QUEST HOURS (amber, `/ 19h` = sum of open quests'
  weekly budgets, omitted when 0; `87% of target` or "No weekly budget set"), DAILY AVERAGE
  (logged quest + other ÷ elapsed days: 7 for past weeks, Mon…today for the current week, 0 → `0h`
  for future weeks; sub-line `15.5h logged over 3 days`), QUEST WORK VS OTHER (quest share in %,
  `—` without data). Each card has a subtle top-right delta vs the previous week (`+2.1h vs last
week`, share in `pts`); for the current week it compares the same elapsed days
  (`vs last Mon–Wed`), future weeks show none.
- **Charts row** (stacks below 1100px): `components/review/DayBars.svelte` — 7 div bars Mon–Sun
  scaled to the week's busiest day (min. scale 1h), value above (`0h` faint) and weekday below;
  past = `--bar-muted`, today amber (bar + labels), future and empty days a 2px stub. Each column
  is a `<button>` with an aria-label (`Mon, Nov 16: 8:45 quest work (Launch my idea 4:40, …)`);
  hover/focus shows a CSS tooltip with the exact `h:mm`, per-quest breakdown and other time.
  `QuestHours.svelte` — one row per open quest or quest with time this week (closed ones dimmed),
  sorted by hours desc: dot, ellipsised name (links to the quest), bar on `--track` in the quest
  colour, a budget tick and `10.5h / 10h`; the track's full scale is the largest of any hours or
  budget. `QuestVsOther.svelte` — amber stacked bar on `--track` + legend.
- **This quarter** (`QuarterSummary.svelte`): `Q4 2026 · Oct 1 – Dec 31`, quarter totals for all
  quests (with target) and for other work, and one card per open quest / closed quest with
  quarter time: icon, name, quarter hours `/ target`, sparkline of weekly hours (shown week
  marked with a dashed guide + ring; `Sparkline` got a `highlight` prop), progress bar and
  `% of target` (closed / no budget → no target).
- Data: `server/review.ts` `weeklyReview(monday)` = 2 queries (completed sessions with
  `started_at` in `reviewRange()` = previous week ∪ shown week ∪ its quarter, joined to tasks;
  all quests). Pure, tested `src/lib/review.ts`: `buildReview`, `quarterOf`, `quarterWeeks`,
  `daysElapsedInWeek`, `reviewRange`, `formatHMin`, `formatSignedHours`, `percent`,
  `comparisonLabel`; `endOfQuarter` / `daysBetween` added to `dates.ts`. Chart sizes are tokens
  (`--chart-*` in `tokens.css`).

Decisions during M6:

- **Attribution = stats rule**: the review counts a whole completed session on the day of its
  `started_at` (server `TZ`), like Home/Quests. The Calendar splits real spans at midnight, so a
  day total there can differ slightly (e.g. a 21:45–00:30 session: review puts it all on Monday,
  the calendar gives Tuesday its 30 min); week totals only differ when the split crosses Sunday
  midnight. The active session is not counted (live-only, as in Home); the page refreshes via
  `refreshAll()` when a timer session completes.
- **Quarter of a week = quarter of its Monday.** A week spanning two quarters (Mon Dec 28 – Sun
  Jan 3) shows Q4; quarter totals only count days inside the quarter (Jan 1–3 are in the week's
  KPIs but not in Q4's sums). The sparkline covers the quarter's weeks from the week containing
  its first day up to the later of the current and the shown week (never past the quarter end);
  each week bucket is clipped to the quarter's days, so the buckets sum to the quarter total.
- **Quarter target** = weekly budget × elapsed quarter days ÷ 7 (fractional weeks, today
  included; a past quarter counts all its days, a future one 0). Only open quests have budgets —
  closed quests are excluded from week and quarter targets but still listed (dimmed) when they
  have time in the period.
- Daily average divides by elapsed days, so a fresh Monday isn't diluted by the empty rest of
  the week; week-over-week deltas compare the same elapsed days of the previous week.

## M7 — what exists

**Device auth (every client is a paired device; no accounts/passwords)**

- `src/hooks.server.ts`: resolves the device from `Authorization: Bearer <token>` or the
  `libe_device` cookie with one lookup on the unique `token_hash` index (non-revoked), sets
  `event.locals.device`, writes `last_seen_at` at most once a minute (in the background) and
  re-issues the cookie at most once a day (sliding expiry). Without a device only the public
  routes work (`isPublicPath` in `#lib/auth.ts`: `/pair`, `/pair/*`, `/setup`, `/offline`,
  `/api/pair/**`, `/api/health`, manifest, service worker, icons, `/_app/**`); pages redirect
  303 to `/pair?next=…` (`/setup` while nothing is paired), API/SSE routes answer
  `401 { ok: false, code: 'unauthorized' }`. A revoked/unknown cookie is cleared.
- Tokens: 32 random bytes base64url (43 chars); the DB stores only SHA-256 hex
  (`server/tokens.ts`). Cookie: httpOnly, `SameSite=Lax`, `Secure` when the request URL is
  https (adapter-node derives it from `ORIGIN` / `PROTOCOL_HEADER`), `Max-Age` 400 days.
- `/setup` (`LIBE_SETUP_SECRET`, constant-time compare via hashed `timingSafeEqual`, per-IP
  rate limit): bootstrap of the first device; stays usable afterwards as the owner's recovery
  path. Unset secret → clear message, setup refused. `compose.yaml` requires the variable.
- Pairing codes (`server/devices.ts`): 6 digits ("482 913"), 10 min, single use, stored as
  SHA-256, `createPairingCode` invalidates the issuing device's previous code. A guess that
  matches no live code counts as a wrong attempt against **every** live code (with hashed codes
  we can't know which one was meant); 5 wrong attempts lock a code. In-memory per-IP limiter
  (`#lib/rate-limit.ts`, 10 failures/min) on `/pair`, `POST /api/pair` and `/setup`.
- `/pair`: code (prefilled from `?code=`, the QR link) + device name (default from the UA:
  iPhone / iPad — iPadOS reports a Mac UA, so `maxTouchPoints` decides — / Mac / Windows PC /
  Android …) + kind (`pwa` when running standalone), redirects to `next`.
- API: `POST /api/pair` JSON `{ code, name, kind }` → `{ token, device }` (Tauri, scripts);
  `GET /api/pair/session` (whoami), `POST /api/pair/session` (Bearer → cookie, used by
  `/pair/session#token=…&next=…`), `DELETE /api/pair/session` (sign out = revoke);
  `POST /api/devices/codes` (new code + `<ORIGIN>/pair?code=` URL), `GET /api/devices/codes/[id]`
  (status for the dialog: active / used + device name / expired / locked).
- `/settings` (route group `(app)`, avatar menu in `AppNav`: Settings · Pair new device; signing
  out = this device's row → Sign out, with confirmation — the unconfirmed "Sign out this
  device" in the avatar menu and below the device list are gone: one stray tap signed the
  device out): device list (kind icon, paired, last seen, "This device"), rename, revoke
  (self = sign out), pomodoro settings summary + dialog. "Pair a new device" dialog
  (`components/settings/PairDeviceDialog.svelte`): large code, countdown + bar, auto-renew on
  expiry, "New code", QR code of the pairing URL, polls the code and shows "X is paired".
- Revocation: `revokeDevice` sets `revoked_at`, expires the device's codes and closes its open
  timer SSE streams at once (`server/device-streams.ts`); every SSE heartbeat (25 s) also
  re-checks the device in the DB. The client store sends a 401'd device to `/pair`.
- QR codes: `#lib/qr.ts` renders a `qrcode-generator` symbol as one SVG path (token colours,
  dark-on-light). The dependency (small, no deps, MIT) replaces a hand-written encoder; the e2e
  test decodes the rendered QR with jsQR and checks the URL.

**PWA (iPhone / iPad home screen)**

- `static/manifest.webmanifest` (id/start_url/scope `/`, standalone, `#0e0e10`, 192/512 +
  maskable icons), `apple-touch-icon.png` (180², opaque), `favicon.ico/.svg/-32.png`, all
  generated from the libe logo (also the Tauri icon set). `src/app.html`: manifest, Apple meta
  (`apple-mobile-web-app-capable`, `black-translucent` status bar, title), `viewport-fit=cover`.
- Safe areas: `--safe-*` tokens (`env(safe-area-inset-*)`) in the top bar, the phone tab bar,
  `main`, the auth pages and the Focus screen.
- `src/service-worker/` (own tsconfig extending `$app/tsconfig/service-worker`, checked by
  `tsc -p src/service-worker` in `bun run check`): precaches `$app/manifest` `immutable` +
  `assets` and the public `/offline` page (fetched without credentials); navigations are
  network-only with the cached `/offline` page as fallback; `/api/**` (incl. the timer SSE),
  `__data.json`, `/pair`, `/setup` are never touched; old caches are deleted on activate.
  Registered by the root layout in production builds only (Kit's auto-registration is off).
- Phones (≤ 720 px): the sections move into a fixed bottom tab bar (icons + labels, safe-area
  padding); the top bar keeps brand, timer chip, search and the account menu.
- Touch (`@media (pointer: coarse)` in `global.css`): inputs ≥ 16 px (no iOS focus zoom),
  every button gets an invisible ≥ 44×44 hit area (`--hit-min`; `.hit-target` for icon
  links), menu items ≥ 44 px. Review day bars pin their tooltip on tap. Plan cards' ⋯ menu got
  a **Move to day** picker (Mon–Sun) so touch users can do everything without drag & drop.
  `-webkit-tap-highlight-color: transparent`; body stays dark during rubber-banding.
- iOS resume: the timer store reconnects SSE and resyncs on `visibilitychange` (if hidden > 15 s
  or the stream isn't open), `pageshow` (bfcache) and `online`, and reloads page data after
  > 5 min away.

**Tauri 2 desktop app** — `src-tauri/` (see `docs/TAURI.md`): bundled pairing page
(`src-tauri/ui/`), Rust `POST /api/pair`, `{server, token}` in the OS keychain (`keyring` 3),
session bootstrap via `/pair/session#token=…`, navigation guard (intercepts `/pair`/`/setup`
→ re-check token → restore cookie or back to pairing; other origins blocked), menu Reload /
Change server / Unpair… / Quit, window state remembered, background `#0e0e10`.
`bun run tauri:dev` / `tauri:build` (`@tauri-apps/cli`).

**Deployment**: `compose.yaml` requires `LIBE_SETUP_SECRET` (fails fast with a message),
`ORIGIN` from `LIBE_ORIGIN`; optional `compose.caddy.yaml` + `Caddyfile` (automatic HTTPS for
`LIBE_DOMAIN`, `ORIGIN=https://…`, `ADDRESS_HEADER=X-Forwarded-For`, `XFF_DEPTH=1`, SSE
flushed immediately). README: setup, HTTPS/proxy notes, iOS install.

Decisions during M7:

- **Everything is a device**, browsers included; the cookie _is_ the device token. A home-screen
  app on iOS has its own cookie jar and is paired separately (kind `pwa`). Revoked devices keep
  their row (`revoked_at`) for the history; nothing un-revokes them.
- **Lifetimes**: cookie 400 days (browser maximum), re-issued at most daily while in use, so an
  active device never expires; pairing codes 10 min; `last_seen_at` ≤ 1/min.
- **Setup secret stays valid** after the first device (recovery when all devices are lost).
- **Rate limiting** is in-memory per IP (single process, like the timer hub). Behind a proxy
  set `ADDRESS_HEADER`/`XFF_DEPTH`, otherwise all clients share the proxy's bucket (stricter,
  still safe).
- **CSRF**: Kit 3 treats bodyless and form-encoded non-GET requests as forms and checks their
  `Origin`; all pairing/session API calls use JSON bodies (and the Tauri pairing call is made
  from Rust), so no `trustedOrigins` entry for `tauri://localhost` is needed.
- **Tauri session bootstrap**: the server sets the cookie (via `/pair/session` + Bearer) rather
  than Tauri 2.12's `set_cookie`, so attributes (`Secure`, expiry, renewal) are identical to
  browsers and the flow is the same on every platform.
- **Service worker** only provides installability + an offline page — no offline data: the
  server stays the single source of truth and personal HTML/API responses are never cached.
- `Menu` popovers are now rendered into `<body>` while open (`{@attach}`): `position: fixed`
  alone did not escape the stacking context of dimmed (opacity) plan columns.
- Home's auto-scroll to the now line only runs when the timeline starts in the first screen
  (two-column layout); stacked under the lists on phones it dragged the page past the tasks.
- `src/lib/assets/favicon.svg` was replaced by `static/favicon.svg` (+ generated PNG/ICO set).

**Verification / what is untested here**

- Web: `bun run check` / `test` / `lint` / `build` clean; `e2e-m7` (auth, pairing, rate limit,
  revoke + SSE close, Bearer, Tauri bootstrap endpoints, PWA assets, service worker + offline
  page) and a regression pass over M1–M6 flows on desktop and iPhone emulation; screenshots of
  every page on iPhone 390×844, iPad 1024×1366 / 1366×1024 and desktop (Chromium emulation —
  WebKit/Safari itself could not be run here). **Not tested**: a real iPhone/iPad install over
  HTTPS (Add to Home Screen, standalone status bar, safe areas on notch devices, SSE resume
  after backgrounding).
- Tauri: built and end-to-end tested on Linux (WebKitGTK, tauri-driver under Xvfb) — see
  `docs/TAURI.md`. The OS keychain could not be exercised headless (no Secret Service daemon):
  the test used the debug-only `LIBE_TAURI_CREDENTIALS_FILE` file store. **Not tested**: macOS
  and Windows builds/runtime, real keychains, code signing.

Fix during M7 review:

- **Auth bypass guard for remote functions**: for `/_app/remote/…` calls Kit 3 rewrites
  `event.url` from the client-supplied `x-sveltekit-pathname` header before `handle` runs, so a
  forged `/pair` would have looked public. The hook now checks the raw request path too
  (`isPublicRequest` / `isRemoteCall` in `#lib/auth.ts`); remote calls always need a device
  (401 JSON). The public `/_app/` prefix is narrowed to `/_app/immutable/`, `/_app/version.json`,
  `/_app/env.js`. No remote functions exist yet — this closes the gap before one is added.

## Tests — in-repo end-to-end suite (after M7)

- `e2e/` (Playwright, see AGENTS.md "End-to-end tests"): per-feature specs for quests, home,
  plan, focus/timer, calendar, review, auth/devices, PWA, per-page smoke (desktop + `@mobile`)
  and touch-only flows (iPhone/iPad emulation); the Tauri app spec in `e2e/tauri/`. Replaces the
  scratch scripts that used to live outside the repo.
- Runs against the production build on its own database `libe_e2e` (reset + migrated + seeded
  by the web server command), never the dev DB. Rate limits are isolated per test through
  `X-Forwarded-For` (`ADDRESS_HEADER`, as behind the HTTPS proxy). Time-dependent behaviour
  (overtime, pomodoro rollover, code expiry) is tested by shifting timestamps in the DB.
- The important tests were checked against reintroduced bugs (menu submit closing on click,
  per-quest list scope, bare `?/action` URLs, ↑/↓ crossing groups, missing SSE broadcast,
  remote-call auth bypass, …).

Fix found by the suite:

- **Tauri "Change server / Unpair…" never revoked the device on the server**: the Rust client
  sent a bodyless `DELETE /api/pair/session`, which SvelteKit's CSRF check answers with 403
  (bodyless non-GET = form submission without a same-origin `Origin`). It now sends a JSON
  body; the local unpair always worked.

## Desktop auto-update (after CI/releases)

- The Tauri app updates itself (`tauri-plugin-updater`, `src-tauri/src/updates.rs`) on an
  **update track** chosen in **Settings → Desktop app**: **Stable** or **Nightly** (modelled on
  t3code's "Update track"). Default: the track the installed build came from.
- Feed: every nightly and every stable release (`latest`) uploads its signed Tauri manifest as
  `nightly.json` / `stable.json` to the GitHub release `update-feed`; the per-release manifest is
  the asset `latest.json`. Installers' updater signatures (minisign, secret
  `TAURI_SIGNING_PRIVATE_KEY`, `requireSignedVersion`) are verified before anything installs.
- Behaviour: check 10 s after start and every 4 h, download in the background, install on
  "Restart to update" or on quit (`.deb` installs only when asked — pkexec password). Switching
  tracks installs the new track's newest build even when it is older (nightly → stable); the
  app has no data a downgrade could break.
- Decision: t3code also switches "every connected machine whose database the target release
  supports". libe's only connected machine is the server, a Docker container that cannot swap
  its own image, so Settings shows the server's version/track and which image tag
  (`:stable` / `:nightly`) puts it on the same track instead of switching it.
- Security: the paired server's pages get IPC for exactly the four `update_*` commands (runtime
  capability for that origin; the app manifest in `build.rs` makes every command
  permission-gated). The pairing commands stay local-only. (Later also `app_unpair` and
  `app_quit` — see "Desktop app without a menu bar".)

## German UI language (after desktop auto-update)

- The whole UI exists in **English** (default/fallback) and **German**. No i18n library: a
  typed in-house module `src/lib/i18n/` — `en.ts` is the source of truth (nested messages,
  functions for interpolation/plurals; its type is `Messages`), `de.ts` is typed `Messages`
  so a missing or extra key fails `bun run check`; a unit test also deep-compares the key
  structure and rejects empty strings. `index.ts`: locales, `i18n(locale)`, Intl tags
  (`en-US`, `de-DE`), `Accept-Language` parsing/negotiation (pure, unit-tested).
- **Setting**: `settings.language` = `auto | en | de` (migration `0003_ui_language`, default
  `auto`), chosen in **Settings → Language** (English / Deutsch / System default, form action
  `?/language`, validated on the server). It applies to every device; `auto` negotiates per
  request (German when `de` is preferred over `en`). `hooks.server.ts` resolves
  `locals.locale`; requests without a device (`/setup`, `/pair`, `/api/pair`) use
  `Accept-Language` only. `<html lang>` comes from `%lang%` in `app.html`.
- **Components**: `useI18n()` (`i18n/context.svelte.ts`, context created in the root layout
  from the layout data — SSR-safe, like `useTimer()`); reads are reactive, so switching the
  language re-renders without a reload.
- **Server strings**: pure validators (`quest-form.ts`, `task-form.ts`, `manual-log.ts`,
  `timer.ts`, `auth.ts`, pairing) return error **codes** (`ErrorCode` = keys of
  `Messages['errors']`); form actions and `/api/**` translate them with
  `i18n(locals.locale)` (`translateErrors` for field maps). `load` builds titles/labels in the
  request's locale.
- **Dates/numbers** go through `Intl` with `t.intl` (German: 24-hour times, `10,5 h`, ranges
  like `9.–15. Nov.`); machine formatting (ISO days, wall-clock parts) stays on fixed
  `en-US`/`en-CA` formatters. Weeks still start Monday.
- **Offline page** (cached by the service worker) renders both languages and picks one from
  `navigator.languages` on the client. The PWA manifest and seed data stay English.
- **Desktop app**: the bundled pairing screen (`src-tauri/ui/`) picks German/English from
  `navigator.languages`; Rust errors are `Problem { code, message, detail }`
  (`src-tauri/src/problem.rs`) translated by `ui/main.js`, and the pairing request forwards the
  page's languages as `Accept-Language`, so server errors arrive translated too. Update phases
  `failed` / `unavailable` carry a `code` (+ `detail`/`version`/`track`) next to the English
  text; Settings translates known codes and falls back to the text, because the remote page
  may talk to an older app. Rejected `update_*` commands still return plain English strings
  (a structured error would print `[object Object]` on older servers); Settings recognises
  the known ones. The native menu (Reload, Change server / Unpair…, Quit) stays English.
- German copy: informal „du“, glossary Quest, Backlog, Fokus, Planen (nav) / „Woche planen“,
  Rückblick, Kalender, Einstellungen, Heute, Start (Home), Pomodoro, Aufgabe (task), Sitzung
  (session), Zeit erfassen (log time), Zeitblock, koppeln / Kopplungscode (pair), Server-Passwort (setup secret, since O1),
  Update-Kanal (update track), Sonstiges (other — the one word for tasks without a quest, since
  O3b), Serie (streak; the count reads „3 Tage in Folge“), Ruhetag (rest day), überfällig
  (overdue), Symbol (a quest's icon, since O3b), Weitere Optionen (more options), Ich (the tab
  bar's account slot).
- e2e: `e2e/specs/i18n.spec.ts` (setting persists and applies, `auto` per browser locale,
  translated validation errors, German phone layout). The config pins `locale: 'en-US'`;
  the spec resets the setting to `auto` around every test.

## Command palette (after German UI language)

- **Open**: the nav's search button (every width; icon-only below 1180px, also in the phone top
  bar) or **⌘K** (Apple) / **Ctrl+K** (elsewhere, `preventDefault` so the browser's own
  shortcut doesn't fire) on every page with `AppNav` — also inside the Tauri webview, no new
  command needed. The shortcut or Esc closes it; focus goes back to the trigger (or to the
  element that had it when opened with the shortcut). Not available on `/focus` (no nav) or
  while another modal dialog is open. ⌘ vs Ctrl is decided after mount
  (`isApplePlatform`: User-Agent Client Hints, then `navigator.platform`/UA) — SSR shows
  "Ctrl", so hydration no longer keeps a wrong guess.
- **UI**: `src/lib/components/palette/CommandPalette.svelte` (rendered by `AppNav`), a native
  modal `<dialog>` like `Dialog.svelte`: search input + grouped list (Pages, Actions, Quests,
  Tasks), combobox pattern (`role=combobox` with `aria-expanded`/`aria-controls`/
  `aria-activedescendant`, `listbox` with labelled `group`s and `option`s). ↑/↓ wrap,
  Ctrl/⌘+Home/End jump, Enter runs, Shift+Enter starts focus on a task, hover sets the active
  option, click/tap runs it. Desktop: centred, 600px, 12vh from the top. Phones: full width at
  the top (`--safe-*`), height capped by the visual viewport (iOS keyboard) / `dvh`, the list
  scrolls inside. Opened by tap, `showModal()` + `input.focus()` run synchronously in the click
  handler — iOS only raises the keyboard for a focus inside the user gesture.
- **Contents**: empty query → Pages (the six sections + Settings, nav labels) and Actions;
  typing filters those client-side (`matchRank`: prefix > word start > substring) and asks the
  server for Quests and Tasks. **Actions** exist only for an active timer and only reuse what
  the app already offers: Pause / Resume (focus phases, as on the task card), Stop, and
  "Log time…" for the timer's task (`timer.logTarget`, the root layout's dialog) — all through
  `useTimer()`, never computed on the client.
- **Search**: `GET /api/search?q=` (device auth like every `/api/**`; 401 JSON otherwise) →
  `src/lib/server/search.ts`: `ILIKE` substring on task title and quest name with `%`, `_`,
  `\` escaped; open quests only, not-done tasks only (a backlog task only while its quest is
  open — closed quests' backlogs are hidden everywhere; scheduled tasks are found like Home/Plan
  show them). Recurring tasks are found as their stored row. Up to 8 per group, ranked by
  `rankTasks`/`rankQuests` in `#lib/palette.ts`: title prefix, other title match, quest-name
  match; then today/upcoming before past days and the backlog; then title. `q` is trimmed,
  whitespace-collapsed and cut to 100 chars; blank → empty groups. The response carries the
  server's `today`, so day labels and targets follow the server TZ. Client: 120 ms debounce,
  `AbortController` for stale requests, a spinner in place of the search icon, "No results" /
  a quiet error line (no console errors). The service worker still never caches `/api/**`.
- **Where a task leads** (`taskHref`): today **and backlog → Home** (Home lists today's tasks
  and the whole backlog at every width; the Plan board scrolls its backlog column out of view
  on phones); another day → `/plan?week=<monday>`, plus `&other=<day>` for tasks of kind
  `other` so the day's collapsed "Other" zone is open. After navigating, the card/row
  (`[data-task]`, now also on Home's backlog rows) is scrolled into view (also inside the
  horizontally scrolling board) and briefly outlined. Quests → `/quests/<id>`.
- **Start focus** per task: the ▶ button on each task option (tap/click) or Shift+Enter —
  exactly the task card's ▶ (`timer.start(..., { navigate: true })`, the switch dialog when
  another timer runs, then `/focus`).
- Pure logic (query normalisation, LIKE escaping, matching, ranking, targets, ↑/↓ wrapping,
  shortcut/platform detection) in `src/lib/palette.ts`, unit-tested in `palette.test.ts`.
- e2e: `e2e/specs/palette.spec.ts` — task found with its quest and Enter opens its Plan week /
  Home backlog, done tasks and closed quests not found, LIKE wildcards literal, ↑/↓ wrap +
  Enter on a page + Esc returns focus, Pause/Resume/Log time/Stop change server state,
  Shift+Enter starts focus, the touch flow (`@mobile-only`: tap → input focused, tap a result,
  no horizontal scroll), 401 without a device. Checked against reintroduced bugs (`disabled`
  trigger, unescaped `ILIKE`, the stale-`open` race of a quick second ⌘K).

## Profile (after command palette)

Phase 1 of 3 — replaces the hard-coded "L" avatar with a real profile.

- **Data**: the profile is global (single user, the same on every paired device), so it lives
  in the single `settings` row (migration `0004_profile`): `display_name` (nullable; check:
  trimmed, 1–40 characters) and `avatar_color` (a `QUEST_COLORS` key, default `amber`; the
  check list is built from `QUEST_COLORS`, so a new colour key shows up as a schema diff).
  `hooks.server.ts` reads language **and** profile in one query (`getRequestSettings`) for
  paired devices only → `locals.profile` → root layout data `profile` (null without a device:
  public pages never get the owner's name). No extra query per page.
- **Pure logic** (`src/lib/profile.ts`, unit-tested): `normalizeDisplayName` (NFC, whitespace
  collapsed, trimmed, control characters dropped, empty → `null` = no name; at most 40 **code
  points** — the unit of Postgres' `char_length` and of device names; a grapheme limit could
  accept names the check constraint rejects), `parseAvatarColor`, `initials` (first grapheme
  of the first and last word via `Intl.Segmenter`, punctuation-only words skipped,
  locale-aware upper-casing: "Anton Schmidt" → "AS", "🦊 Fox" → "🦊F"), `greetingPart`
  (5–11 morning, 12–17 afternoon, 18–22 evening, 23–4 night). Errors are `ErrorCode`s
  (`profileNameTooLong`, `profileColorInvalid`).
- **Avatar** (`components/Avatar.svelte`, sizes `sm`/`md`/`lg` from the `--avatar-*` tokens):
  initials on a circle tinted by `questColorVar(color)`; without a name a neutral lucide
  `User` icon. Decorative (`aria-hidden`) — the control around it carries the name. In the
  styleguide.
- **Nav / account menu**: the avatar is the trigger (label "Account and devices (Anton
  Schmidt)"); the menu head shows the name and "This device: <device>" below it, without a
  name the previous "Signed in as <device>". New first item **Edit profile** →
  `/settings#profile`.
- **Settings → Profile** (first section, anchor `#profile`): name field + colour swatches
  (`components/ColorSwatches.svelte`, extracted from the quest form and shared) with a live
  avatar preview; form action `?/profile` (`use:enhance`, validated on the server, errors
  translated, rejected input echoed). Saving refreshes the layout data, so the nav avatar
  updates at once; a no-JS submit also sets `locals.profile` so its response renders the
  new avatar. Blank name = no name. The name field has no `maxlength` (UTF-16 units would
  disagree with the code-point limit); the hint states the limit.
- **Home greeting**: "Good morning, Anton Schmidt" / „Guten Morgen, Anton Schmidt“ above the
  date; without a name just "Good morning". The part of the day comes from the server clock
  and `TZ` (`greetingPart`, like "today"). The full display name is used (no first-name
  guessing). German uses the name only as a vocative („…, Anton“); afternoon is „Hallo“,
  night "Still up?" / „Noch wach?“.
- **Pairing**: `/setup` shows an optional **Your name** field for the first device only
  (no active devices). The server stores it only while no name is set
  (`setDisplayNameIfUnset`, `ON CONFLICT … WHERE display_name IS NULL`) — a public form
  never overwrites a name, and the public pages never render it (the field is never
  prefilled).
- **Welcome**: a successful `/setup` or `/pair` form sets a short-lived httpOnly cookie
  `libe_welcome`; the root layout's `load` consumes it (read + delete) on the first
  authenticated page — whatever `next` the pairing redirects to — and the `(app)` layout
  shows "Welcome, Anton — this device is now paired." until dismissed or the next
  navigation. The Tauri shell (`/api/pair` + `/pair/session`) gets no welcome:
  `/pair/session` also runs on every app start, so it can't tell a fresh pairing apart.
- **Command palette**: an always-present **Edit profile** action (after the timer actions)
  → `/settings#profile`.
- e2e: `e2e/specs/profile.spec.ts` — name + colour saved through the palette's "Edit profile"
  → DB row, nav avatar without and after a reload, account menu, Home greeting (`@mobile`);
  40 chars pass / 41 rejected / whitespace-only clears; first `/setup` with "Your name" sets
  the profile and welcomes once; `/setup` never overwrites a name nor shows it. The profile is
  reset (no name, amber) around every test. Checked against reintroduced bugs (overwrite
  from `/setup`, welcome cookie not consumed).

### Phase 2 — emoji avatar, daily goal, the name in Focus and Review (done)

- **Data** (migration `0005_profile_extras`, same `settings` row): `avatar_emoji` (nullable;
  check: 1–16 code points, trimmed — one emoji grapheme can be several code points, the app
  checks "exactly one emoji") and `daily_goal_min` (nullable = no goal; check: 15–960 and a
  multiple of 15, built from `DAILY_GOAL_MIN/MAX/STEP`). `getRequestSettings` reads both in
  the existing per-request query → `locals.profile.avatarEmoji`, `locals.dailyGoalMin` → root
  layout data.
- **Emoji avatar**: Settings → Profile has "Avatar shows: Initials | Emoji"; Emoji shows the
  shared `components/EmojiPicker.svelte` (text field + suggestions, extracted from the quest
  form; avatar suggestions `AVATAR_EMOJIS`). Validated like quest icons (`isSingleEmoji`) by
  `parseAvatarEmoji` (`profileEmojiInvalid`); "Initials" or a blank field stores `null`
  (initials). `Avatar` shows the emoji on the colour-tinted circle; without emoji and name the
  neutral icon as before. Stored values that aren't one emoji read as `null`.
- **Daily goal** (`#lib/daily-goal.ts`, unit-tested): Settings → **Daily goal** (own section
  after Profile, anchor `#goal`, action `?/goal`): a select of presets (30 min, 1–6 h, 8 h),
  "No daily goal" and "Custom…" (hours + quarter-hour minutes; without JS both are shown).
  Rule: 15 min – 16 h in 15-minute steps (`dailyGoalInvalid`, server-side; the custom field
  echoes rejected input). Decision: quarter hours keep the select/ring meaningful and make
  Phase 3's "goal met" unambiguous; 16 h is a generous ceiling for a waking day.
- **Logged today**: one definition for Home and the ring — `server/stats.ts` → `todayLog()`:
  completed sessions started today in the server TZ (`dayWeekMinutes`, same attribution as
  the week/Review), one query on `sessions_started_idx`, returned with the day's bounds as
  root layout data `todayLog` (Home's own `todayMin` was dropped; `homeTime` keeps the
  week/per-task totals). The root layout reads no tracked `url` property, so it re-runs
  only on `refreshAll` — after form actions, timer session changes (the timer store already
  refreshes then), Log time and calendar edits.
- **Live**: the server number never includes the active session; the client adds its
  running time from the snapshot (`runningSpan(timer.timer, timer.view)` → `liveLoggedMin`,
  counted only when it started today — like Home; after midnight yesterday's number drops
  until the next refresh). Completing/stopping changes the session → `refreshAll` → the
  time moves into the server number, so nothing is counted twice (e2e-checked).
- **Ring** (`Avatar` prop `ring`): thin SVG ring outside the circle (`--avatar-ring-*`,
  `--goal-*` tokens): accent on an accent-tinted track, reached = full green ring with a
  soft glow. Nav avatar on all widths (also the phone top bar); no goal → no ring. Text
  alternative: the account button's name gets the progress — "Account and devices (Anton),
  2 h 10 min of 4 h today" / „… 2 h 10 min von 4 h heute“ (whole minutes, rounded down).
- **Home**: the today stat moves live too and reads "2.2h / 4h today" with a goal.
- **Focus**: one small status line under the state: focus-mode countdown reached → "Nice
  work, Anton — 25 minutes done." / „Stark, Anton – 25 Minuten geschafft.“; pomodoro short
  break → "Take a breath, Anton." / „Kurz durchatmen, Anton.“; long break → "Long break —
  well earned, Anton." Without a name the same sentences without it.
- **Review**: the subtitle is personal — "Your week, Anton." + one sentence from the data the
  page has (`weekSummary` / `weekSummaryText` in `#lib/review.ts`): "12.5h logged — 2.1h
  more than last week." (the same days of last week for the current week; "about the same"
  when the difference rounds to 0.0h; "Nothing logged yet." / "It hasn’t started yet.").
  Vocative only, never genitive. The generic subtitle was dropped.
- e2e (`profile.spec.ts`): emoji + 1 h goal saved in Settings → DB row; after a reload the
  avatar shows 🦊 and its name reports the progress from a DB session; a running timer
  (shifted in the DB, pushed by a pause) raises it without reload and completing it keeps
  the value (`@mobile`: ring visible in the phone top bar, no horizontal scroll); 16 h
  passes, 16 h 15 min is rejected, "No daily goal" removes the ring, a non-emoji is
  rejected; Review subtitle and Focus line carry the name. Checked against reintroduced
  bugs (running time not added; layout not refreshed after the timer completes).

### Phase 3 — streaks (done)

- **Rule** (`#lib/streak.ts`, unit-tested): a **streak day** reaches the threshold — the daily
  goal when one is set, otherwise `STREAK_FALLBACK_MIN` = 25 min. A day's logged minutes have
  exactly `todayLog()`'s definition: completed sessions attributed to the day of `started_at`
  in the server TZ, `sessionMinutes` (span − pauses, `duration_min` fallback) —
  `loggedMinutesByDay` in `stats-core.ts`, next to `dayWeekMinutes`. Decision: every past day
  is judged with the **current** threshold (no goal history), so changing the goal recounts
  the whole streak; Settings says so. Comparison `min ≥ threshold` = the goal ring's "done".
- **Rest days**: `settings.streak_rest_days` (migration `0006_streak_rest_days`), a `smallint`
  weekday bitmask (bit 0 = Monday … bit 6 = Sunday), default 0; check `0 … 126` (= any set
  except all seven → at most `MAX_REST_DAYS` = 6, built from `REST_MASK_MAX`). A rest day below
  the threshold neither breaks nor extends a streak; one that reaches it extends it (+1).
- **Current / longest**: consecutive streak days ending today or yesterday, rest days in
  between skipped; today below the threshold doesn't break it yet. States: `active` (today
  counts), `pending` (alive, today not reached — "at risk" until midnight), `rest` (alive,
  today is a rest day below the threshold: nothing to do — an addition to the planned three),
  `none`. Longest = max over all history with the same rules (the current run included).
  `streakBase` walks only the qualifying days (a gap continues iff every day in it is a rest
  day; ≥ 7 days always breaks); day math via `#lib/dates.ts` (DST-safe, tested).
- **Server / live**: `server/streak.ts` → `loadStreakBase(goal, restMask)`: one query over the
  minimal columns of completed sessions started **before today**, bucketed in TS (SQL grouping
  would duplicate the duration rule with a different precision). Root layout data `streak`
  (`StreakBase`: day, threshold, `fromGoal`, rest mask, streak through yesterday, longest
  before today; null without a device), next to `todayLog`; the layout still re-runs only on
  `refreshAll`. `getRequestSettings` reads the rest days in the existing per-request query
  (`locals.streakRestDays`). Clients compose with `pageStreak(base, todayLog, runningSpan,
serverNow)` → `liveStreak(base, liveLoggedMin(…))`: a running session crossing the
  threshold flips `pending → active` without a reload. After midnight with stale data the base
  rolls over a day (`nextStreakBase`).
- **Milestones**: 7, 30, 100, 365 days, then every further hundred and every full year
  (`isStreakMilestone`). Shown only while today counts and the current streak _is_ the
  milestone — i.e. only on the day it is reached ("once" without extra persistence; the next
  day it reads 7 while pending, then 8).
- **UI**: Home header — a streak chip (lucide `Flame`, lit when today counts; screen readers
  get ", today counts") with a hint below: pending "Log 20 min more today to keep it" (live,
  rounded up), rest "Rest day — your streak is safe", none "No streak yet" / "Log 25 min today
  to start one"; on the milestone day the chip becomes "7-day streak — nice, Anton!"
  (`role=status`, vocative only, no name → no name). Below 720 px the streak gets its own row
  under today / this week. **Account menu** head: "12-day streak · Longest: 20 days".
  **Review** per-day card: "Longest streak: N days" in its head and a marker row under the
  weekdays (flame = streak day, moon = rest day, dot = missed, ring = today not yet, outline =
  upcoming); the day's accessible name ends with the marker ("; rest day"). Markers judge the
  day's total (quest + other) although the bars show quest hours. **Settings → Streak**
  (after Daily goal, anchor `#streak`, action `?/streak`): which threshold applies now, the
  "judged with the current goal" note, seven weekday toggles (`restDay` checkboxes, one row
  down to phone width, 44 px tall on touch), server validation (`streakRestDayInvalid`,
  `streakRestDaysTooMany`), rejected input echoed.
- **German**: „12 Tage in Folge“, Serie (streak), Ruhetag (rest day).
- e2e (`e2e/specs/streak.spec.ts`): the goal is set to 16 h so only the spec's own 16-hour
  sessions count; its tasks (sessions cascade), the goal, rest days and timer are reset around
  every test. History → Home chip/hint, account menu and Review longest (`@mobile`); seven
  rest days rejected, the gap's weekday saved → DB row, reload, Home "2-day streak", Review
  marks the rest day; a running timer (shifted in the DB) crosses the goal → `active` and the
  7-day milestone without reload, still after completing + reload. Checked against
  reintroduced bugs (rest days ignored; running time not added).

## Desktop app without a menu bar (after streaks)

- On Linux and Windows the Tauri window stacked three bars: the OS title bar, a native menu
  bar with a single "libe" menu, and libe's own nav. The menu is now built **only on macOS**
  (`#[cfg(target_os = "macos")]` in `src-tauri/src/lib.rs`), where it lives in the global menu
  bar and carries the Edit menu that ⌘C/⌘V need — unchanged there (⌘R, ⌘Q, Change server /
  Unpair…). Copy/paste on Linux/Windows never needed a menu.
- **Change server / Unpair…** moved to **Settings → Desktop app** on every platform (inline
  confirmation, no `confirm()`): the new command `app_unpair` runs exactly the menu's flow
  (revoke on the server, delete the keychain entry, clear browsing data, pairing page with the
  server pre-filled). An older app rejects the command through Tauri's ACL ("… not allowed");
  Settings recognises that (`unpairErrorText`) and points to the old app's menu instead.
- **Ctrl+R / Ctrl+Q** on Linux/Windows: decision — a Rust-side initialization script
  (`src-tauri/src/shortcuts.js`, `WebviewWindowBuilder::initialization_script`, compiled in on
  non-macOS only) rather than a keydown handler in the server's pages. It runs on every page
  of the webview — the bundled pairing page and the server's pages (old servers included) —
  so no platform detection on the server and no double handling on macOS, where the menu's
  accelerators keep the job. Ctrl+R calls `location.reload()`, Ctrl+Q the new command
  `app_quit` (`app.exit(0)`, so a downloaded update still installs on quit).
- The paired server's runtime capability grew from the four `update_*` commands to
  `SERVER_COMMANDS` (+ `app_unpair`, `app_quit`; `allow_server_commands`). The pairing
  commands stay local-only.
- e2e (`e2e/tauri/tauri.spec.ts`): no menu bar (`outerHeight − innerHeight` = 0; 27 px with
  the old GTK menu bar), Settings → Change server / Unpair… (Cancel keeps the pairing; Unpair →
  pairing page, server pre-filled, credentials gone, device revoked), Ctrl+R reloads and Ctrl+Q
  quits on libe's pages and on the pairing page. Checked against the previous app build (menu
  bar present; the Settings button only shows the "use the menu" hint) and a build without the
  script (shortcuts dead). Windows behaviour (WebView2's own Ctrl+R) is not verified here.

## NixOS desktop package (after the menu-bar change)

- The repository is a **flake** (`flake.nix`, package `nix/libe-desktop.nix`, user docs
  `docs/NIXOS.md`) for the **desktop client only**, `x86_64-linux` + `aarch64-linux`:
  `packages.<system>.{desktop,default}`, `apps`, `checks` (the package), `formatter` (nixfmt),
  `nixConfig` with the binary cache `libe.cachix.org`. The server stays a Docker image.
- Decision — nixpkgs: pinned (`flake.lock`) to **`nixos-26.05`**, the current stable NixOS
  branch: it has everything the client needs (`cargo-tauri.hook`, WebKitGTK 4.1, Rust 1.95 ≥
  the dependencies' MSRV 1.90), its channel only advances once Hydra built it, so WebKitGTK & co.
  come from `cache.nixos.org` and only libe itself is in our cache. Unstable would move faster
  than the cache helps; bump the pin in a PR.
- Build: `rustPlatform.buildRustPackage` + `cargo-tauri.hook`
  (`cargo tauri build --bundles deb`; the `.deb`'s `usr/` becomes `$out`: `bin/libe`, desktop
  entry, hicolor icons),
  `wrapGAppsHook3` (GIO modules: `glib-networking` for HTTPS, GTK/WebKit data), `dbus` for the
  Secret Service. `cargoLock.lockFile` = `src-tauri/Cargo.lock` (no hash to maintain). Source
  is a `lib.fileset` of the client's files, so web-app commits don't change release
  derivations. No Bun / node_modules (the client UI is `src-tauri/ui/`). Unit tests are not run
  in the derivation (the release profile's `panic = "abort"` would rebuild every dependency);
  `checks.yml` now runs `cargo test` in the Tauri job instead.
- Decision — version: the app shows tauri.conf.json's `version`. Release builds come from a
  **Nix commit** on top of the released commit with `set-version` applied and
  `nix/release.json` (version, channel, tag, released commit), created deterministically by
  `nix-commit` in `release.ts` (author and dates from the released commit), so every job and
  the channel branch share one SHA. Any other commit reports
  `<committed version>+src.<7 chars of the client source's store hash>` (semver build
  metadata, accepted by Tauri, `Track::of_version` → stable). Originally `+git.<shortRev>`;
  changed because it made every commit a new derivation, so CI rebuilt the client (~6 min)
  even for docs-only PRs. With the source hash, commits that leave `src-tauri/` alone share
  main's derivation, which `checks.yml` pushes to Cachix on every push to `main`. The `v*` release tags themselves stay on
  `main`'s commits (the nightly gate and the stable promotion compare them with `main`).
- Decision — updates: Nix builds are compiled with `LIBE_DISTRIBUTION=nix`
  (`updates::Distribution`): no background checks, `update_check` is a no-op,
  `update_set_track` fails, phase `unavailable` / code `nixManaged`, `managedBy: "nix"` in
  `update_state`. Settings → Desktop app hides "Check for updates" and the tracks and explains
  `nix flake update libe` and the `channel/*` inputs (EN/DE). Without it, `needs_password()`
  would have treated the build as a `.deb` and tried `pkexec` installs into the read-only store.
- Release pipeline: after a nightly or plain stable release (`nixTrack`; previews and `-rc`
  never), `release.yml` builds the Nix commit natively on `ubuntu-24.04` and
  `ubuntu-24.04-arm`, `cachix push`es the result (Cachix skips what `cache.nixos.org` has),
  then `nix-channel` verifies both store paths on libe.cachix.org and atomically force-pushes
  `channel/<track>` + tags `nix-v<version>` (`nix-publish`; never backwards, `nixChannelMove`)
  and appends the pin to the release notes, whose NixOS block names the channel. A failed Nix
  job leaves the channel on the previous release and doesn't block anything else.
- CI: `checks.yml` job "Nix flake" (`nix flake check` + inspecting the package; Cachix
  read-only, no secret), so nightlies are gated on it like on every other check.
- e2e (`e2e/tauri/tauri.spec.ts`): the debug build run as a Nix build (`LIBE_DISTRIBUTION=nix`
  at runtime, debug only, second tauri-driver): Settings shows the Nix block and no tracks /
  check button; `update_check` stays `unavailable`/`nixManaged`, `update_set_track` is refused.

## Mobile polish — Phase 1 (after NixOS desktop package)

Goal: the iPhone home-screen PWA should always make the next tap obvious (visual hierarchy),
feel tactile (micro-interactions) and show less on phones (no data overload). Phase 2 (Plan /
Calendar day view with swipe) and Phase 3 (Web Push + app badge) are not part of this.

- **Motion foundation**: tokens `--ease-out` / `--ease-in` / `--ease-spring`, `--dur-press`,
  `--dur-pop`, `--dur-sheet` / `--dur-sheet-out`, `--dur-tick`, `--dur-pulse`, `--press-scale(-card)`,
  `--press-dim` (`tokens.css`). `#lib/motion.ts`: CSS time/easing parsing (`parseCssTime`,
  `cssEasing` incl. a cubic-Bézier solver — Svelte transitions get the _token_ easing),
  `motionMs(token)` (0 under reduced motion), transitions `rise` (bars from the bottom),
  `tickIn` (changed numbers), `fadeScale`. A global `prefers-reduced-motion` rule ends every CSS
  animation/transition at once (0.01 ms, so `animationend` still fires).
- **Micro-interactions**: touch press feedback for every button/summary (`scale` + `filter`
  on `:active`, `(hover: none) and (pointer: coarse)` only; `scale` is a separate property so
  component `transform`s survive; the root layout adds a passive `touchstart` listener, without
  which iOS Safari never applies `:active`); `-webkit-touch-callout: none` / `user-select: none`
  on controls and the tab bar, `touch-action: manipulation` on all controls. Completing a task
  (`DayTaskCard`, `TaskRow`): the check pops on the tap; once the form action has answered
  and the page data says "done", the tick draws, the title is struck through (`.strike`, a
  background line — `text-decoration` can't animate) and the row settles to its done opacity.
  The tab bar's active item gets a soft accent pill that springs in. Home's "today" value rises
  in when it changes (`{#key}` + `tickIn`, not on the first render).
- **Dialog → bottom sheet** (`Dialog.svelte`, ≤ 720px): full width, anchored to the bottom of
  the _visual_ viewport (`--kb` = keyboard height from `visualViewport`, height capped by
  `--vvh`/`dvh` — never `100vh`), top corners rounded, grab handle, slides up / down (backdrop
  fades), the body scrolls (page scroll locked via `html:has(dialog[open])`), safe-area padding.
  Drag the header down to dismiss (pointer events; pure rules in `#lib/sheet.ts`: 1:1 down,
  rubber band up, dismiss after 30 % of the height — at most 160 px — or a flick ≥ 0.5 px/ms
  over ≥ 24 px). Every way of closing (✕, Esc via `cancel`, backdrop, drag, parent) sets `open`
  false and plays the exit animation before `close()`; `onclosed` fires afterwards (dialog
  wrappers that unmount use it instead of an effect on `open`). Button rows carry
  `.dialog-actions` → sticky at the sheet's bottom, primary button full width, spacers/hints
  dropped. Desktop keeps the centred modal (plus a short fade/scale; the header now stays put
  while a long body scrolls).
- **Mini-player** (`MiniPlayer.svelte`, rendered by the `(app)` layout, phones only): fixed
  above the tab bar while a timer is active — quest colour edge, task title, `timer.view.display`
  (+ state when paused / in a break), quest-coloured progress line for countdowns/pomodoro, one
  44 px button: `primaryTimerAction(view)` (`#lib/timer.ts`: pause / resume / start the waiting
  phase / skip the break) → `timer.command`. The rest of the bar links to `/focus`. Rises in / sinks
  out (`rise`); `main.with-player` pads for it (`--player-h`). The top bar's timer chip is hidden
  ≤ 720px (still shown on tablets/desktop). Never on `/focus` (outside the group). A `demo` prop
  renders a static bar for `/styleguide`.
- **Home on phones**: a **Next up** card (`home/NextUpCard.svelte`, `#lib/next-up.ts`) while no
  timer is active — the first open quest task of today in list order, else the first open
  "other" task — with its quest pill, planned minutes and one full-width **Start focus** (the
  task card's `timer.start`, but staying on Home: the card fades and the mini-player rises).
  No open task: "Nothing planned for today" / "All done for today" with **Add a task**, which
  focuses (and scrolls to) the quest-work input. Header folded into one row: today vs goal + the
  streak chip; the streak hint and the week budget bar are hidden on phones. Page titles are
  32 px on phones (`--fs-2xl-phone`), `PageHeader` spacing tighter.
  Add-task forms (`TaskAddForm`, not the compact plan-column variant) disclose progressively on
  phones: idle they are picker + input; duration and Top/Bottom appear once the form has focus
  or a title (pure CSS, `:focus-within` / `:placeholder-shown`).
- **Other pages (phone lens)**: Focus — when paused, **Resume** is the primary button (running:
  the clock leads, Pause/Complete stay secondary). Review — the three KPI cards are compact
  (smaller number and padding). Quest form — icon picker and budget stack (the emoji grid
  overlapped the budget field at 390 px), the "change later" hint gives way to the buttons.
  Quests, Settings, Calendar, Plan unchanged.
- **Wake lock**: `/focus` holds a Screen Wake Lock while the clock runs (focus or break) and the
  page is visible (`shouldHoldWakeLock`), releases on pause/stop/leave, re-acquires on
  `visibilitychange`. `ScreenWakeLock` (`#lib/wake-lock.ts`) is feature-detected, serialises
  requests and swallows denials — never a console error.
- **Fix in passing**: `BlockDialog` cancel now also clears Home's `blockEditor` (via
  `onclosed`); before, only a successful submit did.
- Decisions: Next up and the mini-player are **phones only** (iPad/desktop show lists, the
  chip and the task cards' ▶ side by side; a second "now" there would compete). The sheet is
  driven by CSS animations + one small effect rather than a library; JS transitions read the
  token easing instead of `svelte/easing`. Press feedback uses `scale` (not `transform`) so it
  never fights component transforms.
- Tests: unit — `motion.test.ts`, `sheet.test.ts`, `next-up.test.ts`, `wake-lock.test.ts`,
  `primaryTimerAction` in `timer.test.ts`. e2e `e2e/specs/mobile-polish.spec.ts` (`@mobile`, iPhone;
  skipped above 720px): Next up → Start focus stays on Home, DB session for that task, mini-player
  shows it; pause from the mini-player persists across a reload; tapping the bar opens Focus;
  a quest sheet dragged down closes without saving and still submits (DB row). Both checked
  against reintroduced bugs (no dismiss on release, a button that always resumes).
- **WebKit in Playwright**: tried (`playwright install webkit`, Playwright 1.56.1). The browser
  downloads but does not launch here without system packages (`libgtk-4`, `libgraphene`,
  `libwoff2dec`, `libevent`, `libgstcodecparsers`, `libavif`), so no `mobile-webkit` project
  was added; CI deliberately installs no system packages for e2e.
- **Not tested**: a real iPhone (keyboard vs. sheet — the `visualViewport` offset logic is only
  approximated in Chromium by a smaller viewport, haptics-like feel of the press feedback, the
  wake lock on iOS 16.4+ standalone, `:active` with the touch listener), Safari's rendering of
  the sheet/backdrop animations and `box-decoration-break` strike-through.

## Mobile polish — Phase 2 (after Phase 1)

Goal: Plan and Calendar on phones (≤ 720px) show **one day** instead of a sideways-scrolling
week — the next tap is obvious, nothing is tiny, and moving between days is a swipe. Desktop
and iPad (> 720px) are unchanged. Phase 3 (Web Push + app badge) is not part of this.

- **Day strip** (`components/DayStrip.svelte`, phones only): Mon–Sun of the shown week under the
  page header (weekday initial + date), today's number amber, the selected day on one pill that
  slides between days (`--dur-pop`), press feedback on the days (`.press`). At most one dot per
  day — Plan: open tasks, Calendar: logged time (incl. the running session); no counts. Links
  work without JS; with JS the page navigates in place (`goto(…, { reset: false, replace: true })`).
  Week navigation stays the existing header controls (Plan's ‹ › Today, Calendar's `WeekNav`);
  week links drop `?day=`.
- **`?day=YYYY-MM-DD`** (pure `#lib/day-view.ts`): `resolveDay` — a valid day inside the shown
  week, else today if the week contains it, else its Monday; `stepDay` (±1, crossing into the
  previous/next week); `dayHref` sets `day` + `week`, keeps every other param, drops
  week-scoped ones (Plan's `other`) when the week changes; `dayDirection`. The server never reads
  `?day=` (Kit tracks search params per key), so changing the day inside a week re-runs no
  `load`; forms keep it through `formAction()`.
- **Swipe** (`components/DaySwipe.svelte`, pure rules `#lib/swipe.ts`): pointer events on the
  day content, `touch-action: pan-y pinch-zoom` (the browser keeps vertical scrolling; a
  vertical start cancels the pointer), the axis locks after 10 px (`swipeAxis`: vertical or
  diagonal starts stay scrolls — matters for mouse/pen), the content follows the finger at 35 %
  (max 72 px, `swipeFollow`), a release steps after 80 px / 25 % of the width or a flick
  ≥ 0.4 px/ms over ≥ 30 px in the drag direction (`swipeStep`, velocity via `releaseVelocity`
  from `#lib/sheet.ts`). The new day slides in from its side (WAAPI, `--day-slide`,
  `--dur-pop`, `--ease-out`) — also after a strip tap or week arrow. The click a mouse would
  fire after a swipe is swallowed; native drag (`-webkit-user-drag`) is off inside the area on
  phones; the area is at least `--day-swipe-min-h` tall so an empty day is swipeable below its
  content; `overflow-x: clip` keeps the page from scrolling sideways. Off under reduced motion
  (`motionMs` → 0, global CSS rule).
- **Plan on phones**: the board renders all columns as before, CSS shows only the selected one
  full width (`PlanColumn selected`: no column chrome, the heading kept for screen readers, no
  past-day dimming, the page scrolls instead of the column); the scroll-to-today board effect
  is skipped on phones. Cards put ▶ ↑ ↓ ⋯ into the meta row (one row less, nothing removed;
  a long quest pill ellipsises first). An empty day shows "Nothing planned for Wednesday" with a
  primary **Add a task** that focuses the day's add input. Drag & drop stays desktop-only (tap
  equivalents: ⋯ Move to day / previous / next day, the backlog sheet).
- **Backlog sheet**: the rail is hidden on phones; a secondary **Backlog** button next to the
  quest filter opens it in the bottom sheet (`Dialog`, content mounted on open, unmounted via
  `onclosed`). `BacklogColumn sheet day={selected}`: no rail chrome / DnD; each open row has a
  direct **↧ <weekday>** button and its ⋯ menu says "Move to <selected day>" instead of "today"
  (desktop rail unchanged); rows pulled out fade away (`fadeScale`, sheet only); add-to-backlog
  with the quest picker works inside the sheet.
- **Calendar on phones**: `WeekGrid` takes `selected` and `--days` (columns = `days.length`);
  on phones CSS shows the selected column full width (no min-width, no sideways scrolling),
  the header line is "Thu 19 ………… 1h 15m", the now line only on today, the week totals/bar in
  the page header are hidden (the day total is in the grid). Overlap lanes, plan overlay, tap an
  empty slot → "Log time" sheet, tap a session → edit sheet: unchanged. Scroll target per shown
  day: ~1 h before now on today, else 30 min before the day's first entry, else 8:00.
- **Menus in sheets** (`Menu.svelte`): inside an open modal `<dialog>` (everything outside is
  inert, the dialog is in the top layer, the phone sheet is transformed and clips) the popover
  is appended to the dialog and opened with `showPopover()` (its own top-layer entry, fixed to
  the viewport); outside dialogs it stays portalled into `<body>`.
- **Fix in passing**: the calendar slot button took the global touch press `scale` — the whole
  day column shrank under the finger before the click, so a tap at 13:22 logged from 13:00 on
  phones. `.slot:active` now has no scale (a faint tint instead).
- Decisions: **CSS selects the day, not JS** — the server can't know the viewport, so rendering
  7 columns and hiding 6 on phones avoids a hydration switch / flash and leaves desktop
  unchanged (the cost: the week's other columns are in the DOM, hidden).
  `?day=` is client-only and normalised in the pure helper. Day changes use `replace` (the
  back button leaves the page instead of stepping through days); week links push as before.
  Strip pill colour is `--surface-2` (the accent is reserved for today and the primary action).
- Tests: unit — `day-view.test.ts` (clamping/defaults, steps across week/month/year/DST,
  hrefs keep/drop params), `swipe.test.ts` (axis lock, follow, step thresholds, flicks). e2e
  `e2e/specs/day-view.spec.ts` (`@mobile`, iPhone; skipped above 720px): strip → that day's
  tasks, `?day=` survives a reload, adding lands on that day (DB) and stays there; touch swipe
  left on Sunday → next week's Monday (URL `week` + `day`) and back, a vertical touch scroll
  and a vertical-first mouse drag keep the day; backlog sheet moves a task to the selected day
  (DB); Calendar strip → Thursday, one slot column, tap at 13:22 logs 13:15 there (DB), shown
  after reload. Touch gestures use CDP `Input.dispatchTouchEvent` (Chromium;
  `synthesizeScrollGesture` didn't scroll here). Checked against reintroduced bugs: ignoring
  `?day=` (strip/add/sheet tests fail), no axis lock (swipe test fails), the slot press scale
  (calendar test fails).
- **Not tested**: a real iPhone (swipe feel and the pan-y hand-off in iOS Safari/standalone,
  `overflow-x: clip` support is iOS 16+), iOS long-press drag on cards (disabled by
  `-webkit-user-drag: none` on phones — unverified on WebKit), the slide-in under a slow
  cross-week load (the content waits aside until the new week renders).

## Mobile polish — floating tab bar (after Phase 2)

Goal: the phone tab bar was wide and text-heavy (six labelled tabs edge to edge). Phones
(≤ 720px) now get a compact floating capsule like current iOS apps; desktop/tablet (> 720px)
keep the top bar exactly as before (incl. Focus and the avatar menu top-right).

- **Capsule** (`AppNav.svelte`, same `<nav aria-label="Main">` as the desktop links): fixed,
  inset `--tabbar-inset` from the sides and `--tabbar-lift` from the bottom (`max(12px,
safe-bottom − 8px)`, so it sits just above the home indicator), at most `--tabbar-max-w`
  wide, `--tabbar-h` tall, fully rounded. Translucent "glass" (`--glass-bg` +
  `backdrop-filter: var(--glass-blur)`, solid `--glass-bg-solid` via `@supports not`), hairline
  `--glass-border`, `--shadow-float`; content scrolls visibly underneath.
- **Slots**: Home, Plan, Calendar, Quests, Review (icons only, `--tab-icon`; the labels stay in
  the DOM as visually hidden text, so every link keeps its translated accessible name and
  `aria-current="page"`), then the **avatar** (`Avatar sm` with the daily-goal ring) as a link
  to `/settings` filling its slot (accessible name = the account label, `aria-current` there).
  Phones have **no account menu** (owner's decision, 2026-11-22: one tap to Settings beats a
  menu whose three items all lead there; pairing is Settings → Devices, the streak is on Home).
  Desktop/iPad keep the top-bar avatar's menu. The top bar on phones keeps brand + search
  (`--nav-h-compact` 56px).
- **Active indicator**: one pill (`--tab-pill`, a soft light tint) that slides between slots
  (`translateX(index × slot width)`, `--dur-sheet` + `--ease-spring`); the active icon turns
  `--text` with a heavier stroke, the others stay muted. `activeTab()` (`#lib/nav.ts`): the
  index in `TAB_ITEMS`, the avatar slot on `/settings` (where the avatar leads), else
  -1 → the pill fades out (`fadeScale`) and fades back in where it belongs. Press feedback
  shrinks the icon (`--press-scale`), the avatar likewise. Under
  reduced motion the pill jumps (global rule + `motionMs` → 0).
- **Mini-player**: floats a `--space-2` gap above the capsule with the same insets, max width
  and glass; capsule-shaped (`--player-h` 56px), the quest colour as a short bar at the start,
  the progress line inset from the rounded ends. `main` pads for capsule + lift (+ player +
  gap while a timer is active). z-order unchanged: dialogs/palette (top layer) > menus (40) >
  tab bar (20) > mini-player (19).
- Decisions: **Focus is not a phone tab** — the Focus page is about the running timer, and
  on phones that is already the mini-player (tap → Focus), Home's Next up card, ▶ on task
  cards and the command palette (which lists Focus among its pages, so nothing new was added
  to the account menu). Five sections + avatar fit 375px without labels; a sixth icon would
  make every slot narrower for the least-needed destination. The pill is neutral, not amber:
  the accent stays reserved for today and the primary action (as in the day strip).
  `/settings` rests the pill on the avatar instead of hiding it — it is where the avatar leads.
- Tests: unit — `nav.test.ts` (`TAB_ITEMS` without Focus, `activeTab` indices, the avatar
  slot, no slot). e2e `mobile.spec.ts` (`@mobile-only`, iPhone): the five tabs navigate by
  accessible name with `aria-current` on exactly one; the tab-bar avatar opens Settings
  directly (no menu) and carries `aria-current` there. `i18n.spec.ts` (phones): the German
  accessible names navigate (replaces the old "labels aren't ellipsised" check — there are no
  visible labels now). Profile/streak `@mobile` tests find the avatar as button or link (the
  hidden one isn't in the accessibility tree) and open the account menu only above 720px. Checked against reintroduced bugs: labels `display: none` (no accessible names: tab-bar and
  German tests fail).
- **Not tested**: a real iPhone — `backdrop-filter` in iOS Safari/standalone (headless
  Chromium only renders the blur with GPU flags; the shots use them), the lift above the
  home indicator with a real `safe-area-inset-bottom`, the pill spring's feel, landscape.

## Mobile polish — Phase 3: Web Push + app badge (after the floating tab bar)

Goal: the timer runs on the server, but on the iPhone a phase end was only noticed while the
app was open. Home-screen web apps receive Web Push since iOS 16.4: every device that opted in
now gets a short notification when a timer phase ends, and the app icon shows today's open
tasks.

- **Keys, no setup**: the VAPID key pair (P-256) is generated on first use and stored in the
  new single-row table `push_config` (migration `0007_web_push`) — not in `settings`, whose
  rows are read with `select()` on every timer operation and are preferences, not secrets.
  The VAPID `sub` is the app origin as the subscribe request saw it (`url.origin`, which
  adapter-node derives from `ORIGIN` / `PROTOCOL_HEADER`; Apple accepts an https subject),
  `mailto:libe@localhost` until the first subscription. No new required env var.
- **Subscriptions** (`push_subscriptions`): one per device (unique `device_id`; re-subscribing
  replaces it, an endpoint another device row held is taken over), `locale` = the device's
  language at subscribe time (used while `settings.language` is `auto` — better than the
  "English for auto" fallback, since each device negotiated its own language), success/failure
  timestamps + last failure status. `revokeDevice()` deletes the device's subscriptions
  (revoked devices keep their row, so the FK cascade alone wouldn't).
- **SSRF guard** (`isAllowedPushEndpoint`, `#lib/push.ts`): only `https:` on the default port,
  no credentials, ≤ 2048 chars, hosts `web.push.apple.com`, `fcm.googleapis.com`,
  `updates.push.services.mozilla.com` and the suffixes `*.push.apple.com`,
  `*.push.services.mozilla.com`, `*.notify.windows.com`. Checked on subscribe and again before
  every send. `LIBE_PUSH_TEST_ENDPOINT_ORIGIN` (optional, loopback origins only, unset in
  production) adds exactly one origin for the e2e fake push service.
- **Sending** (`server/push.ts`, `server/push-crypto.ts`): hand-written with WebCrypto —
  VAPID ES256 JWT (12 h expiry, `aud` = push service origin) and RFC 8291 `aes128gcm` (fresh
  salt + ephemeral ECDH key per message, single 4096-byte record). `web-push` 3.6.7 was
  checked under Bun (its `aes128gcm` output decrypts with the test decryptor, its VAPID header
  verifies) but not used: its `sendNotification` always goes through Node's `https` (no plain
  http fake endpoint), it pulls five transitive deps, and 4.0.0 was two weeks old. Ours
  reproduces the RFC 8291 example byte for byte (unit test). Headers: `TTL: 300` for phase
  ends (a late "Break over" is noise; 60 for the test), `Urgency: high`, `Topic: libe-timer`
  (the push service replaces an undelivered older one). 2xx → `last_success_at`; 404/410 →
  subscription deleted; other status / network error → `last_failure_at` + status, one log
  line with the host only, no retries. 10 s timeout. Never throws.
- **Which moments** (`nextPushEvent`, `lastPhaseEnd`, pure, tested):
  - focus countdown reaches its planned minutes (it keeps running as overtime) → once,
    key `<session id>:countdown`;
  - pomodoro focus round ends → `breakStarted` (auto-start: the break runs) or `breakWaiting`
    (it waits for "Start break"); key `<run id>:<round>:focus`;
  - pomodoro break ends → `focusStarted` (auto-start after a short break) or `focusWaiting`
    (no auto-start, and always after a long break); key `<run id>:<round>:<break phase>`;
  - nothing for stopwatches, paused timers, waiting phases, stop/complete/discard, or a phase the user ends
    by hand (skip / start).
    After a gap (server down, nobody reading) one rollover may cross several phases: only the
    latest end is announced — it describes the current state.
- **Scheduler** (`server/push-scheduler.ts`, one `setTimeout` per process, like the timer hub;
  started by the new `init` hook in `hooks.server.ts`, skipped while building): every
  `publishTimer` snapshot (start, pause/resume, phase rollover, stop/discard/complete,
  pomodoro settings, task/quest deletion via `broadcastTimer`) cancels and re-arms the
  timeout for `nextPushEvent(snapshot).at` (+20 ms; clamped to 2³¹−1 ms and re-armed in steps;
  a repeated due check is paced to 1 s). On fire it reads the timer (`getTimerSnapshot`): a
  pomodoro run rolls over and `materialize` publishes the phase end **after the transaction
  committed** (`publishPhaseEnd` in `timer-hub.ts`) — whoever rolls it over (the scheduler, a
  client's `GET /api/timer`, a mutation) — and the scheduler sends it; a countdown has nothing
  to roll over, so a due `countdownDone` is sent directly. Server start re-arms from the DB (a
  phase that ended while it was down is rolled over and sent then; a countdown in overtime
  too). **Idempotency**: `claimEvent(key)` = `UPDATE push_config SET last_event_key = key
WHERE last_event_key IS DISTINCT FROM key` — only the winner sends, so recomputes, races
  and restarts never send twice (plus an in-memory last key to skip the query on repeated
  overtime snapshots). Sending is fire-and-forget; no timer request waits for a push service.
- **Payload** (JSON, encrypted): `{ title, body, tag, url: '/focus', badge }` — `badge` =
  today's open tasks at send time (since "Overdue tasks": open + overdue, see below). **Exact texts** (body = the task's title):

  | Event                     | English                                                                    | German                                                                            |
  | ------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
  | countdown done            | Time’s up                                                                  | Zeit ist um                                                                       |
  | break started (auto)      | Break time · 5 min                                                         | Pause · 5 Min.                                                                    |
  | long break started (auto) | Long break · 15 min                                                        | Lange Pause · 15 Min.                                                             |
  | break waits               | Round done — start your break                                              | Runde geschafft – starte deine Pause                                              |
  | next round started (auto) | Break over — back to focus                                                 | Pause vorbei – zurück zum Fokus                                                   |
  | next round waits          | Break over — start the next round                                          | Pause vorbei – starte die nächste Runde                                           |
  | test (Settings)           | Notifications are on / This is how libe tells you a timer phase has ended. | Benachrichtigungen sind an / So sagt dir libe, dass eine Timer-Phase zu Ende ist. |

- **API** (device-authenticated, JSON, no new public paths): `GET /api/push` → VAPID public
  key + this device's subscription; `POST /api/push` (`PushSubscription.toJSON()`, validated
  by `parsePushSubscription`: allowlisted endpoint, 65-byte uncompressed P-256 key, 16-byte
  auth, base64url) → 400 `pushEndpointInvalid` / `pushKeysInvalid`; `DELETE /api/push`;
  `POST /api/push/test` → 404 `pushNotSubscribed` / 502 `pushSendFailed` (`gone` when the
  service said 404/410).
- **Service worker**: `push` → always `showNotification` (iOS revokes subscriptions after
  silent pushes) with `tag` (timer notifications replace each other, `renotify`), icon
  `/icons/icon-192.png`, `data.url`; sets/clears the app badge from `badge`.
  `notificationclick` → focus an open libe window and navigate it to `data.url` (in-app paths
  only), else `openWindow`. `pushsubscriptionchange` → re-subscribe with the old key and
  `POST /api/push` (best effort). Caching rules unchanged (`/api/**` never touched).
- **Settings → Notifications** (`components/settings/NotificationsSection.svelte`, after Focus
  timer): one calm section. States (`notificationsState`, pure): hidden inside the desktop app
  (Tauri's webview has no Web Push); iPhone/iPad in a Safari tab → "Add libe to your Home
  Screen to get notifications: tap Share, then “Add to Home Screen”." (share icon);
  unsupported (no PushManager / Notification / service worker — also `vite dev`, which
  registers no worker); denied → how to allow it again (iOS Settings → Notifications → libe,
  or the browser's site settings); off → primary **Turn on notifications**
  (`Notification.requestPermission()` is called synchronously in the tap handler, before any
  `await` — iOS requirement; the VAPID key is fetched on mount for the same reason); on →
  green dot "On for this device." + **Send test** (shows "✓ Sent" for 2.4 s) + **Turn off**.
  State changes fade/scale in (`fadeScale`, `--dur-pop`), the dot pops (`--ease-spring`).
  "On" means: permission granted **and** the browser's subscription is the one the server
  stores for this device.
- **App badge**: root layout data `openToday` (one count on `tasks_day_idx`: today's tasks,
  quest + other, not done; the root `load` still reads no tracked `url` property, so it follows
  `refreshAll` like `todayLog`). The root layout calls `syncAppBadge(openToday)`; it only
  touches the badge while notifications are on for this device (permission granted + a push
  subscription — iOS ties badges to notification permission, and it is one opt-in). "Turn off"
  clears it. Feature-detected, every rejection swallowed (no console noise).
- Tests: unit — `push.test.ts` (allowlist incl. look-alike hosts/ports/credentials/IPs, the
  test origin, subscription body, `nextPushEvent` countdown/overtime/pause shift/stopwatch,
  pomodoro sequences with and without auto-start incl. the long break wait, paused rounds,
  `lastPhaseEnd` = the predicted event and "latest only" after a gap, `armDelay` clamping,
  texts en/de, `notificationsState` incl. iPadOS's desktop UA), `push-crypto.test.ts` (RFC 8291
  example byte for byte, round trips, VAPID JWT claims + signature, bad keys). e2e
  `push.spec.ts` with a fake push service on :3129 (`e2e/support/fake-push.ts`) and an
  independent decryptor (`e2e/support/web-push.ts`): a 1-min countdown shifted into overtime
  → exactly one push, decrypted (title, body, tag, url, badge = DB count), VAPID header
  verified (`aud`, `sub`, key = `GET /api/push`), TTL/Urgency/Topic, `last_success_at`; a
  second recompute sends nothing more (the test push is the barrier); a pomodoro round ended
  in the DB + a client `GET /api/timer` → "Break time · 5 min" and the run is in its break; 410
  → row deleted; revoking a device (`DELETE /api/pair/session`) deletes its subscription;
  non-allowlisted endpoints / bad keys → 400, no row. Checked against reintroduced bugs: no
  claim (countdown test receives a duplicate), no 410 cleanup, no delete on revoke — each
  fails. No browser e2e for the section: headless Chromium has no push service (and reports
  `Notification.permission` "denied" under mobile emulation), so the states are covered by the
  pure `notificationsState` instead of a faked UI test.
- Manual run (prod build against the dev DB, a dead push endpoint): subscribe, test → 502,
  countdown into overtime → one logged `ECONNREFUSED` line each, `last_failure_*` recorded,
  server healthy; revoke removed the subscription.
- **Not tested**: delivery to a real iPhone/iPad (APNs via `web.push.apple.com`, the
  permission prompt inside the tap, the badge on the home-screen icon, notification grouping
  by tag, `pushsubscriptionchange` — which Safari rarely fires), FCM/Mozilla/WNS acceptance of
  our VAPID JWT and payloads (format verified against RFC 8291 and `web-push`, not against the
  live services), several server instances (each would arm its own timeout; the DB claim
  still prevents duplicate sends).

## Overdue tasks (after Mobile polish — Phase 3)

Goal: a task planned for a day that passed without being done just stayed on that past day —
Home lists only today and Plan only the current week, so it was findable only through search.
Missed tasks are now visible on Home, Plan, the nav and the app icon until the user decides
what to do with them.

- **Definition** (`#lib/overdue.ts` `isOverdue`; SQL twin `overdueCondition` in
  `server/tasks.ts`): `day < today` (server `TZ` — a task turns overdue right after midnight),
  `done_at IS NULL`, and `kind = 'other'` or the quest is open (a closed quest's tasks stay
  hidden, like its backlog). **Computed, never stored**: no migration, no nightly job, no
  automatic rollover — the planned day changes only through an explicit action.
- **Resolving** — explicit actions only: **Today** · **Tomorrow** · **Backlog** · **Done**
  (checkbox; the day stays) · **Delete**. No "dismiss", no special handling for very old tasks.
  `rescheduleOverdue(ids | 'all', day, today)` (`server/tasks.ts`, one transaction, rows locked)
  moves only tasks that are still overdue (a stale form can't move anything else) and appends
  them to the end of the target day's lists in their display order (each kind continues its
  own list: `appendOrders`). Shared form action `overdueTo` in `task-actions.ts` (fields `to` =
  `today|tomorrow`, and `all=1` or one or more `taskId`; invalid input does nothing) on Home and
  Plan; the palette uses `POST /api/overdue` (`{ to, all: true }` or `{ to, taskIds }` →
  `{ moved }`, 400 otherwise). Backlog / Done / Delete reuse `toBacklog` / `toggle` /
  `deleteTask`. Nothing is deleted behind the timer's back by the moves, so no
  `broadcastTimer()` is needed (`deleteTask` already broadcasts).
- **Order**: most recent day first ("yesterday" on top), then list order, then creation
  (`compareOverdue`, `listOverdue`). Age label: "yesterday" / "since Wed, Nov 18" (with the
  year once it lies in another year), German „gestern“ / „seit Mi., 18. Nov.“ (`Intl`).
- **Home** (`components/home/OverdueCard.svelte`, only while there is ≥ 1 overdue task,
  above Next up): desktop/iPad — a card lined up with the task column, "Overdue · N", the first
  5 rows (`OVERDUE_PREVIEW`) + "Show all N", a secondary **All to today** in the header. Rows
  (`components/tasks/OverdueList.svelte`, shared with Plan): done check, title, quest pill (or
  Other/slate), age, an inline **Today** and ⋯ (Move to tomorrow, Move to backlog, Delete); rows
  carry `data-task` (palette scroll target). Phones — one quiet row "N tasks overdue · View ›"
  (Next up stays the screen's primary action) opening a bottom sheet with every row and a
  full-width primary **All to today** in the sticky `.dialog-actions`; the sheet closes itself
  once the list is empty. No swipe gestures.
- **Nav dot**: root layout data `overdueCount` → a small `--overdue` dot on the Home item
  (top nav and the phone capsule), no number; the link's accessible name becomes
  "Home, N overdue".
- **Plan**: the backlog rail starts with an **Overdue** group (all weeks; 3 rows +
  "Show all N" so the backlog stays in reach — `OVERDUE_RAIL_PREVIEW`). Its rows drag onto any
  day (the existing `?/moveTo` drag & drop; dropping on the rail moves to the backlog) and have
  Today + ⋯ as the keyboard/touch equivalent. They carry no `data-task` (the same task can have a
  card in the shown week). Open cards on past days of the shown week get a small overdue dot
  (`DayTaskCard overdue`, sr text "Overdue"). Phones: the day strip's dot turns `--overdue` for
  days holding overdue tasks (`DayStrip alerts`, "overdue tasks" for screen readers) and the
  backlog sheet shows the same group (all rows, no drag).
- **App icon badge** (decision: overdue tasks count): `badge` = open tasks of today **and**
  overdue ones, closed quests left out — also aligning today's count with the closed-quest
  rule. One query on `tasks_day_idx` (`taskCounts(today)` → `{ badge, overdue }`) feeds the
  root layout (`badge`, `overdueCount`; was `openToday`) and push payloads (`badgeCount()` in
  `server/push.ts`, was `openTodayCount()`).
- **Command palette**: "Move overdue tasks to today" (detail "N tasks") under Actions, only
  while `overdueCount > 0`; runs `POST /api/overdue` then `refreshAll()`.
- **Midnight**: the root layout gets the server's `today` and `dayEndsAt` (`nextDayStart` in
  `#lib/dates.ts`, DST-safe). A timeout at `dayEndsAt` (+ 2 s) and a check on
  `visibilitychange` → visible (timeouts freeze in the background on iOS) call `refreshAll()`
  once the server clock (`Date.now()` + the timer store's offset) has passed it — Home moves to
  the new day and yesterday's open tasks turn overdue without a manual reload. The timer
  store's existing "long absence" refresh stays as it was.
- **Colour**: token `--overdue` (`color-mix` of `--danger` and `--text-muted`) — dots, the age
  text and markers only, never a large red surface.
- Streaks, Review and stats are session-based and unchanged.
- Tests: unit — `overdue.test.ts` (definition incl. done/closed/other, display order,
  ages en/de incl. the year, preview, targets/selection parsing, `appendOrders`, days),
  `dates.test.ts` (`nextDayStart` incl. both DST switches). e2e `overdue.spec.ts`: Today from
  Home's card (DB + reload, end of today's list), done/closed-quest tasks never shown and the
  nav dot = the SQL count (Done keeps the day), Tomorrow/Backlog from ⋯ and **All to today**
  keeping display order across days, Plan's past-day marker and dragging a rail row onto a day,
  the palette action, the phone row + sheet (`@mobile`), `POST /api/overdue` validation and
  "only overdue tasks move". "All to today" and the palette move the seed's past tasks too, so
  those tests restore every other task's day and position; quests created there are closed
  afterwards. `push.spec.ts` now adds an overdue task and expects it in the payload's badge.
  `plan.spec.ts`' rail drop scrolls its quest group into view first (the new group and other
  runs' leftovers can push it below the rail). Checked against reintroduced bugs: no
  closed-quest filter (closed quest's task shows → fails), ascending day order in
  `rescheduleOverdue` (order test fails).
- **Not tested**: the midnight refresh in a browser (the server clock can't be shifted in e2e;
  `nextDayStart` is unit-tested), the badge on a real iPhone home screen.

## UX overhaul (after Overdue tasks)

A UI/UX audit (November 2026) found that a newcomer can't get started: a friend of the owner
quit on the first screen — admin wording on `/setup`, an empty Home without a single primary
action on desktop, and the first field everybody types into answering "Pick a quest." with no
quest to pick. The overhaul runs in small milestones, each shippable on its own:

| #   | Scope                                                                                                                                                       | Status  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| O1  | First-run hotfixes: no dead end without quests, Next up on desktop, one add button, one duration format, plain setup/pair copy                              | ✅ done |
| R1a | Token foundation, no visible change: role tokens, no colour literals outside `tokens.css`, palette check script, styleguide by role                         | ✅ done |
| R1b | Rebrand "Hain": the palette picked from rendered variants (V3 "Waldboden"), mint accent, quest colours off the mint hue, Figtree                            | ✅ done |
| R2  | Rebrand "Hain", part 2: logo (`favicon.svg`, `Logo.svelte`) and app icons (`static/`, `src-tauri/icons/`)                                                   | ✅ done |
| R4  | "Apple + Linear" look (replaces Hain): palette, Geist, Apple system colours for quests, `--accent-text`                                                     | ✅ done |
| O2  | Guided start: `settings.onboarded_at`, `/welcome` (goal → first step → first focus), redirects after pairing                                                | ✅ done |
| O3a | Less at once, part 1: Home as one list (variant A) — overdue rows, one "Today" list, one add row, Backlog and Daily plan as rows/sheets                     | ✅ done |
| O3b | Slimmer quest dialog ("More options"), empty states (one symbol, one sentence, one action), phone tab labels, wording                                       | ✅ done |
| O4a | Hierarchy and feedback, part 1: one primary per screen (round Focus buttons), accent discipline + orange streak, "All done" card, large bold titles, motion | ✅ done |
| O4b | Hierarchy and feedback, part 2: Review on phones (Week/Quarter, one summary), the daily-goal progress in the navigation                                     | ✅ done |
| R3  | Light mode (tokens for a second theme; dark stays the default)                                                                                              | planned |

Owner decisions:

- **Rebrand direction "Hain"** (grove: calm, natural, growing). The current look copies
  quest.app and must move away from it — that is what R1/R2 are for; O-milestones before them
  keep the existing tokens, fonts and logo.
- **Dark stays the default**; a light mode is wanted later (R3).
- **Mint is the accent** (the competitor is yellow/amber; green fits "Hain"). **No Bricolage
  Grotesque** (or another quirky display face): it broke the timer's digits and isn't calm.
- **How R1 is done** (after PR #31 was rejected): the first attempt changed tokens and ~50
  files in one go and looked worse than before — surfaces lighter (L 0.20 → 0.23) with
  green-tinted text, so the contrast range shrank and everything read "fogged"; the mint accent
  shared the surfaces' hue; quest red drifted to pink, quest green towards mint; the card edge
  overlay turned into a hook; the dot grid read as noise; Bricolage broke the clock. So R1 is
  split: R1a moves the infrastructure without changing a pixel; R1b first renders 2–3 palette
  variants on the real pages (Home, Plan, Calendar, Focus, Review; desktop and phone), the
  owner picks one, and only then it is applied. Direction for the variants: near-black
  surfaces with a slight green cast (low chroma, old lightness), near-neutral text, mint only
  as the accent.
- **Picked (R1b)**: variant V3 "Waldboden" (olive/forest cast, hue 125°), the retuned quest
  colours and Figtree. R1b applies exactly what was shown — nothing else of #31 (radii, dot
  grid, card edges, motion, accent discipline) came along unseen. The accent discipline stays
  in O4; like every later visual change it is rendered as variants on the real pages first
  and picked by the owner before it is applied.
- **Hain was dropped (R4) for "Apple + Linear" with Geist.** How it was picked: four neutral
  palettes × four fonts rendered on the real pages and compared side by side; the owner chose
  the Apple + Linear palette and Geist, then refinements from Linear's rules (few, soft
  borders — "structure should be felt, not seen"; the nav recedes; elevation through
  lightness; a restrained accent) and **Apple's system colours as quest colours**. Tokens and
  font only — Apple-style components are a later milestone. The R1b/R2 notes below describe
  the Hain look as it was; where older notes say "mint" or "amber" for the accent, read the
  accent (blue now).
- **The name "libe" stays.** "Quest" stays as the product word and gets explained once.

## O1 — what exists

- **No "Pick a quest." dead end.** Home without an open quest shows no quest work add row: in
  its place a short card (`components/home/FirstQuestCard.svelte`: one sentence on what quests
  are + a secondary **Create your first quest**) that opens the existing quest form
  (`QuestForm`) in a `Dialog` right on Home (a bottom sheet on phones). The create action is
  shared: `createQuestAction` in `server/quest-actions.ts`, used by `/quests` and Home
  (`?/create`); `QuestForm` now posts to `formAction(mode)` so Home's `?hideDone=` survives.
  Once the quest exists Home reloads and the quest work row appears with it preselected.
- **Backlog adds accept "Other"** (Home's "Add to backlog…", Plan's rail and phone sheet): the
  pickers have the Other entry (`otherOption`) and `addBacklog` uses `optionalQuestTarget` —
  without quests the picker is just "Other". Such tasks already showed in both backlogs
  (`listOtherBacklog`). Plan's day adds already had Other; Focus' "Add one on Home" now lands
  on a Home that works; the palette has no add action.
- The server keeps validating: `addQuest` with an empty `questId` still fails, but the message
  says what to do ("Pick a quest — or create your first one on the Quests page.").
- **Next up on desktop too** (`NextUpCard.svelte`): the top of Home's task column on every
  width — text left, the one primary button right (phones: stacked, full-width button, as
  before). Inside the column so the timeline beside it keeps its place (it scrolls the page to
  the now line only while that sits in the first screen). Hidden while a timer runs (the nav's
  timer chip / the mini-player is the "now"). Its empty state's **Add a task** focuses the first
  add row that works: quest work, or Other while there is no open quest
  (`form.add[data-intent]`).
- **No Top/Bottom buttons.** `TaskAddForm` has one **Add** button (icon-only in plan columns);
  Enter and Add append at the bottom. **Shift+Enter** adds at the top — a hidden submit button
  after Add (`pos=top`; the form's default button stays "bottom"), no visible control; ↑/↓
  reorder afterwards. The server's `pos` field stays. Phones keep the progressive disclosure:
  duration and Add appear once the row is in use.
- **One duration format** — `#lib/duration.ts`: `formatDurationMin(min, locale)` /
  `formatDurationMs(ms, locale)` → `25 min`, `1 h`, `1 h 30 min`, `26 h` (German: same units,
  narrow no-break space before them). Used for every planned or logged duration as text: task
  cards, Next up, Home/Plan backlogs, quest detail, Focus' task list, the Log-time session
  list, Calendar day/week totals and the session dialog, Review's day bars — and by the i18n
  `goal.duration` (goal choices, streak hints, avatar progress), so there is one
  implementation. Removed: `formatDuration` (`H:MM:SS`, `dates.ts`), `formatHM` (`8h 59m`,
  `calendar.ts`), `formatHMin` (`4:30`, `review.ts`), `t.common.minutes`. Clock style stays only
  for the running timer (`formatClock`); decimal hours (`1.3h today`, Review KPIs, quest cards)
  stay with `formatHours`.
- **Planned vs logged**: a task card shows logged time when there is some, else the planned
  duration — now with the word: "1 h 15 min logged" (with the quest dot) / "1 h 30 min planned"
  (German „erfasst“ / „geplant“); on plan board cards the word is for screen readers only.
- **Setup / pair copy** (`/setup`, `/pair`, `AuthShell intro`): one line under the logo says
  what libe is; "setup secret" became **Server password** / **Server-Passwort** everywhere in
  the UI (titles, labels, errors, the sign-out confirmation), with a quieter hint "For the
  admin: the value of `LIBE_SETUP_SECRET` on the server." `/pair` says it connects this device
  to an existing libe whose data it shares (libe is single-user: pair only your own devices)
  and where a code comes from (Settings → Pair new device).
- Fix on the way: after a successful add the title input is refocused with `preventScroll` —
  on a scrolled narrow plan board the backlog rail's refocus used to pull the board back to
  the rail (`plan.spec.ts` "narrow board" failed on Mondays, when today's column sits next to
  the rail).
- Decisions: the first-quest card's button is secondary (Next up stays Home's one primary);
  without quests the quest filter funnel is hidden; the backlog row comes before Other in the
  column (unchanged), Next up's button jumps to Other; "Pair" stays the verb (it is used in
  Settings and the avatar menu too).
- Tests: unit `duration.test.ts` (en/de, 0, < 60, 60, 90, ≥ 24 h, rounding, NaN/negative,
  ms rounding, equality with `goal.duration`). e2e `home.spec.ts`: **without any open quest**
  (closes the open quests in `beforeEach`, reopens exactly those afterwards; `@mobile`) — every
  add field on Home takes a typed task (DB row + reload, no "Pick a quest."), then **Create your
  first quest** on Home and adding quest work for it; checked against the reintroduced bug (the
  quest work row shown without quests → fails on "Pick a quest."). **Next up on desktop**
  starts a focus timer (session row) and steps aside while it runs. Updated: Enter/Add vs.
  Shift+Enter ordering, "1 h 15 min logged", Calendar totals, Review day-bar labels, the
  Log-time session list, the plan column's Add button, "Wrong server password.".
- **Not done here** (later milestones): onboarding (`/welcome`, `onboarded_at`), progressive
  disclosure, label culling, tab labels, celebration, motion tweaks, any token/font/logo change.

## O3a — what exists

Home shows less at once. The owner picked **variant A · "One list"** from mock-ups (like
Reminders: one grouped list, the quest as a small line under each task, Backlog and the daily
plan as rows), plus one extra requirement: **overdue tasks stay visible as tasks**.

- **Structure** (top to bottom, phone and desktop): greeting, the date as a large bold title
  (`--fs-title-lg` 32 px, phones `--fs-title` 28 px), one muted meta line — logged today
  (`/ goal today`) · this week (not on phones) · the streak ("3-day streak", the milestone line
  on its day; what today still needs is the tooltip and screen-reader text). Then `NextUpCard`
  (unchanged, hidden while a timer runs), the **Overdue group**, **Today**, and — without open
  quests — `FirstQuestCard`. Wider than 1000 px a slim right column (`--home-side` 300 px)
  holds the **Backlog** row and the **Daily plan** card; narrower, both are rows under the list.
- **Overdue group** (`components/home/OverdueGroup.svelte`, every width): header "● Overdue · 5"
  with **All to today** as plain accent text on the right (iOS "Edit" style), then
  `OverdueList grouped` — rows with a check ring in the quest colour, the title over
  "● quest · yesterday / since Mon, Nov 23" (age in `--overdue`), **→ Today** and ⋯ (Tomorrow,
  Backlog, Delete). The first 3 rows (`OVERDUE_PREVIEW`), then a **Show N more** row that
  unfolds the rest in place (and "Show less"). Absent while nothing is overdue. Replaces the
  desktop card (`OverdueCard`, removed) and the phone's "N tasks overdue · View" row + sheet.
- **Today** (`TodayList` + `TodayRow`): quest work and Other in **one** inset grouped list.
  The data model keeps two stored lists per day (`sort_order` per kind), so the list is merged,
  not interleaved: `mergeDayLists` (`#lib/ordering.ts`) → open quest work, open Other, done
  quest work, done Other, each in its own order; ↑/↓ stay inside a task's own list and
  open/done group (`first`/`last` per run, replaces `groupEdges`). A row: a round check in the
  quest colour (slate for Other; filled when done, pop/strike animation as before), the title,
  "● quest name" (or "Other") under it, the logged (quest-colour dot) or planned duration with
  the word for screen readers, the live timer + pause while it runs (accent-tinted row,
  progress line), ▶ (start focus), and ⋯: Time-block…, Log time…, Move up / Move down,
  Move to backlog, Move to tomorrow, Delete. The header: "Today", "N open", the quest filter
  funnel and the hide-done eye. `?hideDone=1` now hides the done rows of the whole list (it
  used to hide done Other only); the quest filter still filters quest work only.
- **One add row** (`TaskAddForm row`, form action `add`, `optionalQuestTarget`): the list's last
  row reads "+ Add a task…"; while in use (focus, its picker menu open, or a typed title) the
  quest picker (open quests matching `?q=` + **Other**), the duration and **Add** unfold on a
  second line. Enter/Add at the bottom, Shift+Enter on top. The picker defaults to the first
  open quest; without open quests it is just "Other" (O1's guarantee), and `FirstQuestCard`
  sits under the list. The fold waits for a pointer release, so a click that takes the focus
  away isn't moved under the pointer. Removed: the actions `addQuest` / `addOther`, the
  separate "Quest work" / "Other" sections and their add rows.
- **Backlog**: a `GroupedNavRow` "Backlog 7 ›" (new primitive: icon tile, label, value or
  count badge, chevron; accessible name "Backlog, 7 tasks") opens a sheet (`Dialog`; bottom
  sheet on phones) with `BacklogList` — now a grouped list ("● quest" over the title, the
  planned duration, **→ Today**, delete) and "+ Add to backlog…" as its last row (quest or
  Other). `?backlog=1` (`BACKLOG_HREF`) opens the sheet and is removed from the URL again
  (`replaceState`): the command palette sends tasks without a day there (`taskHref`).
- **Daily plan**: wide screens: `DayPlanCard` — `DayTimeline range="now"`, the window
  `nowWindow` (`#lib/timeline.ts`): one hour back, four ahead, stretched over every block that
  hasn't ended before it, inside the day, at least 5 hours (late evening 19–24); a **Whole
  day** / **Next hours** toggle in place; a hint "Time-block a task from its ⋯ menu." while
  nothing is planned. Narrower: a row "Daily plan · <summary> ›" (`planSummary`: the running
  block, else the next one, else "N blocks earlier today", else "Nothing planned") that opens
  the whole day (`dayWindow`: 06:00, or the first earlier block, until 24:00) as a sheet,
  scrolled to the now line inside it. Blocks are still created from a row's ⋯ "Time-block…"
  and edited by clicking them (from the sheet the block dialog takes its place). The
  timeline no longer scrolls the page on load and only draws blocks inside its window.
- **Tokens**: `--row-check`, `--row-icon`, `--row-badge-h`, `--fs-title-lg`, `--home-side`.
  i18n: new keys under `homeList.*` (en/de); dead keys removed (`home.questWork`,
  `addQuestWork`, `budgetBar`, `timeline`, `openTasks`, `overdue.row`, `view`, `sheetTitle`).
- **Decisions**: merged rather than interleaved (no data-model change); ↑/↓ moved into the
  row's ⋯ (the row keeps ▶ and ⋯ only); the week budget bar is gone (Review has the week);
  the compact timeline follows "what is still planned" rather than every block of the day
  (earlier blocks are one tap away, "Whole day"); the overdue group is visible on phones too
  (owner); the streak hint became a tooltip/screen-reader text (one meta line); the Next up
  card's look is unchanged (its label and copy are O3b's).
- **Tests**: unit `mergeDayLists`, `dayWindow`, `nowWindow`, `planSummary`, `taskHref`
  (`/?backlog=1`). e2e `home.spec.ts`: one add row (quest work of two quests and Other;
  Enter/Add vs. Shift+Enter; merged order after a reload; DB kind/quest), ↑/↓ edges per
  (list, open/done) run read from each row's ⋯, row ⋯ actions with the Backlog sheet's
  "→ Today", the Backlog sheet's add + the row's count, hideDone over the whole list + the
  quest filter, time blocks in the compact timeline, header totals by test id, the phone's
  daily-plan sheet (summary, block → edit dialog, DB) `@mobile`, no-quest flow through the add
  row and the sheet `@mobile`, the no-JS add (first open quest). `overdue.spec.ts`: the group's
  "Show N more", rows above Today on phones `@mobile`. `palette.spec.ts`: a backlog task opens
  the Backlog sheet. Selectors updated in `mobile`, `streak`.

## R1a — what exists

Infrastructure for the rebrand, with the current look unchanged (amber, Inter, the same
values everywhere — every app page renders as before; only `/styleguide` changed).

- **Role tokens** in `tokens.css`, set to the current values: `--control-on` (native
  checkboxes in Log time / pomodoro settings, the calendar's plan toggle, the selected emoji),
  `--selected-bg` / `--selected-border` / `--selected-text` (rest-day toggles, Focus' selected
  task background), `--focus-ring` (`--ring`, the selected colour swatch), `--shadow-color` +
  `--backdrop` (shadows, dialog and palette backdrops). The last two colour literals outside
  `tokens.css` (the backdrops) are gone; Home's week bar uses `--radius-pill`.
- **Palette check** `scripts/contrast.ts` (taken from PR #31, extended): WCAG 2 contrast for
  every text/UI pair on `--bg` / `--surface` / `--surface-2`, quest colours ≥ 3:1 on
  `--surface`, ≥ ΔE 0.08 (OKLab) **and ≥ 25° hue (OKLCH)** from the accent unless grey, closest
  quest pair ≥ ΔE 0.06. `bun scripts/contrast.ts [file]` prints the report for `tokens.css` or a
  draft. `contrast.test.ts` runs it in `bun run test`; the current palette's known gaps are
  listed (`KNOWN_GAPS`: `--text-faint` ≈ 2.7:1, quest amber = the accent) and R1b must remove
  them — the test also fails on a stale entry.
- `/styleguide` shows the palette by role (surfaces, text & lines, accent, states, semantic)
  and a timer sample, as the baseline for R1b's comparison.

## R1b — what exists

libe has its own look ("Hain"); the layout and every component are unchanged, only tokens
and the UI font changed. Where older milestone notes in this file say "amber" for the now
line, today markers, the running timer, progress bars or primary buttons, read "the accent"
(mint now).

- **How it was picked**: one exploration build, token overrides injected into the real pages
  (Home, Home + timer, Focus, Plan, Calendar, Review, Quests; phone Home/timer/Focus) for five
  palettes — today, #31's colours, V1 "Nacht" (chroma 0.006, hue 165°), V2 "Moos" (0.014, 165°),
  V3 "Waldboden" (0.011, 125°) — compared side by side; the owner chose **V3**, the quest colours
  as shown and **Figtree**.
- **Palette** (`tokens.css`; OKLCH lightness as before, chroma ≈ 0.011, hue 125°): `--bg
#0d0f0a`, `--bg-nav #080a06`, `--surface #141611`, `--surface-2 #1a1d17`, `--surface-hover
#181a14`, `--track #161813`, `--bar-muted #3b3e37`; lines `--border #24261f`,
  `--border-dashed #272a23`, `--border-strong #2f322a`; text (near-neutral) `--text #f3f3f2`,
  `--text-2 #cacbc7`, `--text-muted #91918d`, `--text-faint #696965` (≥ 3:1 now).
- **Accent**: mint `--accent #6fdcae`, `--accent-hover #8de6c1`, ink `--accent-ink #08231a`,
  replacing amber one to one (same places as before); `--success` = the accent (one green).
  The ground's hue (125°) is 39° away from mint's (164°), so mint stands out by hue as well.
- **Quest colours**: unchanged except green → leaf `#78b955` (136°) and teal → cyan `#36b8c5`
  (205°), both ≥ 25° of hue from mint. Amber is a plain quest colour now (no longer the
  accent; still the default avatar colour). `scripts/contrast.ts`: all checks pass,
  `KNOWN_GAPS` is empty.
- **Font**: Figtree (`@fontsource-variable/figtree` 5.3.0, OFL, self-hosted, precached by the
  service worker) replaces Inter for everything; Inter's `cv11`/`ss01` settings are gone
  (Figtree has neither feature; it has `tnum`, so tabular times keep working).
- **Outside `tokens.css`**: `theme-color` (`app.html`) and the manifest colours `#0d0f0a`; the
  desktop window background (`BACKGROUND` in `src-tauri/src/lib.rs`) and the desktop shell's
  palette (`src-tauri/ui/style.css`, which bundles no font: Figtree if installed, else the
  system font). The favicon and app icons are still the old ones (R2).

## R2 — what exists

The favicon and every app icon are in the Hain colours; the mark itself is unchanged.

- **Decision**: the owner kept the current mark (variant "A": the rounded "l" stroke and the
  dot, same geometry) and only recoloured it: stroke `--accent` (mint), dot `--text`, on a
  **dark** `--bg` tile (not a mint tile). Each file keeps its old composition and size: the
  rounded tile (radius 7 of 32, transparent corners) for the favicons, the PWA "any" icons
  and the desktop app; the full opaque square with the mark at 92 % for
  `apple-touch-icon.png` and at 78 % (inside the 40 % safe circle) for the maskable icon.
- **One source**: `src/lib/logo.ts` holds the geometry (path, stroke width, dot, the centre
  icons use) and the colour roles (`LOGO_TOKENS`); `Logo.svelte` renders from it with CSS
  variables, as before.
- **Generator** `bun scripts/icons.ts`: reads the colours from `tokens.css` (`readTokens` /
  `resolveColor` of `scripts/contrast.ts`) and writes `static/favicon.svg` and the README's
  `assets/icon.svg`; renders `favicon-32.png`, `apple-touch-icon.png`, `icons/icon-192.png`,
  `icon-512.png`, `icon-maskable-512.png` with Playwright's Chromium (transparent where the
  tile is rounded, opaque otherwise); writes `favicon.ico` (16/32/48 PNG entries, a small
  ICO encoder of its own); renders a 1024² PNG, runs `tauri icon` on it in a temp dir and
  copies only the files that already exist in `src-tauri/icons/` (`icon.png` stays the
  1024² render). Needs Chromium (`bunx playwright install chromium`).
- **Tests** (`scripts/icons.test.ts`): the SVG builder (token colours, shared geometry,
  maskable safe zone), the ICO encoder, the committed files' sizes, and that the committed
  SVGs equal the builder's output for the current tokens — a token change without rerunning
  the generator fails `bun run test`.

## R4 — what exists

libe has the "Apple + Linear" look; the layout and every component are unchanged, only tokens,
the UI font, the icons and the colours outside `tokens.css` changed. Where older milestone
notes in this file say "amber" or "mint" for the now line, today markers, the running timer,
progress bars or primary buttons, read "the accent" (blue now).

- **Palette** (`tokens.css`, neutral, elevation by lightness): `--bg #000000`, `--bg-nav
#000000` (the nav recedes), `--surface #111113`, `--surface-2 #1a1a1d`, `--surface-hover
#161618`, `--track #1a1a1d`, `--bar-muted #3a3a3e`; lines (few, soft) `--border #1c1c1f`,
  `--border-dashed #262629`, `--border-strong #2a2a2e`; text `--text #f5f5f7`, `--text-2
#d2d2d7`, `--text-muted #98989f`, `--text-faint #6e6e73`.
- **Accent**: Apple blue `--accent #0071e3`, `--accent-hover #0062c4`, `--accent-ink #ffffff`
  (4.7:1 / 5.9:1); `--focus-ring #409cff` (a literal now, not an accent mix); `--danger
#ff6b62`; `--success #30d158` (no longer the accent). `--accent-soft`, `--today-tint`,
  `--running-border`, `--selected-bg` / `--selected-border`, `--control-on`, `--overdue` stay
  derived role tokens with their old formulas.
- **`--accent-text #4da3ff`** — the accent as a text or icon colour. `#0071e3` carries white
  button text but is only ~4.0–4.5:1 as text on the black surfaces; `--accent-text` is 8.0 /
  7.2 / 6.6:1 on `--bg` / `--surface` / `--surface-2`. Rule: `color:` uses the accent only
  through `--accent-text`; fills, borders, lines, rings, dots and the logo stroke keep
  `--accent`. `--selected-text` = `--accent-text`. Changed to `--accent-text`: today's day
  numbers (Plan columns, Calendar head, phone `DayStrip`), Review's today column labels, its
  quest-hours KPI and done streak marks, the longest-day icon, streak flames (nav, Home chip),
  the active quest filter funnel, the `QuestPicker` tick, Overdue "today" hover, Backlog's
  primary op hover, palette cancel / go hover, auth footer and notice links, Focus' overtime
  clock, "switch" link and empty-state link, Settings' own-device icon and "this device" badge,
  the styleguide's stat sample. `/styleguide` shows `--accent-text` among the accent swatches.
- **Quest colours** = Apple's system colours (dark variants): red `#ff4245`, orange `#ff9230`,
  amber `#ffd600`, lime `#b4e34a`, green `#30d158`, teal `#00c7be`, blue `#8a7bff` (indigo
  leaning, 29° of hue from the blue accent), purple `#bf5af2`, pink `#ff6ac1`, olive `#b78a66`,
  slate `#8e8e93`. Keys unchanged (stored in the DB).
- **Palette check** (`scripts/contrast.ts`): the "today / now text" checks test
  `--accent-text`; new UI checks `--accent` ≥ 3:1 on `--bg` / `--surface` (lines, rings, dots:
  4.5 / 4.0:1) and `--success` ≥ 4.5:1 as text. All checks pass, `KNOWN_GAPS` stays empty.
- **Font**: Geist (`@fontsource-variable/geist` 5.3.0, OFL, self-hosted like Figtree was)
  replaces Figtree. Geist's default digits are proportional, but it has `tnum` (all digits
  600 units), so `.tabular` / `tabular-nums` (Focus clock, times) keep a fixed width.
- **Outside `tokens.css`**: `theme-color` and the manifest colours `#000000`; the desktop
  window background (`BACKGROUND` in `src-tauri/src/lib.rs`, black) and the desktop shell's
  palette (`src-tauri/ui/style.css`, incl. `--accent-text`; Geist if installed, else the
  system font).
- **Icons**: regenerated with `bun scripts/icons.ts` from the tokens — blue stroke, white dot,
  black tile; geometry and compositions unchanged.
- **Unchanged**: layout, components, radii, spacing, motion, the logo's geometry. Code comments
  that still said "amber" for the accent now say "accent".

## O2 — what exists

A short, skippable first-run flow right after the first pairing — the newcomer from the audit
didn't know what libe is or what to do.

- **Look**: the owner's mock-up "V1 · three steps" in Apple/SwiftUI idioms on phone and
  desktop, built only from tokens (the mock-up's colours/font were an older palette). Large
  bold titles under an accent lucide symbol (Target, Flag, Timer; Logo on the welcome
  screen), one muted line, inset grouped lists, page dots for steps 1–3, "‹ Back" in accent
  text top left from step 1 on. Phones: the primary full-width (`--cta-h`, `--radius-cta`)
  in a sticky footer above the home indicator, the secondary as plain accent text under it.
  Wider screens: one narrow centred column (`--welcome-col`), a hairline above the footer,
  dots left, buttons bottom right like a macOS sheet (secondary left of the primary). Step
  changes rise in with `tickIn` (not the first paint; nothing under reduced motion); hover
  styles only for `(hover: hover)` (no sticky tint after a tap).
- **Screens** (`/welcome`, outside `(app)`; `components/welcome/`: `WelcomeScreen` shell +
  `StepIntro`, `StepGoal`, `StepQuest`, `StepFocus`): 0. "Welcome to libe" + Quests / Focus / Review rows; **Get started**, "Skip setup".
  1. "How much time a day?" — grouped choice list 30 min / 1 h / 2 h / 3 h / No daily goal
     (the stored goal preselected if listed, else 1 h); **Continue** saves it, "Set later"
     skips.
  2. "What do you want to work on?" — section Quest (name field, colour swatches), section
     First step (title field, segmented 25 min / 45 min / 1 h, footer "It goes on today's
     list."); **Continue** creates the quest and the task on today's list (bottom), "Skip"
     creates nothing.
  3. "Ready for your first focus?" — the task as a card (quest dot + name, "45 min planned");
     **Start focus** / "Later — go to Home". Without a task (step 2 skipped): "You're all
     set" + **Go to Home** — the timer needs a task, so no new timer semantics.
- **State in the URL**: `?step=1…3` (anything else = the welcome screen) and `&task=<id>`
  once step 2 created the task (`#lib/onboarding.ts`: `parseStep`, `welcomeHref`,
  `previousStep`). Every step is its own history entry, so back/forward and reloads show the
  same screen; "Back" is a plain link to the previous step. Back from step 3 to step 2 shows
  the created quest/task and Continue **edits** them (`saveFirstQuest` with the existing
  task; `updateQuest` + new `updateTaskDetails`, which broadcasts the timer) instead of
  creating a second pair. Forms post with `formAction(...)` so a failed submit keeps the URL.
- **Writes** (form actions in `routes/welcome/+page.server.ts`, progressive enhancement):
  `goal` → `parseDailyGoal` + `saveDailyGoal`; `quest` → `validateQuestForm` (description,
  icon, budget defaulted), `validateTaskTitle`, `parseFirstStepDuration` (25/45/60 only),
  errors translated and echoed; `finish` → `markOnboarded()` then Home, or with
  `then=focus`: with JS the action returns and the page starts the focus through
  `useTimer().start(…, { navigate: true })` (an active timer gets the usual "Stop current and
  start this?") and opens `/focus`; without JS the action calls `startTimer` (the function
  behind `POST /api/timer`) and redirects to `/focus` (`/focus?task=` if another timer runs).
- **Data**: `settings.onboarded_at` (timestamptz, null = not yet), migration
  `0008_onboarding`. The settings row is created lazily, so the migration upserts it with
  `onboarded_at = now()` when the install has any quest, task, session or device (even a
  revoked one) — existing installs never see the flow; a fresh install has no row → null.
  `isOnboarded` / `markOnboarded` (keeps the first timestamp) in `server/settings.ts`, data
  access in `server/onboarding.ts`. `scripts/seed.ts` marks the demo install onboarded.
- **Redirects**: only a **first-device** `/setup` (no active device before it) of a not yet
  onboarded install lands on `/welcome` (`postSetupTarget`), whatever its `next`; it sets
  no `libe_welcome` cookie (the flow is the welcome). `/setup` with devices (recovery),
  `/pair`, the Tauri `/pair/session` and every app page behave as before — abandoning the
  flow leaves `onboarded_at` null but traps no one. `/welcome` when onboarded → 303 to `/`.
  It is a normal authenticated route (unpaired → `/setup?next=/welcome`).
- **Apple-style primitives** (in `/styleguide`): `GroupedList` (inset grouped rows on
  `--grouped-bg`, hairlines inset from the left, header/footer; with `options` a
  `<fieldset>` of native radios with an accent checkmark — arrow keys, screen readers, no-JS
  submit), `GroupedRow` (label left + control right, `stacked`, or a borderless text field
  filling the row; a focused field rings its row), `SegmentedControl` (native radio group,
  raised thumb, touch hit area via `.hit-target`). New tokens: `--grouped-*`,
  `--segmented-*`, `--page-dot*`, `--cta-h`, `--radius-cta`, `--fs-title`, `--fw-bold`,
  `--symbol-lg`, `--welcome-col` (`scripts/contrast.ts` all ok).
- **i18n**: `onboarding.*` in `en.ts` / `de.ts` (German from the mock-up: „Los geht’s“,
  „Später festlegen“, „Später, zur Startseite“). Durations via `formatDurationMin`, "planned"
  via `t.tasks.planned`. The tab title names the step (the route announcer reads it).
- **Decisions**: "Skip setup" sits in the welcome screen's empty secondary slot; the
  default quest colour is teal (as in the mock-up); colours are the full `ColorSwatches`
  row (stacked under its label, wraps on phones); Back stays top left on desktop too (the
  owner's brief), not in the footer as in the mock-up's Mac window.
- **Tests**: unit `onboarding.test.ts` (step parsing/links round trip, goal choices ⊂
  Settings presets, first-step durations, `postSetupTarget`). e2e `onboarding.spec.ts`: a
  first pairing lands on `/welcome`, the flow saves the goal (120), creates quest + today's
  task (45 min), Back edits instead of duplicating (checked against the reintroduced bug),
  Start focus → running session + `onboarded_at`, then `/welcome` → `/`; skipping every step
  (`@mobile`, reload keeps the step, nothing created, `onboarded_at` set only by the last
  button); no trap (Home stays Home, a `/setup` with devices keeps `next`), server-side
  validation, "Skip setup". `onboarded_at`, the goal and the timer are reset around each
  test. `/welcome` is not in `pages.spec.ts` (it redirects once onboarded).

## O3b — what exists

"Less at once", part two: the owner approved points 2–5 of the O3 mock-up ("Weniger auf
einmal": quest dialog, empty states, tab bar, wording). Home itself is O3a (a separate PR).

- **Quest dialog** (`QuestForm` in `Dialog`: `/quests` new + edit, Home's first-quest card):
  two inset grouped lists on the sheet (`--grouped-bg-raised` / `--grouped-separator-raised`,
  one step lighter than the dialog) — the name (a borderless row, placeholder "Launch my
  idea") and the colour swatches — then one disclosure row **More options** ("Icon, budget…"
  while folded). It is a native `<details>`: it works without JS and the folded fields still
  submit (empty icon → `✨`, empty description, no budget — the server fills in the defaults as
  before). Unfolded: **Icon** (a row with the current emoji; the emoji choice — text field + 16
  suggestions — opens only on tap, a nested `<details>`), **Description** (a borderless
  two-line field) and **Weekly budget** (number right-aligned, "h" once there is one). It
  starts open when the quest has something set there (`hasQuestExtras`: an icon other than
  `✨`, a description or a budget) or a field in it failed validation (the icon's choice opens
  too). One primary button at the bottom — **Create quest** / **Save** (full width in the
  phone sheet's sticky `.dialog-actions`); no Cancel (✕, Esc, backdrop, drag) and no "You can
  change everything later" hint. Errors are listed under the groups (`role="alert"`), the
  fields get `aria-invalid`. Same actions and validation (`createQuestAction`, `update`,
  `validateQuestForm`).
- **Empty states** — `EmptyState.svelte` (symbol in `--accent-text`, bold title, one muted
  line, one primary action as a link or button; `--empty-text-max`,
  `--empty-action-min-w`), in `/styleguide`. Navigation stays (week nav, Plan's backlog
  button/rail):
  - **Review**, a week with no logged time (`week.totalMin = 0`, completed sessions; "Other"
    time counts): this week → "Nothing logged yet" + **Start focus** (`/focus`); a past week
    → "Nothing logged" and a future one → "This week hasn’t started yet", both without an
    action (focusing can't fill them). The headline is just "Your week." The quarter summary
    stays when the quarter has any time.
  - **Quests** without any quest (open or closed): "No quest yet" + what a quest is +
    **Create quest** (the dialog); the header button and the summary line give way. With
    only closed quests the page stays as it was.
  - **Calendar**, a week without any session (none logged, no live one, no planned blocks
    shown): "This week is empty" + **Log time** — the calendar's own Log time dialog at
    `emptyWeekLogStart` (`#lib/calendar.ts`: this week → the last half hour before now on
    today, quarter-hour aligned; a past week → its Monday 09:00; a future week → no action).
    The totals keep their place but are hidden; the day strip and grid return with the
    first session.
  - **Plan**, a week with no task planned on any day (`weekPlanned`, unfiltered — a quest
    filter or hidden done tasks never make a week "empty"): "Nothing planned" + **Add a task**,
    which shows the week (until the week changes) and focuses the add row of the selected
    day (today, `?day=`, or Monday). The backlog rail stays (desktop); the phone's day strip
    returns with the columns. Weeks with some tasks keep the phone's per-day empty state.
- **Tab bar labels** (phones): a small label (`--fs-tab-label`, 10 px) under every icon, the
  names of `t.nav` (Home/Start, Plan/Planen, Calendar/Kalender, Quests, Review/Rückblick) and
  **Me** / **Ich** under the avatar (`--tab-avatar` 22 px). The active tab — icon and label —
  is `--accent-text` on its pill. `--tabbar-h` 60 → 64 px; `main`, the mini-player and the
  phone calendar height follow through the token. German fits 375 px (the i18n phone test
  checks no label is truncated).
- **Section labels in sentence case**: `.label` is no longer uppercase-tracked — 14 px
  (`--fs-label`) semibold `--text-muted`; so are `GroupedList` headers, the palette's group
  labels and Plan's backlog group heads / collapsed rail strip. Uppercase stays only on the
  Focus screen (crumb, timer state — `--tracking-label`).
- **Wording** (EN → DE):
  - Streak count "3-day streak" → **"3 days in a row"** / „3 Tage in Folge“ (unchanged in
    German); milestone "7 days in a row — nice!".
  - Home's backlog head "7 open tasks" → **"7 in backlog"** / „7 im Backlog“.
  - "Other" everywhere for tasks without a quest: Plan's Other add row "Add an other task…" →
    **"Add to Other…"** / „Sonstige Aufgabe …“ → **„Zu Sonstiges …“** (Home's Other row uses it
    too, so its two add rows differ); Review "Quest work vs other" → "Quest work vs Other",
    the quarter line "other work" → "Other", chart texts ", other …" → ", Other …".
  - Placeholders say "task": Home's quest row "Add quest work…" → **"Add a task…"** / „Neue
    Quest-Arbeit …“ → **„Neue Aufgabe …“**; the filter "Filter quest work by quest" →
    "Filter tasks by quest" / „Aufgaben nach Quest filtern“.
  - Quest dialog: "Weekly budget · h" → "Weekly budget" (+ "h"), "Save changes" → "Save",
    the description placeholder → "Description (optional)", German „Icon“ → **„Symbol“**.
- **Hints only when they help** (`streakHint`, `#lib/streak.ts`): under Home's streak chip
  "Log 20 min more today to keep it" while a running streak needs time today, "Rest day —
  your streak is safe" on a rest day that carries it, and "Log 15 min today to start one"
  only once today has some time but not enough. Nothing while there is no streak and
  nothing logged today, nothing once today counts or a milestone shows.
- **Decisions**: the Review empty state's action only for the running week; Calendar/Plan
  hide their grid/columns (not just dim them) — the action brings them back; the quest
  dialog's default colour stays amber; the avatar slot's label is "Me"/"Ich" (the mock-up);
  tab labels reuse the nav names (German „Start“, „Planen“, „Rückblick“ as in the glossary,
  not the mock-up's English words); "Save" for edits (`t.common.save`).
- **Tests**: unit `hasQuestExtras` (`quest-form.test.ts`), `emptyWeekLogStart`
  (`calendar.test.ts`), `streakHint` (`streak.test.ts`). e2e: `quests.spec.ts` — create with
  folded options (icon/budget only after "More options", the emoji choice only after a tap,
  a server error reopens them), create with only name + colour stores the defaults, editing a
  quest with a budget opens folded options and saving keeps the budget, a quest without
  extras opens folded and keeps its values; `calendar.spec.ts` — an empty week's **Log time**
  logs a session (Monday 09:00) and brings the grid back; `plan.spec.ts` — an empty week's
  **Add a task** focuses Monday's add row, the task lands there; `review.spec.ts` — future /
  past empty weeks show the empty state (no KPIs, no action, week nav kept), a week with only
  Other time is not empty; `i18n.spec.ts` — German tab labels visible and not truncated.
  Updated: streak texts, Home/mobile placeholders, the filter's name, the quest dialog's
  labels, calendar/day-view slot tests (a session elsewhere keeps the grid), Plan week
  navigation (a task in every visited week).

## O4a — what exists

"Hierarchy and feedback", part one. The owner picked from the O4 mock-up ("Hierarchie und
Feedback"): points 1, 2, 3 (variant **A**, the card) and 5; point 4 (progress in the
navigation) and 6 (Review on phones) are O4b.

- **One primary button per screen.** Audit of every page and dialog for more than one filled
  accent button:
  - **Quests**: the dashed "New quest" tile after the cards is gone — the header's **New
    quest** is the one way to create (the empty page keeps O3b's `EmptyState`).
  - **Focus, running**: two round buttons like the stopwatch in Apple's Clock — **Complete**
    grey on the left, the likely next tap filled on the right (**Pause** while running,
    **Resume** when paused, **Start focus** / **Start break** while a pomodoro phase waits), ⋯
    (Log time, Stop, Discard) between them. A waiting break adds a grey **Skip**; a running
    break has no filled button (resting is the point), only a grey **Skip break**. Labels
    only, no icons; `--round-btn` 104 px / `--round-btn-phone` 94 px fit the longest label
    ("Überspringen") without hyphenation; `--round-btn-bg(-hover)` for the grey ones. Overtime,
    pomodoro dots, the cheer line and the picker are unchanged.
  - **Settings**: Save profile / Save goal / Save rest days, **Pair new device** and
    Notifications' **Turn on** are secondary — the page has no filled button unless the
    desktop app offers **Restart to update** (then that is the one) or a device is being
    renamed (its inline Save).
  - **Time-block dialog** (`BlockDialog`): its Add/Save was secondary like Cancel → primary.
  - Checked and unchanged: Home (Next up's button; the first-quest card is secondary), Plan
    (the phone's per-day empty state shows one day at a time), Calendar, Review, quest detail,
    every other dialog (one primary each), `/welcome`, `/setup`, `/pair`, `/offline`.
- **Accent only for the primary action and the "now".** `--accent` / `--accent-text` stay for
  the filled button, the running timer (Focus' clock/overtime/dots/crumb dot, the running row
  and its progress line, the desktop updater's and pairing code's live progress), the now line
  (Home's timeline, Calendar), "today" markers (Plan/Calendar/phone day strip, Review's today
  label and pip) and focus rings — plus, as Apple's tint, interactive text (links such as
  "All to today", "Whole day", "Plan tomorrow", the add row's "+ Add a task…", row actions'
  hover, the active tab and quest filter, selection ticks, drag-and-drop drop lines, the
  rename field's edge) and `--control-on` / `--selected-*`. Changed:
  - Review: the quest-hours KPI number → `--text`; the week deltas → `--text-muted` (no green
    for "better"); the per-day chart's today bar → `--progress-fill` (the label stays the
    today marker); "Quest work vs Other" → one segment per quest in its colour (most first),
    Other in slate (`splitSegments`, `#lib/review.ts`; `--chart-seg-gap`), the legend's quest
    dot dropped.
  - Calendar: the week bar's fill → `--progress-fill` (= `--text-2`).
  - **Streak flames → `--streak`** (`#ff9230`, Apple's system orange; filled when lit): the
    nav menu's streak, Home's meta line (`StreakStatus`), Review's "Longest streak" and the
    done day marks. Unlit flames stay `--text-faint`.
  - `EmptyState`'s symbol → `--text-muted` (the action below is the accent); Settings' own
    device icon and "This device" badge → neutral; the "Welcome — this device is now paired"
    notice → `--surface` + `--border-strong`; the styleguide's stat sample → `--text`.
  - Kept on purpose: the `/welcome` flow's symbols and links (the owner-approved O2 look),
    the avatar's goal ring (`--goal-ring`; the nav progress is O4b), `::selection`.
  - `contrast.ts` checks `--streak` ≥ 3:1 on `--bg` / `--surface` / `--surface-2` (9.4 / 8.5 /
    7.8:1), `--success-ink` on `--success`, `--success` on `--surface`, `--progress-fill` on
    `--track` — all ok.
- **"All done" (variant A).** When today had tasks and none is open — and no overdue task is
  still open (overdue tasks are open work, just older) — Home's Next up card becomes the
  **All done** card (`AllDoneCard.svelte`): a `--success` check circle with a soft halo that
  pops once (`pop`, `--dur-celebrate`, `--ease-spring`) when the card appears after the last
  tick — never on first paint or a reload, nothing under reduced motion — the title "All
  done" („Alles erledigt“), one line of facts ("4 tasks · 1 h 35 min logged · daily goal
  reached"; the logged part only when > 0, live with the timer; the goal part only when one is
  set and reached) and a plain accent-text link **Plan tomorrow ›** (`planDayHref`: Plan on
  tomorrow's week with the day selected). It stays while nothing is open and is replaced by
  Next up as soon as a task is added or reopened. No confetti, no sound, no button. The rule
  is `isAllDone({ total, open, overdue })` (`#lib/next-up.ts`) on unfiltered counts — the load
  sends `dayCounts` from today's lists before `?q=` / `?hideDone=` — so a quest filter or
  hidden done rows never fake or hide it. Today's list done while overdue tasks are open:
  Next up's empty state says "Today’s list is done" + "2 overdue tasks are still open." (the
  old "All done for today" title is gone). With no tasks at all the empty Next up stays. It
  shows while a timer runs too (a status, not an action).
- **One large title.** The global `h1` is the large bold title Home had (O3a): `--fs-title-lg`
  32 px (phones `--fs-title` 28 px), `--fw-bold`, `--tracking-title` (−0.025em) — Plan,
  Calendar, Quests, the quest detail (still in its quest colour), Review, Settings,
  Styleguide via `PageHeader`, Home without its own override. Focus, `/setup`/`/pair` and
  `/welcome` keep their own title styles. **Big numbers** share `--fw-figure` (semibold) in
  Geist with tabular figures: Review KPIs, the quarter summary, quest cards and the Quests
  summary, Calendar's week total, the Focus clock, the styleguide samples.
- **Motion** (tokens only, all off under reduced motion, nothing on first paint): rows of
  Home's Today list and Overdue group slide open when they appear (`rowIn`, `--dur-row`;
  Svelte's local intros skip the list's first render); a checked-off row glides to its new
  place in the done group, and rows close up after one leaves (`listFlip`: measure in
  `$effect.pre`, animate `translate` after the update; skipped when the update added a row).
  Sheets and dialogs arrive with a slight spring (`--ease-sheet`, ~2 % overshoot; the sheet's
  `--sheet-underlap` shadow hides the gap the overshoot would open). Numbers tick when they
  change: Home's "logged today" (as before) and Today's "N open".
- **Decisions**: the running break has no filled button; Complete sits left and the filled
  button right (stopwatch order), ⋯ in the middle; "All done" ignores the quest filter and
  hidden done rows; logged time on the card uses `formatDurationMin` (durations as text), the
  meta line keeps decimal hours; the card has no button (the link is enough, and the one
  primary of an all-done Home would be nothing); the today bar in Review's day chart is
  neutral (the mock-up's choice), its label stays accent.
- **Tests**: unit `isAllDone` (`next-up.test.ts`), `planDayHref` (`day-view.test.ts`),
  `splitSegments` (`review.test.ts`); `contrast.test.ts` runs the new checks. e2e
  `home.spec.ts` "All done" (`@mobile`): open tasks up to today are parked as done (restored
  afterwards); checking off today's last task with an overdue one still open shows "One
  overdue task is still open." and no card — checked against the reintroduced bug (overdue
  ignored → fails); checking off the overdue one shows the card with today's task count,
  which survives a reload; adding a task removes it, checking that off brings it back,
  reopening a done task removes it; **Plan tomorrow** opens `/plan?week=…&day=<tomorrow>`.
  `quests.spec.ts` / `mobile-polish.spec.ts`: "New quest" is a strict locator now (a second
  button fails). Focus' Pause/Resume/Complete keep their accessible names
  (`focus.spec.ts` unchanged).

## O4b — what exists

"Hierarchy and feedback", part two: points 4 and 6 of the O4 mock-up ("Hierarchie und
Feedback"), as the owner picked them — the ring at Home (phone **B**, desktop **B1**) and
Review on phones.

- **Daily-goal ring at Home** (`GoalRing.svelte`, rendered by `AppNav`): today's logged time
  vs the daily goal — the same number as before (`todayLog` + the running session via
  `liveLoggedMin` / `runningSpan`, never counted on the server) — moved from the avatar to the
  Home item. Desktop/tablet: a 16 px ring (`--goal-ring-sm`) before the word "Home"; phones:
  a 28 px ring (`--goal-ring-tab`) around the Home tab's icon, which shrinks to 17 px inside
  it. The tab ring keeps the icon's 22 px layout box and bleeds past it, so Home's label lines
  up with the other tabs. Accent fill on a neutral track (`--goal-track` = 15 % of `--text`,
  the mock-up's), `--success` once reached — with a check inside the small ring, or a small
  check badge on the tab ring's lower right (45°, clear of the label; the overdue dot keeps the
  upper right). No goal → no ring. The fill's transition stops under reduced motion (the
  global rule). Home's accessible name carries the progress after the overdue count: "Home,
  2 h of 3 h today" / "Home, 3 h 5 min of 3 h today, daily goal reached" (German „Start, … von
  … heute, Tagesziel erreicht“; `t.goal.progressDone`).
- **The avatar has no ring** anymore (nav avatar, account menu, the phone's "Me" tab):
  `Avatar`'s `ring` prop and `--avatar-ring-*` / `--goal-done-glow` are gone; its accessible
  name is just "Account and devices (Name)". Settings' goal text says "A ring at Home in the
  navigation fills up as you go." `/styleguide` shows `GoalRing` (small and tab, 0 % … reached).
- **Review on phones** (≤ 720px; wider screens keep O4a's grid and ignore `?view=`):
  - A `SegmentedControl` **Week | Quarter** under the title (a GET form, so it works without
    JS; with JS a change is a `goto` — a history entry, Back returns). The choice is
    `?view=quarter` (no `view` = the week; `parseReviewView`, `reviewViewHref`), read by the
    server, kept with `?week=`. The headline under the title is hidden on phones (the summary
    card says it).
  - **Week**: the week nav, one `SummaryCard` with three figures side by side — quest hours
    (+ "of 19h" with a budget), per day (all logged time ÷ elapsed days, like the desktop
    KPI) and the change in quest hours vs last week (`formatSignedHours`, the desktop's
    comparison label) — then the day bars, compact (`--chart-h-compact`), then a grouped
    `QuestList`: one row per quest (hours / budget, a thin bar in the quest colour only with a
    budget — `--chart-thin-h`; a row opens the quest; closed quests dimmed) and **Other** as
    the last row. The desktop's "Quest work vs Other" and "Hours by quest" cards and the
    quarter cards are not shown on phones.
  - **Quarter**: the quarter's range instead of the week nav, a `SummaryCard` with quest hours
    (of the quarter budget), per week (logged ÷ elapsed weeks) and the change vs the previous
    quarter, `QuarterBars` (quest hours per week, every week of the quarter — later ones as
    stubs, the shown week lighter; values as `sr-only` text) and the `QuestList` with quarter
    hours. Sparklines are dropped on phones.
  - **Previous-quarter comparison** (`ReviewQuarter.previous`, `#lib/review.ts`): the
    previous quarter's first `elapsedDays` days, the whole of it once the shown quarter is
    over (quarters differ in length); label "vs Q3 2026" / "vs this point in Q3 2026"
    (`quarterComparisonLabel`). `reviewRange` now loads from the previous quarter's start.
  - Empty: a week without time keeps O3b's `EmptyState`; a quarter without time gets the same
    kind (future: "This quarter hasn’t started yet"; past: "Nothing logged"; current: "Nothing
    logged yet" + **Start focus**).
  - One tree for both layouts: CSS hides `desk-only` / `phone-only` parts, so SSR needs no
    viewport guess; phone-only parts have their own test ids.
- **Decisions**: the check on the phone is a badge, not a replacement for the Home icon; the
  third quarter figure is the change vs the previous quarter (mirrors the week); per-week
  bars count quest hours like the day bars; the Other row has a slate dot so the names line
  up; the headline is hidden on phones; the title stays "Weekly review".
- **Tests**: unit (`review.test.ts`) — previous-quarter span (partial, finished, future),
  `reviewRange`, `quarterWeekTotals`, `parseReviewView`, `reviewViewHref`,
  `quarterComparisonLabel` (EN/DE). e2e `profile.spec.ts` (`@mobile`): the ring assertions
  moved from the avatar to Home (accessible name and `data-progress`, live with the timer,
  without double counting; the avatar has no ring); new: the ring turns "reached"
  (`data-done`, name) live while a timer runs past the goal and back after a discard; "No
  daily goal" leaves Home's name without progress and no ring anywhere. `review.spec.ts`
  (`@mobile-only`, iPhone): the summary and list match SQL aggregates; Quarter sets
  `?view=quarter`, survives a reload, shows the quarter's numbers (incl. the change vs the
  same span of the previous quarter) and hides the week; Back returns to the week.
