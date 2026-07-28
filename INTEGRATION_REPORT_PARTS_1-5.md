# Integration Report — Parts 1 through 5 merged

Companion to `PROGRESS_REPORT.md` (Part 1), `PROGRESS_REPORT_part_2.md` (Part 2),
`PROGRESS_REPORT_PART3.md` (Part 3), `PART4_PROGRESS_REPORT.md` (Part 4), and
`PART5_PROGRESS_REPORT.md` (Part 5) — all preserved in this zip under their own names.
This file covers the integration pass only: taking four parallel sessions that each
branched from Part 1 in isolation, with **zero visibility into each other's work**, and
merging them into one repo that is internally consistent, builds clean, and passes its
own test suite.

**Status: merged, wired, verified.** `npm install`, `npm run typecheck`, `npm run lint`,
`npm test` (277 tests / 37 files), and `npm run build` all run clean in this sandbox —
the first time any of that has been possible for this codebase, since none of Parts
2–5's sandboxes had working npm registry access (see each part's own "Build environment"
section). That gap is exactly where this pass earned its keep: several of the fixes
below are things `tsc` or an actual render would have caught immediately, and nothing
short of running them could.

## How this was done

Not by trusting the five prose reports at face value — by diffing each part's full repo
snapshot against the Part 1 baseline (`diff -rq`) to get a hard, literal list of every
file each session touched or added, then reading the actual source for anything the
diffs flagged as touched by more than one part. The reports were extremely useful for
*intent* (several — Part 3 and Part 5 especially — explicitly anticipated this exact
integration pass and left notes aimed at it), but verification went against the code
itself, the same principle Part 4's own report used internally.

Merge order: Part 1 (baseline) → Part 2 (additive only — search, data pipelines) → Part
3 (nav shell, Dashboard, shared components, two schema/type additions) → Part 4
(Onboarding, Check-in, Food/Recipe Detail, Recipe Builder) → Part 5 (History & Trends,
Habit Tracker, Period Tracker, Progress Photos). This follows each part's own
dependency direction — nothing in Parts 2 or 3 depends on Parts 4 or 5, but Part 4 and 5
each have real integration points *into* Parts 2 and 3's work.

## Collisions — same name, different (or same) thing

Four places had two parts independently building something under the same name, since
neither could see the other coming.

| Name | Part 3's version | Part 4's version | Resolution |
|---|---|---|---|
| `MacroRing` | Dashboard's single big kcal ring (`current`/`target` props, no loading state) | Multi-use ring with a `loading`/skeleton state, `value`/`target` props | **Kept both.** Part 4's renamed to **`TargetRing`** (2 call sites updated: `ReviewStep`, `ComparisonStep`). Not interchangeable despite Part 4's own merge note — different required props, and Part 4's loading state is a real spec requirement (§9.1's skeleton macro-ring) Part 3's version doesn't have. |
| `LedgerRow` | Swipeable log-entry row (`children`/`actions`/`onTap`) | Plain label/value display row (`label`/`value`/`sublabel`) | **Kept both.** Part 4's renamed to **`DetailRow`** (5 call sites updated: `RecipeBuilder`, `FoodDetail`, `RecipeIngredientsList`, `BodyCompositionStep`, `ReviewStep`). These are unrelated components that happened to share a name — not a style variant of each other. |
| `TagChip` | Takes a whole `FoodItem`, derives source/code itself; ICMR chips render the item's own IFCT code (e.g. `A007`) | Takes `source`/`code`/`isRecipe` as primitives | **Standardized on Part 3's `item`-based version.** Both call sites always had a full `FoodItem` in scope, so this was a real choice, not a forced one — went with Part 3's for the tighter spec match (§9.3: "rendered in the style of the book's own food codes," which is the code alone, not `IFCT · A007`) and because deriving from the item centralizes the source/code/isRecipe logic in one place instead of trusting each caller to pass matching primitives. 2 call sites updated (`RecipeBuilder`, `FoodDetail`). |
| Flag→copy mapping | `lib/flagLabels.ts` (`describeFlag`, tone: info/caution/dev, has stub-collapsing logic) | `engine/flagPresentation.ts` (`presentFlag`, severity: info/caution/warning, imports actual flag constants rather than hardcoding strings) | **Not actually a collision** — different file names, different export names. Verified both against the real flag constants in `engine/outlierGate.ts`/`targetLimiter.ts` (Part 3 hardcoded the literal strings; Part 4 imported the constants — both correct, Part 4's is safer against future drift). Kept both as-is; each is wired to its own screen. |

## Real bugs found and fixed

These aren't merge mechanics — they're things that were wrong regardless of the merge,
caught either by cross-referencing what one part explicitly built to prevent against
what another part's code actually did, or by finally running the compiler.

**1. Check-in fed today's partial food log to the Engine as if it were final.**
Part 3's `engine/buildEngineRequest.ts` exists specifically to exclude today's date from
`history.dailyLogs` before calling the Engine — its own header comment explains why in
detail (today's total is a moving target; the Kalman filter has no way to know a date's
total is partial vs. final) and explicitly says this "applies to any caller… and
eventually Check-in." Part 4 had no visibility into that file and built Check-in against
its own `data/dailyLogs.ts` aggregation directly, which does *not* exclude today. Fixed
by switching `CheckIn.tsx` to call `buildEngineRequest()` like the Dashboard does.

**2. History & Trends had the identical bug**, for the identical reason — Part 5's
`useEngineHistory.ts` even has a comment acknowledging the gap ("no such helper exists…
Part 3/4 may end up writing their own"). Fixed by filtering today's date out of the
`dailyLogs` array passed to `runAdaptiveTdeeEngine` specifically (the full, unfiltered
map is still returned for the Adherence panel and CSV export, which correctly *do* want
today's partial total).

**3. Pre-existing `tsc` error in `CheckIn.tsx`**, never caught because Part 4's sandbox
had no compiler access:
```ts
const steps = ['weighIn', ...(hasMeasurements ? ['measurements'] : []), 'photo', 'review'] as const;
```
A conditional spread inside `as const` widens the whole array's element type to plain
`string` (the un-const'd `['measurements']` branch contributes a `string[]` to the
union), which broke the `Record<(typeof steps)[number], string>` lookup two lines later.
Fixed by branching into two fully-`as const` tuples instead of spreading conditionally
into one.

**4. Systemic Tailwind opacity-modifier bug, fixed at the source.** Part 5's report
documented this in detail without fixing it project-wide: `tailwind.config.js` mapped
color tokens directly to `var(--x)`, which cannot take Tailwind's `/NN` opacity modifier
syntax — `bg-accent/15` silently produced no background at all. Part 5 found and
worked around it locally in ~10 of their own places (e.g. `HabitStrip.tsx`'s inline
`hexToRgba` call). Left unfixed, though: grepping the *merged* codebase turned up **10
more usages in Part 4's screens with no workaround at all** —
`SegmentedControl`, `TargetRing`, `RecipeBuilder`'s and `ComparisonStep`'s warning boxes,
`FoodDetail`'s serving-mode toggle, `GoalStep`, `ReviewStep` — meaning those selected
states and warning boxes were rendering with no background/border tint at all, silently,
in the version each part built and could never see rendered. Fixed by adding an
RGB-triplet CSS variable per token (`--accent-rgb: 78 156 137`, etc.) and pointing
`tailwind.config.js` at `rgb(var(--x-rgb) / <alpha-value>)`. Confirmed in the actual
built CSS (`rgb(var(--accent-rgb) / .15)` now appears as real, functional rules).

## Integration work — wiring the pieces together

This is the part none of the five sessions could do alone, since it requires seeing more
than one part at once.

- **`src/search/useUnifiedSearch.ts` — new file, the missing seam.** Part 2 built
  `createUnifiedSearch()` as a stateful, callback-based, two-phase (instant local
  results, then async live OFF results) controller. Both Part 3's Dashboard and Part 4's
  Recipe Builder guessed it would expose a plain `(query) => Promise<FoodItem[]>`
  function and built temporary stand-ins on that assumption (`localFoodSearchFallback.ts`,
  `localIngredientSearch.ts`) — a reasonable guess, but not what Part 2 actually built.
  This new hook is the real adapter: builds the three Fuse indexes reactively from
  `db.foodItems`, wires the one live-network dependency to `searchOffLive`, exposes the
  two-phase result stream as a single `results` array. Both temporary fallbacks are
  deleted; Dashboard and Recipe Builder both now search the real catalog.
- **Router (`App.tsx`) fully wired.** Part 3 built the nav shell with all 5 routes
  pointed at placeholders, each explicitly labeled with which part owns the real
  version — replaced all 5. Also added two routes that didn't exist anywhere before:
  **`/food/:foodItemId`** and **`/recipe-builder`**, since Food/Recipe Detail and Recipe
  Builder had no navigation path pointing at them at all (Search Results used an inline
  expand instead). Each real screen takes plain props with no router assumptions baked
  in (by design, per Part 4's own report) — thin wrapper components translate router
  state into those props.
- **`SearchResultRow`'s "Details" link** — added inside the existing expand affordance,
  exactly where Part 3's own header comment said it should go once §9.4 existed:
  *"tapping the row lets you set a custom gram amount… once §9.4 exists, 'view full
  detail' can be added inside the expanded area as a real navigation link with no change
  to this row's own contract."* Additive only; the row's existing props are unchanged.
- **`HabitStrip` wired into the Dashboard** — a zero-prop, self-contained component Part
  5 built and explicitly left undropped, waiting for Part 3's Dashboard to exist.
- **`isCheckInDue()` wired into the Dashboard's check-in banner**, replacing a
  live-recomputed `engineResponse.nextCheckIn` comparison. This is a real (if subtle)
  correctness choice, not just cleanup: `isCheckInDue()` checks the `nextCheckIn` frozen
  into the *last completed check-in's* snapshot, which only changes on an actual
  check-in — the Dashboard's own live version was recomputing a fresh Engine response on
  every food log, which could have made the "check-in due" banner flicker in and out
  over the course of a day as `nextCheckIn` shifted with each new entry.
- **`addPhoto()` wired into Check-in's photo step**, replacing a duplicated
  `db.progressPhotos.put()` insert with Part 5's shared, tested `photoStore.ts` — exactly
  what Part 5's own report asked for.
- **More screen**: Period Tracker and Progress Photos are now real, working `Link`s
  (both screens are complete); Settings stays an inert placeholder row, since Part 6
  hasn't happened yet.

## Schema and dependencies

Both are single-change merges — nothing conflicting to reconcile:

- **Dexie schema**: Part 1's v1 schema + Part 3's v2 migration (adds the `favorites`
  table). No other part touched `db.ts`. All the tables Part 5's four screens needed
  (`habitDefinitions`, `habitEntries`, `periodEntries`, `progressPhotos`) already
  existed in Part 1's v1 schema, which is why Part 5's own diff showed zero schema
  changes.
- **`package.json`**: Part 1's baseline + Part 5's 3 devDependencies (`jsdom`,
  `@testing-library/react`, `@testing-library/dom`), added for its component-render
  smoke tests. No other part added a dependency — Part 1 had already pre-included
  `fuse.js`, `react-router-dom`, and `recharts` from the start, anticipating exactly what
  Parts 2/3/5 would need.

## Dropped as redundant

`src/domain/macros.ts` and `src/domain/recipeCalculator.ts` (Part 2) implemented the
same §7 recipe-macro formula as Part 4's `data/recipeMacros.ts` — arithmetically
equivalent, confirmed by reading both. Part 2's version was never imported by any screen
in any part (checked directly); Part 4's is more general (supports an arbitrary serving
size, not just per-100g, which Recipe Builder's live per-serving preview actually needs)
and is the one already wired into a working, tested screen. Dropped Part 2's version and
its 26 tests rather than maintaining two implementations of the same math — this was
explicitly sanctioned by both sides ("keep either, delete the other, nothing to
reconcile," Part 4; no claim of priority, Part 2).

## Left alone on purpose (documented, not fixed)

A few places ended up with two near-duplicate small utilities doing almost the same
thing for different parts' screens. None of these are bugs — each pair is internally
correct and already wired into its own tested call sites. Consolidating would mean
touching many import sites across two parts' worth of screens for a stylistic win, not a
correctness one, so this was left for a deliberate future pass rather than done under
integration time pressure:

- `src/lib/macros.ts` (Part 3, Dashboard) vs. `src/data/macrosMath.ts` (Part 4, Recipe
  Builder/Food Detail) — same scale/sum semantics, different function names.
- `src/lib/dateUtils.ts` (Part 3) vs. `src/screens/_shared/dates.ts` (Part 5) —
  Part 5's own header comment already flags this exact duplication as "a known
  project-wide quirk worth a future part's attention," for the same reason (didn't want
  to unilaterally add a project-wide module while Parts 2–4 were being built against the
  same checkpoint in parallel).
- `src/components/useFoodSearch.ts` (Part 3) is now unused — Dashboard moved to
  `useUnifiedSearch` — but is a clean, generic, harmless utility, kept rather than
  deleted in case a future simple search need wants it.
- `src/data/dailyLogs.ts` (Part 4) is no longer imported by Check-in (see bug #1 above)
  but kept — still a reasonable general utility, e.g. for a future Dashboard "today's
  totals" widget, per Part 4's own suggestion.

## Verification

```
npm install        916 packages, clean
npm run typecheck   clean (1 pre-existing error found and fixed — see bug #3)
npm run lint        clean, zero warnings
npm test             277 tests / 37 files, all passing
npm run build        clean; output code-splits into two chunks (History & Trends'
                      Recharts dependency lazy-loads on its own route, per Part 5's own
                      bundle-size note — the other three tabs and both single-task flows
                      never pay for it)
```

Also ran a static safety scan before packaging this back up, independent of Part 2's own
"unexplained files" note in their report (which they'd already investigated and
concluded was benign) — no `eval`/`Function` constructor anywhere, no unexpected network
calls (`offLiveSearch.ts`'s one `fetch` call goes to the documented Search-a-licious
endpoint, sends only the search query text; the only other hardcoded domains anywhere in
the repo are `nin.res.in` and `openfoodfacts.org`/`huggingface.co`, exactly the ICMR and
OFF sources both data-pipeline READMEs describe), no `dangerouslySetInnerHTML` /
`postMessage` / `iframe`, no `localStorage`/`sessionStorage` use outside Dexie, nothing
that looks like an obfuscated payload.

`npm audit` reports 15 advisories (11 moderate, 3 high, 1 "critical" by npm's rollup —
the underlying issue is `esbuild`'s dev-server CORS advisory, moderate on its own
account). All of them are in build/dev tooling — `vite`'s dev server, `@bubblewrap/core`
(the Android TWA packaging toolchain Part 1 set up), `tar`, `googleapis` — none reach the
`dependencies` actually shipped in the built web app (`dexie`, `react`, `fuse.js`,
`recharts`, `react-router-dom`). Fixing the `esbuild` one requires a Vite major-version
bump (`npm audit fix --force` offers this) — left for you to decide rather than done
unilaterally mid-merge, since it's a breaking change with its own testing burden,
unrelated to this integration.

## Known gaps carried forward (not fixed here — flagged for Part 6/7)

- `pharmacologically_assisted` has no `UserProfile` field or Settings UI (Part 3's own
  flagged gap — `checkExclusions()` always assumes `'general'`). Same shape as the
  pregnancy gap Part 4 already closed; Settings (§9.12) is the natural place to close
  this one too.
- `HabitDefinition` has no `createdAt` (Part 5's own flagged gap) — a schema addition,
  small but real.
- Imperial units aren't supported anywhere (Part 5's flagged gap).
- The UTC-vs-local "today" question is a genuine known project-wide quirk (see Part 5's
  own extensive comment in `_shared/dates.ts`) — every date in the app is a UTC calendar
  day, which silently misaligns by one day for anyone not at UTC+0 around midnight.
  Affects all 5 parts equally; not something to half-fix inside one file.
- Recipe edit mode isn't built (§9.5 as written only asks for creation — Part 4's own
  flagged gap).
- `android-keystore/` was deliberately excluded from this merge and from the attached
  zip — it's a secrets folder, not something that should be bundled into a deliverable
  like this regardless of the integration work. It's untouched in Part 1's original zip
  if you need it.

## What's next

Per Part 1's original plan (preserved in `PROGRESS_REPORT.md`): **Part 6** is Settings
(§9.12) + polish — the two profile-field gaps above are natural to close there, plus a
§10 design consistency pass and offline verification. **Part 7** is real-world QA on
GitHub Actions. Both can now build on a codebase that's actually been compiled, linted,
tested, and built once already — which wasn't true of any individual part before this.

## Stats

150 source files (`.ts`/`.tsx`), ~12,200 lines, 37 test files / 277 tests, 11 screens.
