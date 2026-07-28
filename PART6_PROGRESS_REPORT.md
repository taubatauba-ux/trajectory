# Part 6 Progress Report — Settings, Design/Offline Verification, Part 7 Prep

Companion to `INTEGRATION_REPORT_PARTS_1-5.md`, which this session started from — a
single, already-merged, already-verified codebase, not a fifth parallel branch. That
changes what this report needs to explain: no collisions to reconcile, no guesses about
another session's file layout. Everything below was built with full visibility into,
and continuously verified against, the rest of the app.

**Status: Settings (§9.12) built, §10 design pass done, §11 offline behavior verified,
Part 7 partially prepped.** `npm run typecheck`/`lint`/`test`/`build` all run clean —
322 tests across 43 files, up from 277/37 at the end of integration. Every number in
this report is post-fix, not a first-draft count: this session hit real typecheck
failures, two real test failures, and caught several of its own bugs by re-reading its
own code, exactly like the integration pass did. None of that is hidden below.

## Part 7 — what this session could and couldn't do

Part 1's original plan describes Part 7 as: *"You actually run the GitHub Actions
build... whatever surfaces gets fixed."* That's addressed to a human with a real GitHub
repo and the signing keystore, for the same reason Part 1 itself couldn't run
`bubblewrap build` — this sandbox has no push access to a real repo and the Android SDK
domains are blocked here exactly as they were for Part 1 (confirmed, not assumed — see
`build-apk.yml`'s own header comment). That part of Part 7 remains yours to run; see
"Handoff" at the end.

What this session *could* do, and did: verified `npm ci` (what CI actually runs, not
`npm install`) works cleanly against the merged lockfile; audited `build-apk.yml` line
by line against everything Parts 2-6 added and found nothing that needed changing (it
never hardcodes a file list, just runs `npm ci`/`test`/`build` generically); added a new
`ci.yml` for fast feedback on every push/PR without the Android toolchain.

## What's built

### Settings (§9.12) — `src/screens/settings/`

`SettingsScreen.tsx` orchestrates `ProfileEditSection.tsx` (all of §4.1, plus the two
fields below) and `DataSection.tsx` (export, sync, dataset versions). One scrollable
form with a sticky Save bar, not a step wizard — there's no "next" to gate on a settings
screen you dip in and out of. Reuses Onboarding's `slugifyMeasurementKey`/
`suggestedMeasurementDefs`/`MeasurementRow` directly (`settingsState.ts`) rather than
reimplementing the measurement-row editor a second time.

- **Profile edit**: sex, DOB, height, goal type + target weight, activity note, body
  composition (same suggested-quick-add + custom-row pattern as onboarding), pregnancy/
  breastfeeding status. Round-trips losslessly — `profileToSettingsState` /
  `settingsStateToProfilePatch` are inverses, tested directly.
- **Metric/imperial toggle** (`lib/units.ts`) — every stored value stays kg/cm
  regardless (§4 never changes); the toggle only affects what's shown and what unit
  input is accepted in. Applied to: Settings' own height/target-weight fields, and
  Dashboard's `QuickWeighIn` (the highest-traffic single weigh-in surface). **Not**
  applied to: Onboarding's `AboutYouStep`, Check-in's `WeighInStep`, or any
  History/Trends chart axis/label — all still metric-only. This is a deliberate scope
  boundary, not an oversight — `lib/units.ts` is complete and tested, so extending
  coverage to those three is a small, well-contained follow-up whenever it's wanted, not
  a redesign.
- **Data export** (`data/dataExport.ts`) — full JSON dump of all 11 Dexie tables (§13:
  "the user is never locked in"), not just History's CSV subset. The one genuinely
  tricky part: `ProgressPhoto.blob` isn't JSON-serializable, so photos are base64-encoded
  via `Blob.arrayBuffer()` (not `FileReader`, so it behaves identically under jsdom in
  tests as in a real browser) — round-tripped and tested byte-for-byte, not just
  "doesn't throw." `exportedPhotoToBlob` (the inverse) exists for a future import
  action; §9.12 only asked for export, so nothing calls it yet.
- **Manual sync** (`data/bundledFoodData.ts`, `lib/pwaUpdate.ts`) — see "The real gap
  this session found" below; this needed real architectural investigation, not just UI
  work.
- **Dataset version display** — reads `SyncMeta` (§4.5) via `getSyncMeta()`, which
  existed in `db.ts` since Part 1 but had *zero* callers anywhere in the app until this
  session (checked directly). First real use of a piece of Part 1's own scaffolding.

### Two new `UserProfile` fields — closing flagged gaps

- **`pharmacologicallyAssisted?: boolean`** — Part 3's own report flagged this exactly:
  `resolveProfileNoise()` always received `'general'` because nothing threaded a real
  value through. Same shape as the pregnancy field Part 4 added: additive, `undefined`
  preserves old behavior exactly, and the derivation lives inside
  `adaptiveTdeeEngine.ts` itself (`profileKind = options.populationProfile ??
  (profile.pharmacologicallyAssisted ? ... : 'general')`) rather than requiring every
  call site to remember to compute and pass it — mirrors exactly how the pregnancy field
  is threaded two lines below it.
- **`unitPreference?: 'metric' | 'imperial'`** — backs the toggle above.

### The real gap this session found: nothing loaded real ICMR/OFF data into Dexie

Not a bug in existing code — a missing piece nobody had built yet. Once
`scripts/extract_icmr.py`/`import_off_bulk.py` eventually run and produce
`icmr_ifct2017.json`/`off_seed.json`, there was no code path that got that data from a
bundled JSON file into the app's IndexedDB at all. `data/bundledFoodData.ts` is that
path: Vite's `import.meta.glob` (not a static `import`, which would be a build error
today since neither file exists yet — glob resolves to an empty object until they do,
picking them up automatically the day either pipeline runs, no code change needed) reads
whatever's bundled, and `syncBundledFoodData` (the injectable-for-testing core, same
seam shape as `sync_off_delta.py`'s own `delta_records_fetcher`/`bulk_importer` params)
loads it into `db.foodItems` if the bundled version is newer than what's stored.

This surfaced a second, smaller gap while building it: `SyncMeta.offDatasetVersion`
(§4.5: "timestamp of last successful OFF sync") is never actually written by
`sync_off_delta.py` — it writes `lastDeltaAppliedDate`/`lastFullReimportDate` only
(`scripts/off_common.py`'s `read_sync_meta`/`write_sync_meta`, checked directly). Fixed
by deriving it from the more recent of those two at the TS boundary rather than adding a
redundant field to a working, tested Python pipeline for something that's already
recoverable from what it does write.

**"Sync now"** (`lib/pwaUpdate.ts`) forces a service-worker update check
(`ServiceWorkerRegistration.update()`) rather than re-running the sync script directly —
that script needs network access no client device has to `static.openfoodfacts.org`/
`huggingface.co`, and only ever runs on GitHub's own schedule. What a phone *can* do on
demand is check for a newer deployed build right now instead of waiting for the
browser's background cycle — and a newer build is exactly what delivers fresher bundled
data, since `off-sync.yml` commits new data and explicitly triggers a rebuild as one
atomic step. `loadBundledFoodDataIfNeeded()` also runs on every Dashboard mount
(alongside the existing demo-data seed, real data taking precedence), so this isn't
purely a manual-only path — "sync now" is "check immediately" layered on top of
"already happens automatically."

## §10 design consistency pass

Found four real color-value discrepancies between the actual tokens and the spec's own
table — not stylistic judgment calls, byte-for-byte differences with no comment anywhere
explaining a deliberate deviation (unlike the tag-color fix, which does have one):

| Token | Was | Spec (§10) |
|---|---|---|
| `--surface` | `#1B1F23` | `#1D2124` |
| `--surface-raised` | `#22272C` | `#262B30` |
| `--accent-warn` | `#C97B4A` | `#C97B3D` |
| `--hairline` | `#2A2F34` (solid) | `rgba(255,255,255,0.08)` (translucent overlay) |

Fixed all four in both `design/tokens.ts` and `index.css`. The hairline one is a
structural difference, not just a different shade — a translucent white overlay
composites differently depending on what's underneath it, a fixed solid color doesn't.
Confirmed nothing in the app ever uses `hairline` with a Tailwind opacity modifier
(checked directly), so it doesn't need the `rgb(var(--x-rgb) / <alpha-value>)` treatment
the integration pass gave the other tokens — reverted to a plain `var()` reference in
`tailwind.config.js`, since it's already a complete, fixed value.

Also caught, in code written *during this same session*: a `shadow-lg` on Settings'
sticky Save bar, which directly violates §10's "hairline dividers... rather than card
shadows" — fixed to match `BottomNav.tsx`'s own established pattern
(`border-t border-hairline`) for a floating bar, the closest existing precedent. Spot
checks across `FormField`/`MacroBar`/`FoodDetail`/`TagChip` found the tabular-figure and
short-code-tag rules already broadly well-followed by Parts 3-5; one purely stylistic
(not functional) variation noted — `MacroBar.tsx` uses raw `font-mono tabular-nums`
where most of the app uses the shared `.tabular` class, same visual result either way.

## §11 offline verification

Walked all seven rows of the spec's offline/online matrix against actual code, not
assumptions:

- **Engine has zero network dependency** — grepped `src/engine/` for `fetch`/
  `XMLHttpRequest`: nothing. Confirms Check-in/Dashboard both work fully offline (§1.3's
  "if it's a local JS module" branch).
- **Live OFF search already degrades gracefully** — `unifiedSearch.ts`'s `.catch()` on a
  failed live call logs and lets local results stand, never rejecting the outer promise.
  Part 2 already built this correctly; confirmed by reading the code, not assumed from
  the report.
- **Found and fixed a real bug**: `checkForAppUpdate()`'s `registration.update()` call
  can reject when there's no network (MDN: fails for network reasons) — uncaught, this
  would have thrown all the way up through Settings' "Sync now" handler the first time
  anyone tapped it offline. Now caught, degrading to `{ checked: false }` quietly.
- **`data/bundledFoodData.ts` and `data/dataExport.ts`**: confirmed zero network calls —
  both are pure Dexie + bundled-static-data operations.

## Bugs found and fixed (beyond the two above)

**Pre-existing `noUncheckedIndexedAccess` gaps, never caught until `tsc` ran on this
code for the first time**: `bundledFoodData.ts`'s `firstModuleDefault` indexed into a
`Record` with a key from `Object.keys()` of the same object — TS can't correlate the
two, flagged as possibly-undefined; fixed with an explicit guard.
`dataExport.ts`'s byte-to-binary-string loop indexed a `Uint8Array` by counter; switched
to `for...of` (iterates values directly, sidesteps the issue entirely, also avoids a
spread-operator call-stack risk on large photos).

**`import.meta.glob` had no type definition anywhere in the project** — nothing before
this session used any Vite-specific `import.meta` API, so `vite-env.d.ts` (the standard
`/// <reference types="vite/client" />` every `create-vite` scaffold normally ships
with from day one) simply didn't exist yet. Added it.

**A real unsound type narrowing in `SettingsScreen.tsx`**: `profile!` inside the
`handleSave` closure doesn't actually work — TypeScript's narrowing from the two early
returns above (`LOADING` sentinel, then `undefined`) doesn't persist into a nested
function body, and a bare `!` assertion only strips `null`/`undefined`, not the
`'loading'` string literal still technically in the union at that point. `tsc` caught
this immediately; fixed by capturing the already-narrowed value in its own `const`
(`loadedProfile`) that the closure reads instead.

**A unit-conversion display bug caught before it ever reached `tsc`**: the first draft
of `ProfileEditSection.tsx`'s height field swapped the unit *label* to "in" when
imperial was selected without converting the underlying *value* — would have shown
"165 in" for a 165cm height instead of "65 in". Caught on re-reading the diff, fixed by
routing both the displayed value and the input parser through `lib/units.ts` properly.

**A wrong date formatter, also caught on re-reading**: `SyncMeta`'s three date fields
aren't uniformly shaped (`icmrDatasetVersion` is a full ISO timestamp;
`offDatasetVersion`/`lastDeltaAppliedDate` are bare `YYYY-MM-DD`), and `lib/dateUtils.ts`'s
existing `formatDayLabel` assumes the latter (appends its own `T00:00:00`, which would
double up on a full timestamp) and only shows weekday+day, which reads ambiguously for
something that could be months old. Added `formatDatasetDate` to `dateUtils.ts` instead
of reusing the wrong tool for the job.

**Two real test failures on the first full run after all of the above**:
`pwaUpdate.test.ts` — `'serviceWorker' in navigator` checks the property *key* exists,
not that its *value* is truthy; a test simulating an unsupported browser via
`Object.defineProperty(..., { value: undefined })` correctly exposed that the production
code would crash rather than degrade in that case. Fixed to check the value directly
(`!navigator.serviceWorker`), which is simpler and covers both cases in one guard.
`color.test.ts` (Part 5's own comprehensive "every token color" sweep) — broke the
moment `hairline` stopped being a hex string, exactly as a good test should. Fixed the
test to exclude `hairline` explicitly with a comment on why, rather than either
weakening the color fix or over-engineering `hexToRgba` for a case nothing calls it
with (confirmed: every real call site uses `accent`/`accentWarn`/`tagOff`).

## Also fixed: two stale docs

`README.md`'s "Status at a glance" and "Project structure" sections still described a
pre-Part-2 state (screens/search/scripts all "Empty — next up") — genuinely misleading
for anyone opening this repo now. Updated both to reflect the actual current state and
point at the newer reports.

## What's explicitly not done

- **Data import.** §9.12 only asks for export; `exportedPhotoToBlob` (the base64→Blob
  inverse) exists and is tested, but nothing calls it. A natural Part 6.5/7 addition if
  wanted — the hard part (the photo round-trip) is already done and verified.
- **Imperial units beyond the two surfaces listed above** — a real, bounded follow-up,
  not a redesign, since `lib/units.ts` already has everything the remaining surfaces
  would need.
- **The actual GitHub Actions run** — see "Part 7" above.

## Handoff — what's actually left for you

1. Push this to a real GitHub repo and follow `README.md`'s "Building the APK" section
   (already accurate and complete — Part 1 wrote a genuinely good 7-step guide, nothing
   here needed to change it). `ci.yml` will run automatically on the push itself, before
   you even reach the Android step, so anything it would catch shows up first.
2. If `build-apk.yml` fails on the Android/Bubblewrap steps specifically (the one part
   no sandbox in this project's history could ever pre-verify), paste the failing step's
   log back and it can be debugged the same as anything else — just not run directly.
3. Whenever you're ready to actually populate the food catalog:
   `scripts/extract_icmr.py`/`import_off_bulk.py` need to run somewhere with network
   access to `nin.res.in`/`huggingface.co` (a GitHub Action, or your own machine) — once
   they produce `icmr_ifct2017.json`/`off_seed.json`, `data/bundledFoodData.ts` picks
   them up automatically on the next build, no other code change needed.
