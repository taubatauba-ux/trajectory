# Trajectory — Part 5 Progress Report (Trends & Secondary Screens)

**Read this alongside `PROGRESS_REPORT.md`, not instead of it.** This is a separate file
on purpose: Parts 2, 3, and 4 were being built in parallel sessions against the same
Part 1 checkpoint when this was written, each presumably producing their own work
bundle. Editing the shared `PROGRESS_REPORT.md` from four simultaneous sessions is a
guaranteed merge conflict; a separate per-part report isn't. Whoever integrates all four
parts back together should fold this into `PROGRESS_REPORT.md` as the new "Part 5 —
COMPLETE" section (replacing its current "Part 5 — not done" bullet) and delete this
file at that point.

---

## How this fits together with Parts 2/3/4

This session started from `trajectory-work-part1.zip` exactly as checked in — unzipped,
`npm install`, `npm test` (10/10 passed) and `npm run build` succeeded before anything
was touched, per `PROGRESS_REPORT.md`'s own resume instructions.

**Everything built this session is new files under `src/screens/`.** Verified by diffing
every file outside that directory against a fresh extraction of the original
`trajectory-work-part1.zip` (see "Verification" below) — `src/types/`, `src/engine/`,
`src/data/db.ts`, `src/design/tokens.ts`, `src/index.css`, `tailwind.config.js`,
`vitest.config.ts`, every `tsconfig*.json`, `.eslintrc.cjs`, `App.tsx`, and `main.tsx` are
all **byte-for-byte identical** to the Part 1 checkpoint. The only file outside
`src/screens/` that changed is `package.json` (+3 devDependencies, purely additive — see
"Testing approach" below), and its lockfile as a consequence.

This was deliberate, not incidental: with Parts 2/3/4 editing the same starting point
concurrently, touching any shared file risks a conflict none of the four sessions can see
coming. The one exception is `package.json`'s devDependencies list, which is low-risk to
merge (union of new packages) even in the worst case of overlap.

**Integration steps, once all four parts are back together:**
1. Merge the four work bundles' `src/` trees. If Parts 2-4 followed the same
   discipline (new files only, no shared-file edits), this is a plain union — no
   conflicts expected. `package.json`: union the `devDependencies` each part added.
2. Re-run `npm install`, then `npm run typecheck`, `npm run lint`, `npm test`, and
   `npm run build` on the merged tree. Don't assume it's fine because each part was
   fine individually — this is the first point all four have actually coexisted.
3. Part 3's router needs to mount the four screens this part built. See "Integration
   contract for Part 3" below for the exact shape each screen expects to be dropped
   into a `<Route>`.

---

## What "done" means below

Same bar as `PROGRESS_REPORT.md` set for Part 1: everything marked done was **actually
run** — `tsc -b` typechecked clean, `eslint . --ext ts,tsx` reported zero issues, `npm
test` executed and passed, `npm run build` produced a real `dist/`. Beyond that, this
part leans harder on one additional check Part 1 didn't need: **component-level
rendering tests** (jsdom + React Testing Library, see below) that actually mount each
screen against a seeded in-memory database and assert on the rendered output, not just
that the supporting logic functions return the right values in isolation.

One process note in the interest of the same honesty this report format is for: over the
course of this session, this chat's visible context was trimmed for length more than
once, and chunks of work had already happened in the parts that got trimmed — most of
Habit Tracker and Period Tracker after the first trim, and this report itself (plus the
Progress Photos `checkInId` parameter) after a later one. Rather than trust memory of
what state things were in after each trim, everything was re-verified from scratch
before continuing: every file re-read, a full diff of every shared file against a fresh
extraction of the original zip (see above), `tsc`/`lint`/tests re-run each time. The
`filterByRange` bug described under "Bugs found and fixed" was caught during the first
such re-verification pass, not before it. The final pass (immediately before packaging)
caught a smaller thing in the same spirit: this report itself, once found, had already
gone stale in two numbers (test/file counts, from before `color.test.ts` was added) —
fixed by re-counting rather than trusting the numbers already on the page. Practical
takeaway for whoever reads this next: treat "found already done in this report" the same
as "found already done in the code" — recheck it against a real run rather than assuming
either is current.

---

## Part 5 (this session) — COMPLETE

All four screens from `PROGRESS_REPORT.md`'s Part 5 bullet: History & Trends (§9.8),
Habit Tracker (§9.9), Period Tracker (§9.10), Progress Photos (§9.11). Checked line by
line against the spec's exact bullets for each (see each subsection below) — nothing in
§9.8-9.11 was skipped, and nothing from §9.1-9.7 or §9.12 (other parts' territory) was
touched.

### §9.8 History & Trends — `src/screens/HistoryTrends/`

| Spec requirement | Implementation |
|---|---|
| Weight trend chart (Recharts) | `WeightTrendChart.tsx` — Kalman trend line + raw weigh-in markers, outliers visually distinguished |
| Expenditure chart (Recharts) | `ExpenditureChart.tsx` — TDEE line + ±1 SD band |
| "Zero smoothing/estimation math itself" | `chartData.ts` only rounds/reshapes `debug.replay`; every number displayed traces back to something the Engine returned |
| Adherence: logged-days streak | `adherence.ts`'s `computeLoggedDaysStreak` (thin wrapper over `_shared/streaks.ts`, see below) |
| Adherence: avg macro accuracy, trailing 7/30 days | `adherence.ts`'s `computeAdherenceForWindow`, called for both windows in `index.tsx`, rendered in `AdherencePanel.tsx` |
| CSV export (date, weight, kcal, protein, carb, fat) | `csvExport.ts` — exact column order from the spec text |

Two things worth knowing about how this screen gets its data, since they're judgment
calls rather than direct spec transcription:

- **Historical macro targets.** The Engine's `debug.replay` only carries
  `displayedTargetKcal` per day — Module F computes the protein/fat/carb split
  (`splitMacros()` in `targetLimiter.ts`) once, for *today's* final point only, not
  retroactively for every historical day. To compare logged protein/fat/carb against a
  target for the adherence view's trailing-window days, `adherence.ts`'s
  `reconstructHistoricalTargets()` calls that same exported, stateless `splitMacros()`
  per historical day, using that day's own `displayedTargetKcal` and Kalman-estimated
  `state.W`. This is reuse of the Engine's own deterministic arithmetic applied to a
  historical day, not new estimation logic in the app layer — but it's worth a second
  pair of eyes given how firmly both spec documents insist screens shouldn't do their
  own estimation math.
- **The ±SD band's caveat.** `adaptive-tdee-engine-spec-v2.md` §5.7 says explicitly:
  *"any UI surfacing this confidence interval should not present it as the total
  uncertainty."* `ExpenditureChart.tsx` carries a caption saying exactly that (band
  reflects the filter's own fit to logged data, not full parameter uncertainty) rather
  than silently rendering a band that looks more authoritative than the spec says it is.

CSV export is **raw logged data** (actual weigh-ins + actual daily macro totals), not
Engine targets — matches the spec's own "share with a coach" framing (a coach wants to
know what happened, not what the Engine was aiming for).

`useEngineHistory.ts` calls `runAdaptiveTdeeEngine()` directly (not `callEngine()`),
because this screen specifically needs `debug.replay`, which `callEngine()` doesn't
return — this is exactly the re-export `callEngine.ts`'s own comment says exists for
this purpose. It throws if there are zero weigh-ins; the hook catches that and the
screen shows an empty state rather than a crash (see "Empty states" below).

### §9.9 Habit Tracker — `src/screens/HabitTracker/`

| Spec requirement | Implementation |
|---|---|
| User-defined `HabitDefinition` list (name + icon) | `HabitFormSheet.tsx` (create/edit), emoji-based icon picker |
| Daily binary check-off | `HabitRow.tsx`, backed by `useHabits.ts`'s `toggleHabitEntry` |
| Compact strip on the Dashboard | `HabitStrip.tsx` — built and exported, **not wired into the Dashboard itself** since that screen is Part 3's; see "Integration contract" below |
| Full history grid on this screen | `HabitHistoryGrid.tsx` |

Habits use `active: false` as a soft delete (deactivate, don't destroy) so historical
`HabitEntry` rows never get orphaned by deleting their parent definition — matches what
the `active` field on `HabitDefinition` is evidently for.

One honest limitation: `HabitDefinition` has no `createdAt`, so `habitStats.ts`'s
completion-rate calculation can't tell "created yesterday" from "created a year ago" —
a brand-new habit will show e.g. 1/7 for its trailing-week completion rate rather than a
correctly-scoped 1/1. Documented in `habitStats.ts`'s own comment. Adding `createdAt`
would need a schema change (`db.ts`, a shared file), so this wasn't fixed unilaterally —
flagged for whoever next touches the shared schema.

### §9.10 Period Tracker — `src/screens/PeriodTracker/`

| Spec requirement | Implementation |
|---|---|
| Calendar-based flow/symptom logging (`PeriodEntry`) | `MonthCalendar.tsx` (month grid, tap a date) + `DayEntrySheet.tsx` (flow level + symptom chips for that date) |
| Independent of nutrition loop, same local DB | Confirmed — this screen makes no `EngineRequest`, doesn't import `engine.types.ts` at all |
| "Available to the Engine's request payload if it wants to use it... flagged, not built into the contract" | Left exactly that way. `engine.types.ts` was **not** touched. `PeriodEntry` rows exist in `db.periodEntries`, ready for a future session to thread into `EngineRequest.history` if that's ever wanted — this part didn't make that call unilaterally since the spec explicitly frames it as optional |

`cycleStats.ts` segments logged dates into "episodes" (contiguous runs of days with a
flow entry) and derives current cycle day / average cycle length / average period
length / a predicted next start from the gaps between episode start dates. Two
deliberate simplifications, both documented in that file:
- A one-day gap mid-period (day 1 logged, day 2 missed, day 3 logged) reads as two
  separate episodes rather than one with a gap — a real limitation for anyone who
  doesn't log every single day of their period, not a bug.
- Predictions need ≥2 logged episodes and are captioned as a rough estimate from the
  user's own history, not a clinical prediction — deliberately hedged given this is
  health data the app has no business overclaiming precision about.

### §9.11 Progress Photos — `src/screens/ProgressPhotos/`

| Spec requirement | Implementation |
|---|---|
| Timestamped photo storage (IndexedDB blobs) | `photoStore.ts`, on the existing `ProgressPhoto` type/table from Part 1 |
| Simple side-by-side comparison between any two dates | `ComparisonView.tsx` — tap any two photos in the grid, they render in two fixed-aspect-ratio panes with a "N days apart" caption |

Photo capture goes through `<input type="file" accept="image/*" capture="environment">`
(native camera/gallery picker, zero new dependencies) into `PhotoCaptureSheet.tsx`, an
inline confirm card with a preview and an **editable** date field (defaults to today,
but can be backdated) — so importing an older photo when first setting up the app still
gets stored under its real date, not the upload date. `addPhoto()` also takes an
optional `checkInId`, unused by this screen's own capture flow (every photo added here
is ad hoc by definition) but there for Part 4's Check-In flow (§9.6) to call directly if
it wants to link a photo captured during check-in to that `CheckIn`, per
`types/media.ts`'s own comment about that field.

Blob-to-`<img>` display goes through a small `useObjectUrl` hook that creates and
revokes browser object URLs on the correct lifecycle — worth calling out because getting
this wrong (never revoking) is a real, easy-to-miss memory leak in exactly this kind of
"show a Blob as an image" code.

---

## Shared infrastructure added

### `src/screens/_shared/`

New, scoped deliberately under `screens/` rather than a project-wide `src/lib/` —
this project doesn't have a shared-utilities convention yet (`adaptiveTdeeEngine.ts`
hand-rolls its own private date helpers rather than importing a shared one), so
introducing a project-wide one wasn't this part's call to make unilaterally mid-parallel-build.
If a future integration pass wants to promote any of these to somewhere more central,
they're small and self-contained enough to move easily.

- **`dates.ts`** — UTC-anchored date math (today/add-days/enumerate/month-grid/etc.),
  used by all four screens. Deliberately UTC-based, matching
  `adaptiveTdeeEngine.ts`'s exact convention (`toDateOnly`/`enumerateDates` there also
  treat every date as a UTC calendar day), so date-string comparisons against Engine
  output never drift by a day. This does mean "today" is the UTC calendar day, not
  necessarily the user's local calendar day — a pre-existing quirk inherited from Part
  1's engine, not introduced here, but worth another part's attention someday (see
  "Known limitations" below).
- **`streaks.ts`** — `computeConsecutiveDayStreak()`, factored out once it became clear
  both History & Trends' logged-days streak and Habit Tracker's per-habit streaks
  needed the identical "consecutive days counting back from today, tolerant of today
  itself being empty" algorithm. `HistoryTrends/adherence.ts`'s
  `computeLoggedDaysStreak` is now a one-line wrapper over this rather than a
  duplicate implementation.
- **`chartTheme.ts`** — Recharts styling (colors, fonts, tooltip style) built on top of
  `design/tokens.ts`, not a second palette invented independently.
- **`color.ts`** — see "Bugs found and fixed" immediately below; this is the fix, not
  the bug. `color.test.ts` covers `hexToRgba` directly (round-trips a known token color,
  rejects malformed hex input, and checks every actual color in `design/tokens.ts`
  converts without throwing) — added during a final review pass after noticing every
  other pure function in this part had direct tests and this one didn't.

### Testing approach (why `vitest.config.ts` wasn't touched)

`vitest.config.ts` runs tests under Node (`environment: 'node'`) and only picks up
`*.test.ts`/`*.spec.ts` — no jsdom, no `.tsx` test files, which meant it had never run
an actual component render before this part (Part 1's only React file, `App.tsx`, isn't
unit tested — verified only by `npm run build` producing a real bundle). Any of Parts
2-4 building UI was going to hit this same wall.

Rather than change that shared config file (`environment` and the `include` glob) with
three other sessions potentially wanting something different from it concurrently, every
component test in this part:
- stays a `.test.ts` file (matches the existing `include` glob unmodified) and uses
  `React.createElement` instead of JSX, since `.ts` files can't contain JSX syntax;
- opts into jsdom **per file** via Vitest's `// @vitest-environment jsdom` docblock
  (a standard, documented Vitest feature) rather than changing the global default;
- polyfills two things jsdom doesn't implement, minimally and locally to the test files
  that need them: `ResizeObserver` (Recharts' `ResponsiveContainer` needs one to mount)
  and `URL.createObjectURL`/`revokeObjectURL` (needed anywhere a Blob becomes an
  `<img src>`).

`package.json` gained three devDependencies for this: `jsdom`, `@testing-library/react`,
`@testing-library/dom`. All additive — nothing existing changed. `npm audit
--omit=dev` confirms zero production-dependency vulnerabilities; everything flagged is
inside this dev/test-only tooling, which never ships in the built PWA.

This buys real verification: every screen's smoke test seeds `fake-indexeddb` with
realistic rows, mounts the actual screen component, and asserts on rendered output —
for History & Trends specifically, that means the **real** `runAdaptiveTdeeEngine()`
runs against seeded weigh-ins/logs and Recharts actually renders the result, not a
mocked version of either. `HabitTracker` and `PeriodTracker`'s smoke tests go further
and simulate real clicks (toggle a habit, log a period day, save) and assert the write
landed in the (fake) database and the UI updated reactively via `useLiveQuery` without a
manual refetch.

If a future part wants proper `.tsx` test files and a global jsdom default instead of
this per-file-opt-in approach, that's a reasonable thing to standardize — just do it
once, deliberately, with visibility into what all of Parts 2-4 need from it, rather than
each part guessing independently.

---

## Bugs found and fixed during this session

- **Tailwind opacity modifiers silently produce no CSS rule on this project's custom
  colors.** `bg-accent/15`, `ring-accent/50`, `text-ink-muted/70`, etc. — anywhere a
  Tailwind color utility from this project's custom palette (`accent`, `surface`,
  `ink-muted`, `hairline`, the `tag-*` colors — all of §10's design tokens) was combined
  with a `/NN` opacity suffix. Root cause: Tailwind's opacity-modifier syntax needs a
  color defined in a special format (`rgb(var(--x) / <alpha-value>)`); this project's
  tokens (`tailwind.config.js`) reference CSS variables as plain color values
  (`var(--accent)`), which don't support the modifier — Tailwind silently drops the
  whole utility rather than erroring. **Verified empirically, not just reasoned about:**
  built a throwaway probe component using several of these classes, temporarily wired it
  into `main.tsx`, ran `npm run build`, grepped the compiled CSS output, and confirmed
  zero rules were emitted for any of them — then reverted `main.tsx` and re-diffed it
  against the original to confirm the revert was clean (see "Verification" below).
  Found in 10 places across `HabitFormSheet.tsx`, `HabitStrip.tsx`, `HabitRow.tsx`,
  `HabitHistoryGrid.tsx`, `MonthCalendar.tsx`, `DayEntrySheet.tsx`, and — worth
  admitting — this session's own earlier `HistoryTrends/index.tsx`. Fixed two ways
  depending on the case: a background-wash-on-selected-state pattern (5 places) now
  uses `_shared/color.ts`'s `hexToRgba()` plus an inline `style`, since the color needs
  to be genuinely translucent; a few purely-cosmetic extra-dimming cases (3 places,
  `text-X-muted/70`) were simplified to the plain (already-muted) color instead, since
  the visual difference was marginal and not worth an inline-style workaround. This bug
  is **pre-existing in Part 1's `tailwind.config.js`/`index.css`** (the token
  definitions), not introduced by this part — but it was Part 5's screens that were the
  first to actually hit it. Not fixed at the source (that's a shared-file change with
  the same cross-part-conflict risk discussed throughout this report) — `color.ts`'s
  own comment documents the root cause and a proper fix (switching the token format to
  support Tailwind's opacity syntax) for whoever next has a reason to touch
  `tailwind.config.js`.
- **`chartData.ts`'s `filterByRange` had a sort-direction bug on first write**, caught
  by its own unit test failing (not by inspection): a date-range filter used
  `daysBetweenISO(a, b)` directly as a sort comparator, which is backwards (the function
  returns positive when `b` is later, but a comparator needs negative when `a` should
  sort first). Fixed by switching to plain `localeCompare` on the ISO date strings where
  sorting was needed (`'YYYY-MM-DD'` sorts correctly lexicographically) — the same trick
  `adaptiveTdeeEngine.ts` already uses for sorting weigh-ins, rather than reasoning
  about day-count subtraction sign conventions. Separately, `filterByRange`'s original
  signature inferred its cutoff date from the array's own last element, which is correct
  for a single series but silently wrong when filtering two series of different lengths
  to the same window (the raw-weigh-in series is sparse and its last element usually
  isn't "today") — changed to take an explicit anchor date instead, so
  `WeightTrendChart`'s trend line and raw-weigh-in markers can't silently end up
  filtered to two different date ranges.

---

## Integration contract for Part 3 (and, for one piece, Part 4)

Since navigation/routing is explicitly Part 3's job (`PROGRESS_REPORT.md`: *"Replace
[`App.tsx`] entirely once routing + real screens exist (Part 3 below)"*), none of these
four screens were wired into `App.tsx`/`main.tsx`, and neither file was modified. Each
screen instead follows one consistent contract so Part 3's router can mount it directly
once it exists:

- **Default export, zero required props.** `HistoryTrends`, `HabitTracker`,
  `PeriodTracker`, `ProgressPhotos` — each `src/screens/<Name>/index.tsx` exports a
  component that takes no props and fetches everything it needs itself (via
  `useLiveQuery`/Dexie). Drop any of them straight into a route:
  `<Route path="/history" element={<HistoryTrends />} />`.
- **No nav chrome.** Each screen renders only its own content area (a heading, then its
  content) — no back button, no bottom nav, no app-frame header. That's the navigation
  shell's job to wrap around whatever's routed, per Part 3's own scope.
- **`HabitStrip.tsx`** (`src/screens/HabitTracker/HabitStrip.tsx`) is built specifically
  for Part 3's Dashboard to import and place — a compact horizontal row of today's
  habits as tappable icons, matching §9.9's "shown as a compact strip on the Dashboard."
  It's not used anywhere in this part's own screens (Habit Tracker's own `index.tsx`
  uses the fuller `HabitRow`/`HabitHistoryGrid` instead) — it exists purely for Part 3
  to pick up.
- **`addPhoto(date, blob, note?, checkInId?)`** (`src/screens/ProgressPhotos/
  photoStore.ts`) takes an optional `checkInId` for Part 4's Check-In flow (§9.6) to
  call directly if a check-in captures a progress photo, rather than duplicating the
  insert logic.
- One **bundle-size note** for whichever part ends up building/tuning the router:
  temporarily wiring all four screens into one build to verify they compile together
  (see "Verification" below) pushed the single JS bundle to ~690 KB minified (~202 KB
  gzipped), past Vite's 500 KB warning threshold — almost entirely Recharts, which only
  History & Trends needs. Once real routing exists, `React.lazy()`-based code-splitting
  per route would keep Recharts out of the initial bundle for anyone who never opens
  that screen. Not something to fix in this part (there's no router yet to split
  against), just worth doing when one exists.

---

## Known limitations / deliberate scoping decisions

Collected here rather than only inline, so a future session doesn't have to re-derive
them from scattered comments:

1. Weight always displays in kg — no imperial unit support. `UserProfile`/`WeighIn`
   have no unit-preference field, and §9.12 (Settings, explicitly Part 6) is where a
   metric/imperial toggle belongs per the spec. Not invented here.
2. "Today" is the UTC calendar day throughout (inherited convention from
   `adaptiveTdeeEngine.ts`, kept consistent rather than diverged from) — could show a
   different "today" than a user's local calendar for part of the day, depending on
   timezone. Pre-existing, not introduced by this part; flagged for whoever next has
   reason to revisit the Engine's date handling project-wide.
3. `HistoryTrends/dailyLogTotals.ts`'s daily-macro-totals aggregation
   (`getAllDailyTotals()`) has no shared home in `src/data/` — Part 3's Dashboard likely
   needs the identical aggregation for its own daily ring. Deliberately not centralized
   this session (no visibility into what Part 3 was concurrently building against the
   same starting point); the two are meant to be interchangeable (same
   `Map<dateISO, Macros>` output shape) if Part 3 already built an equivalent —
   whichever one lands, prefer keeping just one.
4. Habit completion-rate stats can't scope to "since this habit was created" (no
   `createdAt` on `HabitDefinition`) — see the Habit Tracker section above.
5. Period cycle-length prediction doesn't bridge single-day logging gaps within one
   period, and needs ≥2 logged episodes before predicting anything — see the Period
   Tracker section above.
6. Period data (`PeriodEntry`) is not threaded into `EngineRequest` — per the spec's own
   framing, this is optional/flagged, not required, and this part didn't make the call
   to wire it in unilaterally.
7. `tailwind.config.js`'s custom color tokens don't support Tailwind's opacity-modifier
   syntax — worked around in this part's own files (`_shared/color.ts`), not fixed at
   the source. See "Bugs found and fixed" above.
8. Separately from (7): §10 of the spec and the actual `tailwind.config.js`/`tokens.ts`
   disagree on which hex value maps to which *semantic* tag color — the spec's table has
   `tag-icmr` as gold/tan, `tag-off` as blue-grey, `tag-custom` as purple; the shipped
   tokens have `tagIcmr` as blue, `tagOff` as purple, `tagCustom` as gold (each spec
   color appears somewhere in the shipped tokens, just under a different key). Noticed
   while reading `design/tokens.ts` for this part's chart theming; not touched, since
   none of Part 5's screens use the source tags (that's Search Results/Dashboard,
   Part 3's territory) and guessing which side is "correct" isn't this part's call.
   Flagging it here since Part 3 is the part actually likely to render these tags.

---

## Verification

- `npx tsc -b` — zero errors, full project including all Part 5 files.
- `npm run lint` (`eslint . --ext ts,tsx`) — zero errors, zero warnings.
- `npm test` — **117/117 passing**, 19 test files:
  - 10 pre-existing (Part 1's engine tests, untouched, still passing)
  - 107 new: pure-logic unit tests (dates, streaks, chart data shaping, adherence math,
    CSV formatting, cycle stats, habit stats, hex-to-rgba color conversion) plus
    Dexie-backed tests using `fake-indexeddb/auto` (daily-log aggregation, habit/period/
    photo CRUD, including a dedicated test that Blobs round-trip through
    `fake-indexeddb` with their type/size/content intact, and that a photo's optional
    `checkInId` round-trips correctly) plus jsdom component-rendering smoke tests for
    all four screens (see "Testing approach" above).
- `npm run build` — succeeds, produces a real `dist/`, identical module count (44) to
  the Part 1 checkpoint (expected: none of the four screens are imported from
  `main.tsx` yet, since wiring that up is Part 3's job).
- **Additional integration check:** temporarily wired all four screens into a scratch
  `main.tsx` (rendering all four stacked, for build purposes only), ran `npm run
  build`, confirmed a clean production build with all four screens' code actually
  bundled (875 modules transformed, vs. 44 in the untouched build) with zero errors —
  then reverted `main.tsx`. Reverted-file integrity was checked twice: once by `cat`-ing
  the restored file, and again (after noticing the first restore attempt had silently
  failed to execute due to an unrelated shell syntax error — caught by checking, not
  assumed) by diffing every shared file in the repo against a fresh extraction of the
  original `trajectory-work-part1.zip`. Every file outside `src/screens/` came back
  identical except `package.json`/`package-lock.json` (the intended devDependency
  additions).

---

## File manifest (this part's work bundle)

`trajectory-work-part5.zip` contains the full project tree as left by this session:
Part 1's untouched files plus everything under `src/screens/` (50 new files — 4 screens'
worth of components, hooks, pure-logic modules, and tests, plus the `_shared/`
utilities), plus this report and the updated `package.json`/`package-lock.json`.
`node_modules/` and `dist/` are excluded on purpose, same as Part 1's bundle — `npm
install` and `npm run build` regenerate both.

## Suggested next-session prompt (once Parts 2-4 are also back)

> Integrate the four parallel work bundles for the Trajectory app — Parts 2, 3, 4, and
> 5 — into one tree, starting from the Part 1 checkpoint each was built against. Attach
> all four zips, `PROGRESS_REPORT.md`, `PART5_PROGRESS_REPORT.md` (and any equivalent
> per-part reports Parts 2-4 produced), and both spec files. Merge the `src/` trees
> (should be a plain union of new files if every part stayed out of shared files the
> way Part 5 did — check each part's own report for whether that held), union
> `package.json`'s devDependencies, then actually run `npm install` + typecheck + lint +
> test + build on the *merged* tree before assuming it works — this is the first time
> all four parts' code will have coexisted. Wire Part 5's four screens into Part 3's
> router per this report's "Integration contract" section. Then continue to Part 6
> (Settings + polish, §9.12) once the merged tree is confirmed healthy.
