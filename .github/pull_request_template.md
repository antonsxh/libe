## What and why

<!-- What does this PR change, and why? Link the issue it fixes: "Fixes #123". -->

## How I tested it

<!-- Commands you ran, what you clicked through, which devices/browsers. -->

- [ ] `bun run check` (0 errors, 0 warnings)
- [ ] `bun run lint`
- [ ] `bun run test`
- [ ] `bun run build`
- [ ] `bun run test:e2e`
- [ ] `bun run test:e2e:mobile` (layout / touch UI changes)
- [ ] `bun run test:tauri` (`src-tauri/` or pairing/session API changes)

## Screenshots

<!--
UI changes need before and after screenshots (desktop and phone width if the layout changed).
Add a short video when the change is about motion or timing.
Upload them here (drag them into this field) — do not commit them. Delete this section otherwise.
-->

## Checklist

- [ ] New behaviour has tests (unit tests for pure logic, an e2e test following the rules in `AGENTS.md`)
- [ ] New user-visible strings are in both `en.ts` and `de.ts`
- [ ] Schema changes come with a generated migration in `drizzle/`
- [ ] `AGENTS.md` + `CLAUDE.md` (kept identical) and docs updated if conventions or setup changed
