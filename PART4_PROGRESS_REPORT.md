# Part 4 Progress Report — Onboarding + Detail Screens

Companion to `PROGRESS_REPORT.md` (Part 1). That file covers the Android build pipeline,
the Adaptive TDEE Engine, and the data model/scaffold. This one covers Part 4 only:
**Onboarding (§9.1), Food/Recipe Detail (§9.4), Recipe Builder (§9.5), and the Check-in
flow (§9.6)** — built while Part 2 (data pipelines + search) and Part 3 (Dashboard, Search
Results, navigation shell, shared components) were being built in parallel, in separate
sessions with no visibility into each other's work. That constraint shaped several
decisions below — flagged inline, and summarized under "Integration notes" at the end.

**Status: all four screens are built, internally consistent, and spec-complete.** The one
thing this session could *not* do that Part 1's apparently could: actually execute
anything. See "Build environment" immediately below before trusting any of this — it
changes what "done" means for this part.

## Build environment (read this first)

This sandbox's network is restricted to what `npm install` needs, and `npm install`
itself is blocked: `registry.npmjs.org` returns `403 host_not_allowed` on every tarball
fetch (metadata-only calls like `npm install --dry-run` succeed since they read straight
from `package-lock.json`; nothing needing an actual download does). No `node_modules/`
could be produced, so **`npm test`, `tsc`, and `npm run build` could not be run this
session** — unlike Part 1, whose report describes actually running these.

Given that, verification here leaned on what *was* available:
- A full manual read of every new/changed file against the actual type definitions,
  Dexie schema, and Engine contract already in the repo (not from memory of the spec —
  from the literal source files).
- A script-based check that every relative import in `src/` resolves to a real file
  (150/150) and that every named import matches an actual export in its target file
  (checked across 50 files, 0 mismatches) — not a substitute for `tsc`, but it catches
  the most common class of error when a compiler isn't available.
- A heuristic unused-import scan, since `tsconfig.json` has `noUnusedLocals` and
  `noUnusedParameters` on — both would hard-fail a build on something this style of
  check can catch cheaply. 0 flagged.
- Every relevant file's timestamp checked against known-untouched Part 1 files
  (`App.tsx`, `main.tsx`, `db.ts`, `android/`, `build-tools/`) to confirm this session's
  edits stayed inside their intended scope.

**First thing to do in any session with working npm access: run
`npm install && npm test && npm run build`.** 75 test cases now exist across 12 files (65
of them new this part); none of them have actually executed yet.

## What's built

### Onboarding (§9.1) — `src/screens/onboarding/`
Four steps (`AboutYouStep`, `GoalStep`, `BodyCompositionStep`, `ReviewStep`), state and
validation lifted into `onboardingState.ts`, orchestrated by `Onboarding.tsx`.

- **About You**: sex, DOB, height, current weight.
- **Goal**: goal type, optional target weight, and the activity note. The note is still
  the free-text field the spec calls for, but paired with five quick-select chips (one
  per `inferActivityLevel`'s bucket) that insert a phrase guaranteed to match that
  bucket's keyword list — checked by hand against `coldStartPrior.ts`'s exact keyword
  sets and match order, not just written to sound plausible. Typing your own text still
  works exactly as before; the chips are a shortcut, not a new constraint.
- **Body Composition** (optional, skippable): an "add measurement" affordance —
  `leanBodyMassKg` and `bodyFatPercent` offered as suggested quick-adds using the exact
  keys `coldStartPrior.ts`'s `MEASUREMENT_KEYS` expects, plus free-form custom
  measurements for anything else. Also asks about current pregnancy/breastfeeding status
  (see "Gap #5" below) when sex is female — skippable, explained, never presumed.
- **Review**: summary of everything entered, submit button, then the skeleton
  macro-ring loading state §9.1 explicitly calls for, then a reveal of the real computed
  targets before handing off.

On submit: saves the profile, saves the current weight as the first `WeighIn`
(`upsertWeighInForDate`, `src/data/weighIns.ts` — new, shared with Check-in), calls
`callEngine()` exactly once, persists the result as the first `CheckIn` (the `TargetPlan`
bridge, below), then calls `onComplete({ profile, weighIn, checkIn })`.

### Food / Recipe Detail (§9.4) — `src/screens/foodDetail/`
`FoodDetail.tsx` + `RecipeIngredientsList.tsx`. Takes a `foodItemId` prop and reads the
item reactively via `dexie-react-hooks`. Serving-size picker toggles between grams and a
household unit when `servingSuggestion` is set; every populated `Macros` field renders
(not just the four headline ones), via a new `src/data/macroFields.ts` that knows each
field's label/unit/decimal-precision. Recipes get an expandable ingredient list built on
native `<details>/<summary>` (free keyboard/screen-reader support, no extra state).
"Add to log" snapshots the *scaled* macros into `LogEntry.macrosAtLogTime` — never a
reference back to the food that could drift if it's edited later.

### Recipe Builder (§9.5) — `src/screens/recipeBuilder/`
`RecipeBuilder.tsx` + a scoped `localIngredientSearch.ts` (see "Integration notes").
Ingredients added via debounced fuzzy search, each with an editable gram amount; a
`totalYieldG` field with the inline explainer §9.5 asks for; live per-100g *and*
optional per-serving-preview macros, computed via the exact §7 formula
(`src/data/recipeMacros.ts`) as ingredients/yield change. Saves a `CustomFoodItem` with
`isRecipe: true`.

### Check-in (§9.6) — `src/screens/checkIn/`
`CheckIn.tsx` orchestrates `WeighInStep` → `MeasurementsUpdateStep` (only rendered at
all if the profile actually has measurement keys — an empty-measurements profile skips
straight past it) → `PhotoStep` → `ComparisonStep`. Full `history` sent to `callEngine()`
this time: every `WeighIn` on record, plus every day's logged totals via a new
`src/data/dailyLogs.ts` (nothing previously aggregated `LogEntry` rows into the
`{date, totals}[]` shape the Engine's `history.dailyLogs` expects — Onboarding never
needed it since it always calls with zero logs). `ComparisonStep` shows each target
value as an explicit before → after with a signed delta, not a silent swap, plus
`EngineResponse.flags` rendered through a new human-readable mapping
(`src/engine/flagPresentation.ts`). Also exports `isCheckInDue()`, a pure predicate for
Part 3's Dashboard banner to call rather than re-deriving the "is
`nextCheckIn` today-or-past" comparison itself.

### Shared components — `src/components/`
`TagChip`, `LedgerRow`, `MacroRing` (the three the main progress report names for Part
3), plus `StepFlow` (wizard chrome for the two multi-step flows), `FormField`, and
`SegmentedControl`. See "Integration notes" — three of these six may duplicate Part 3's
own work.

## Gaps bridged (beyond Part 1's original four)

**Gap #5 — pregnancy/breastfeeding has no data field.**
`engine/populationProfiles.ts`'s `checkExclusions()` always raised
`pregnancy_breastfeeding_status_unconfirmed`, with its own comment saying why: *"there's
no data field to confirm or deny pregnancy/breastfeeding status either way... a future
version that adds such a field to UserProfile should make this conditional."* That's a
direct pointer at whoever builds onboarding next. Added
`UserProfile.pregnancyOrBreastfeedingStatus?: 'not_applicable' | 'pregnant' |
'breastfeeding'`; `undefined` (every profile created before this field existed, or anyone
who skips the question) preserves the original always-raised behavior exactly, so this
is additive-only — verified by hand against both existing test files, neither of which
touches this function or asserts on this specific flag's presence. Added
`populationProfiles.test.ts`, which didn't exist before at all.

**The undefined `TargetPlan`.** Both §9.1 and §9.6 name a `TargetPlan` type that's never
actually defined in §4 (the spec's own stated source of truth for shapes) or anywhere in
`src/types/`. `CheckIn` already carries exactly that shape — a date, optional
measurements/photos, and a request/response snapshot pair — so this build's decision:
"TargetPlan" is the spec's informal name for *the latest EngineResponse the user has
seen*, and that's simply the most recent `CheckIn`. Onboarding creates the first one;
Check-in appends every one after. No new Dexie table, no schema version bump — reused
what already existed rather than inventing a type the spec's own source-of-truth section
doesn't have. Lives in `src/data/checkIns.ts`.

**Daily log aggregation didn't exist.** The Engine consumes `{date, totals}[]`; nothing
produced that shape from individual `LogEntry` rows. `src/data/dailyLogs.ts` fills it —
plain aggregation, no screen-specific logic, so Part 3's Dashboard should be able to
reuse it for a "today's totals" widget rather than writing its own.

## Bugs found and fixed

**Tag colors were rotated one position off from §10.** §10 specifies ICMR=gold
(`#C9A24E`), OFF=blue-gray (`#6B84A6`), custom=purple (`#8B7EC8`) — each tied to a
specific source's identity. `tokens.ts` and `index.css` had ICMR getting OFF's blue-gray,
OFF getting custom's purple, and custom getting ICMR's gold. Since each color is
supposed to *mean* a specific source, this wasn't a style choice, it was backwards.
Fixed in both files to match §10 exactly. **Flagged for merge:** if Part 2 or 3 read
these files before this fix landed, whatever they built may render the old (wrong)
colors until reconciled — a one-line diff per file, not a logic change.

**`createCheckIn` couldn't accept a caller-supplied id.** `PhotoStep`/`CheckIn.tsx` need
the new check-in's id *before* the record exists, to set `ProgressPhoto.checkInId`
correctly. The original `CreateCheckInInput` had no `id` field and always generated one
internally — a real type mismatch, not a style nit (`tsc` would have caught it
immediately; this sandbox's lack of network access is exactly why it had to be caught by
manual audit instead). Fixed by making `id` an optional input, defaulting to a fresh one
exactly as before when omitted — Onboarding's call site (which never passes one) is
unaffected.

## Integration notes for whoever merges Part 2 / 3 / 4

Built in parallel with no live visibility into either, so a few things here are
deliberately scoped to avoid colliding with what those sessions almost certainly also
produced, per the main progress report's own part breakdown:

- **`src/search/unifiedSearch.ts` (Part 2's file, per §3) was never touched.** Recipe
  Builder's ingredient search instead uses `src/screens/recipeBuilder/localIngredientSearch.ts`
  — a real, working Fuse.js search, but scoped to `db.foodItems` where `source ===
  'custom'` only, since ICMR/OFF data doesn't exist in this bundle yet regardless of who
  writes the search layer. Comment in that file marks it as temporary with the intended
  swap (`(query: string) => Promise<FoodItem[]>`, same shape §8 describes). One-line
  change once Part 2's version lands.
- **`src/data/recipeMacros.ts`** implements §7's formula, which the main progress report
  scopes to Part 2. The formula is fully specified with no ambiguity, so a correct Part 2
  implementation should be arithmetic-for-arithmetic identical to this one — if Part 2
  also produced one, keep either and delete the other, nothing to reconcile logically.
- **`src/components/{MacroRing,TagChip,LedgerRow}.tsx`** are the three names the main
  report gives Part 3 for "shared components." Food/Recipe Detail and Recipe Builder
  needed all three, so they exist now, built directly against §10. If Part 3 also built
  these, they should be functionally interchangeable — reconcile by picking one, not by
  merging logic.
- **`StepFlow`, `FormField`, `SegmentedControl`** are new names not claimed by either
  other part in the main report, so collision risk there should be low.
- **Nothing under `src/data/icmr/`, `src/data/off/`, `android/`, `build-tools/`,
  `scripts/`, or `App.tsx`/`main.tsx` was touched** — confirmed by timestamp against
  known Part-1-only files, not just by intent.

## What's explicitly not done

- **No component-level (rendered) tests.** Part 1 never set up jsdom/React Testing
  Library, and this session couldn't verify adding them would even install correctly
  (no network to confirm). All new tests are pure-logic `.ts` files, matching Part 1's
  existing testing style exactly — Dexie-touching ones use `fake-indexeddb`, already a
  pinned dependency Part 1 included but hadn't used yet.
- **Recipe edit mode.** §9.5 as written only asks for creation; `RecipeBuilder` doesn't
  currently accept an existing item to edit. Would be a fairly small extension if wanted.
- **The Check-in *entry point* (the Dashboard banner itself)** is Part 3's screen, not
  this one — `isCheckInDue()` in `checkIns.ts` is what it should call rather than
  re-deriving the comparison.

## Suggested next steps

1. `npm install && npm test && npm run build` — first real execution of everything in
   this report. Given the manual verification depth above, low risk of surprises, but
   this hasn't been *confirmed* the way Part 1's report could confirm it.
2. Reconcile the three "may collide with Part 3" shared components and the recipe-macro
   calculator once Part 2/3's actual output is available.
3. Wire the four screens into whatever router Part 3 builds — each takes plain props
   (`onComplete`, `onBack`, `onSaved`, `onLogged`, etc.), no assumptions about
   `react-router` params baked in, so this should be a thin integration layer rather
   than a rewrite.
