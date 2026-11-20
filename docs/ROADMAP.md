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
         pomodoro_long_break_every, pomodoro_auto_start, language auto|en|de, updated_at)
                                                       -- M4, single row; language: 0003_ui_language
devices(id, token_hash UNIQUE, name, kind browser|pwa|tauri, user_agent, paired_at, last_seen_at,
        cookie_renewed_at, revoked_at)                                    -- M7 (0002_devices)
pairing_codes(id, code_hash, expires_at, used_at, attempts, created_by_device_id → devices,
              device_id → devices, created_at)                            -- M7, 6-digit codes, hashed
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
- `/settings` (route group `(app)`, avatar menu in `AppNav`: Settings · Pair new device · Sign
  out this device): device list (kind icon, paired, last seen, "This device"), rename, revoke
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
  permission-gated). The pairing commands stay local-only.

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
  (session), Zeit erfassen (log time), Zeitblock, koppeln / Kopplungscode (pair), Setup-Secret,
  Update-Kanal (update track), Sonstiges (other).
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

### Phase 3 — streaks (planned)

- Days on which the daily goal was met in a row (reuses `daily_goal_min` and `todayLog`'s
  definition of a day's logged time).
