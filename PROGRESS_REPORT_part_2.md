# Trajectory — Progress Report & Resume Instructions

**Read this first in any new session.** It's written to be self-sufficient: everything a
new chat needs to pick this up correctly is here, not scattered across the two spec
files (though it references them by section, so keep them attached too).

---

## How to resume this project in a new chat

1. Start a new chat.
2. Attach all four files: this `PROGRESS_REPORT.md`, the `trajectory-work-part2.zip`
   work bundle, `trajectory-app-technical-specification.md`, and
   `adaptive-tdee-engine-spec-v2.md`.
3. Say something like: *"Continue the Trajectory app build from where this progress
   report leaves off — start with Part 3 (core loop UI)."* Or paste the "Suggested
   next-session prompt" near the end of this file verbatim.
4. Claude should: unzip the work bundle, `npm install`, run `npm test` and `npm run
   build` to confirm the TypeScript checkpoint still works, and
   `pip install -r scripts/requirements.txt && python3 -m pytest scripts/` to confirm
   the Python checkpoint still works — all **before** changing anything, then proceed.

Do **not** ask Claude to regenerate `android/` from scratch or re-run
`bubblewrap init`-equivalent steps — it's already generated and correct. Only
`build-tools/generate-android-project.mjs` should ever touch that directory.

---

## What "done" means below

Every item marked done has been **actually run** in the sandbox that built it — tests
executed and passed, `tsc` typechecked with zero errors, `npm run build` produced a real
`dist/`, `pytest` executed and passed. Where something couldn't be verified (network
access blocked from this sandbox — see each relevant section), that's called out
explicitly rather than presented as working.

---

## Part 1 — COMPLETE

### 1. The central ask: "get the APK building"

**Answer: the pipeline is fully built and wired; the actual compile has to run on
GitHub Actions, not in this chat, and that's expected — not a limitation of the app.**

Confirmed directly (not assumed) that this sandbox's network allowlist blocks
`dl.google.com`, `maven.google.com`, and `services.gradle.org` — all three required to
compile an Android project (SDK, Android Gradle Plugin dependencies, Gradle itself).
`curl -I` to each returned `403 host_not_allowed`. This is the "GitHub block" you'd read
about — the standard resolution is exactly what's built here: push to GitHub, let
Actions (which has normal internet access) do the compile.

What's built to solve this, concretely:

- **`android/`** — a complete, real Android TWA (Trusted Web Activity) Gradle project,
  already generated (not a stub) using `@bubblewrap/core`'s programmatic API directly
  (the same library `bubblewrap init` itself uses), driven non-interactively via a
  custom script since `bubblewrap init` has no non-interactive flag and normally needs a
  live-hosted URL to read from. Verified: `gradlew` present and executable, all
  mipmap/icon densities generated, `AndroidManifest.xml`/`build.gradle`/`strings.xml`
  all inspected directly for correctness.
- **`build-tools/generate-android-project.mjs`** — the script that produced `android/`.
  Re-run it (`npm run generate:android`) only if `twa-manifest.json`'s *inputs* (app
  name, package id, colors) need to change — it fully regenerates the directory.
- **`android-keystore/android.keystore`** — a real signing keystore, already generated
  (`keytool`, 2048-bit RSA, 10000-day validity). **This is in the work bundle, not in
  the git repo** (correctly gitignored) — it's irreplaceable, treat it like a password.
  `android-keystore/CREDENTIALS-KEEP-SAFE-DO-NOT-COMMIT.txt` has the passwords and the
  SHA-256 fingerprint.
- **`.github/workflows/build-apk.yml`** — the CI workflow. Two jobs: build the web app +
  deploy to GitHub Pages, then compile + sign the APK against that live URL. Handles
  both possible GitHub Pages URL shapes automatically — a real correctness bug caught
  and fixed during Part 1 (see that session's bug list below), not guessed right the
  first time.
- **`public/.well-known/assetlinks.json`** — Digital Asset Links file so the installed
  APK opens full-screen instead of falling back to a Custom Tab. Contains the real
  SHA-256 fingerprint of the actual keystore above.
- **`README.md`** — full step-by-step: create repo → push → enable Pages → add 3 secrets
  → download APK from Actions artifacts → sideload.

**What's NOT verified, and can't be from this sandbox:** whether `bubblewrap build`
actually succeeds against a live GitHub Pages URL on a real GitHub Actions runner. Every
individual piece was checked (YAML parses and its job graph is wired correctly, the
Android project is structurally complete and consistent, the exact non-interactive
invocation was confirmed by reading `@bubblewrap/cli`'s own source rather than guessed
from memory) — but the first real end-to-end run has to happen on your GitHub repo.

### 2. The Adaptive TDEE Engine — fully implemented and tested

All of `adaptive-tdee-engine-spec-v2.md`, not a stub:

| Module | File | Status |
|---|---|---|
| A — Cold-start prior | `src/engine/coldStartPrior.ts` | Done |
| B — Effective density (Forbes partitioning) | `src/engine/effectiveDensity.ts` | Done |
| C — Kalman filter core | `src/engine/kalmanFilter.ts` | Done, exact-verified |
| D — Outlier/regime-change gate | `src/engine/outlierGate.ts` | Done |
| E — Missing data handling | (inline in orchestration) | Done |
| F — Target & rate limiter, calorie floor | `src/engine/targetLimiter.ts` | Done |
| §9 — Population profiles (GLP-1, exclusions) | `src/engine/populationProfiles.ts` | Done |
| Orchestration | `src/engine/adaptiveTdeeEngine.ts` | Done |

**Verification, not just implementation:** `src/engine/kalmanFilter.test.ts`
reconstructs §10's worked example days 1-3 from the spec's own stated innovation values
and confirms exact numeric match — including the exact Kalman gain `[0.675, -31.04]` the
spec quotes. `src/engine/adaptiveTdeeEngine.test.ts` adds a 45-day statistical
convergence test (seeded, reproducible) and edge cases. **10/10 tests pass.**

**Four gaps between the two spec documents, bridged and documented in code:**

1. Module A needs one of 5 discrete activity buckets; `UserProfile` only has a
   free-text `activityNote`. Bridged with a keyword heuristic in `coldStartPrior.ts`'s
   `inferActivityLevel()`.
2. Module A/B need lean body mass or body-fat %; `UserProfile.measurements` is an open
   `Record<string, number>`. Bridged with a documented key convention
   (`MEASUREMENT_KEYS` in `coldStartPrior.ts`): `leanBodyMassKg` and `bodyFatPercent`.
   **The onboarding screen (not built yet) needs to use these exact keys.**
3. Module F needs a numeric `desired_weekly_rate_kg`; `UserProfile.goal` only has a
   category. Bridged with defaults in `adaptiveTdeeEngine.ts`'s `DEFAULT_WEEKLY_RATE_KG`
   — the cut default (−0.5 kg/week) is the exact rate the TDEE spec's §10 worked
   example uses.
4. Module F's rate limiter needs "the previously displayed target," implying persisted
   state — but the engine is deliberately stateless. Bridged by reconstructing the full
   displayed-target history via day-by-day replay.

**Key architectural decision:** the engine is **stateless** — `runAdaptiveTdeeEngine()`
replays the entire Kalman filter recursion from the first weigh-in through today on
every call, rather than persisting filter state. If a future session is tempted to
"optimize" this into incremental updates, don't, without a specific performance problem
driving it.

`callEngine.ts` is the one stable seam (per app spec §1.3) — wired to the real engine,
with `stubEngine.ts` retained as a defensive fallback if the real engine throws.

### 3. Full data model, per §4

`src/types/*.ts` — every interface from the spec, plus one addition: `ProgressPhoto`
(`src/types/media.ts`), inferred from `CheckIn.progressPhotoIds` and the Progress
Photos screen (§9.11) needing something concrete to reference.

### 4. Dexie (IndexedDB) schema

`src/data/db.ts` — an implementation decision (the spec gives TS shapes, not table/index
definitions). Index choices are commented inline with the reasoning behind each one.

### 5. Project scaffold

Vite + React 18 + TypeScript (strict, `noUncheckedIndexedAccess` on) + Tailwind +
`vite-plugin-pwa`. `src/App.tsx` is **explicitly a scaffold checkpoint, not a real
screen** — replace it entirely once routing + real screens exist (Part 3).

### Bugs found and fixed during Part 1

- `tsconfig.node.json` was missing `skipLibCheck`, breaking the production build on
  `vite-plugin-pwa`'s workbox type declarations.
- Bubblewrap's default fetch engine hangs against a plain HTTP/1.1 local server. Fixed
  by switching to the `node-fetch` engine.
- The signing keystore path baked into `twa-manifest.json` was an *absolute* sandbox
  path. Fixed to a path relative to `android/`.
- The CI workflow initially assumed GitHub Pages always serves from the domain root —
  fixed to detect and handle the `/reponame/` sub-path case.
- `keytool`'s modern default (PKCS12) silently reuses the keystore password as the key
  password. Documented and reflected correctly rather than assumed otherwise.

---

## Part 2 — COMPLETE

Data pipelines (§5, §6) and the pure-logic pieces that don't need them: the unified
search/ranking algorithm (§8) and the custom food/recipe macro calculator (§7).

### 1. Custom food/recipe macro calculator (§7)

- **`src/domain/macros.ts`** — generic macro arithmetic (`scaleMacros`, `macrosForGrams`,
  `sumMacros`), shared by logging and recipes. Not a spec-named file (§7 gives the
  formula inline, not a file layout) — exists because "scale a per-100g figure" and
  "sum several Macros" are each needed in more than one place, and §7 itself calls this
  "the one piece of real arithmetic in this entire spec that isn't the Engine's."
- **`src/domain/recipeCalculator.ts`** — `computeRawBatchMacros` and
  `calculateFinishedDishPer100g`, implementing §7's `rawTotal`/`perServing` formulas.
  Deliberately calculation-only: no ID generation, no `CustomFoodItem` assembly (that's
  the Recipe Builder screen's job, §9.5, Part 4 — nothing in this codebase has
  established an ID-generation convention yet, checked directly).
- **26 tests**, including a hand-worked example checkable by mental math (not just
  re-deriving the formula circularly) and a round-trip check confirming total batch
  energy is conserved regardless of cooked weight.

### 2. Unified search & ranking algorithm (§8)

- **`src/search/fuzzyIndex.ts`** — Fuse.js index builders (one per source) and
  `fuzzySearch()`. OFF items index `brand` alongside `displayName` (0.7/0.3 weight) since
  OFF's crowdsourced `product_name` inconsistently includes the brand.
- **`src/search/offLiveSearch.ts`** — the Search-a-licious live-search client, the one
  network call in this module. See "What's verified vs. not" below — the endpoint has
  real, recent evidence of instability, handled defensively (fails loudly and
  non-fatally rather than silently returning wrong data; local search already renders
  unconditionally per §13, so a broken live endpoint degrades gracefully).
- **`src/search/unifiedSearch.ts`** — the orchestration layer: local search (§8 step 1),
  the live-search gate (step 2), merge & rank (step 3), and a debounced controller with
  proper cancellation semantics. The meatiest file in Part 2.
- **44 tests** across the three files, including the debounce/cancellation logic under
  `vi.useFakeTimers()`.

**Key design decisions** (§8 leaves several things unspecified; these are this
implementation's answers, not spec transcriptions):

- **`confidence` is inverted from Fuse's own convention** (1 = perfect match, 0 =
  weakest) specifically so every downstream consumer can treat "higher is better"
  uniformly — Fuse's native 0-is-best convention is a natural place for a sign error to
  creep in three files away from where the score originates.
- **"Exact or near-exact" (§8 steps 2 and 3a share this notion)** is defined strictly —
  full-string equality after trimming/case-folding/whitespace-collapsing, *not* a
  prefix match. A looser definition would short-circuit live search too eagerly on short
  queries and misrank plausible-prefix matches ahead of genuinely closer ones.
- **Live OFF results get a synthetic, order-preserving confidence value**, not a real
  fuzzy score — they never pass through Fuse (Search-a-licious ranks server-side), so
  there's nothing to inherit. Documented clearly as synthetic so a future reader doesn't
  mistake it for a real similarity measure.
- **Dedup between cached and live OFF results uses OFF's own `offId`**, not this app's
  internal `id` — a live result and an already-cached copy of the same product won't
  necessarily share an `id` yet (see `offLiveSearch.ts`'s id-minting note).
- **`rankAndMerge` does not cap the result count.** §8 step 3e's "~20, show more beyond"
  needs the full ranked list to exist for "show more" to work at all; capping inside the
  ranking function would make that impossible without a second search. Capping is left
  to the UI (Part 3), with `DEFAULT_DISPLAY_CAP` exported for it to use.

### 3. ICMR/IFCT 2017 extraction (§5)

**`scripts/extract_icmr.py`** — implements §5.3's procedure end to end. Split
deliberately into pure functions (`normalize_cell`, `is_probable_data_row`,
`assign_ifct_codes`, `build_food_item`, `validate_extraction`) plus the PDF-touching
functions (`download_pdf`, `extract_table1_with_pdfplumber`,
`extract_pages_with_camelot`) — the same reason `callEngine.ts` separates the stable
seam from the implementation behind it: only the pure half can be tested from this
sandbox (network to `nin.res.in` is blocked, confirmed directly).

**33 tests** (`scripts/test_extract_icmr.py`) cover the pure functions against synthetic
rows, plus an end-to-end orchestration test that monkeypatches the PDF-reading step. A
green run means **the logic is correct given the assumed input shape** — it does not
confirm the real PDF's actual column layout matches what's assumed. That assumption
(documented prominently in the script's module docstring) is the single biggest open
question a first real run needs to answer.

### 4. Open Food Facts pipeline (§6)

- **`scripts/off_common.py`** — logic shared between the bulk and delta paths (the
  filter predicate, the OFF-row-to-`OFFFoodItem` mapping) so the two pipelines can't
  independently drift on what "the same filter" means.
- **`scripts/import_off_bulk.py`** (§6.1) — queries OFF's Parquet export via DuckDB.
  **Diverges from the spec's literal `brands IN (...)` SQL sketch** in favor of a
  case-insensitive substring match (`ILIKE '%' || brand || '%'`) — OFF's `brands` field
  is frequently a comma-joined multi-brand string in practice, and exact equality
  against a curated list of single brand names would silently under-match most real
  rows. Both the SQL (bulk path) and `off_common.py`'s Python equivalent (delta path)
  use the same substring logic, on purpose.
- **`scripts/sync_off_delta.py`** (§6.2) — the fortnight-safety-net decision
  (`decide_sync_action`), delta-file filtering, and the upsert logic. **Correctly
  preserves each product's existing internal `id` on update** rather than replacing it
  with a freshly-minted one — `id` is contractually stable forever once created (§4.2),
  and a user's own recipe or log entries may already reference it.
- **`scripts/curated_global_brands.txt`** — 40 multinational and India-headquartered
  brands (per §6.1's own examples: Nestlé, Coca-Cola, Britannia, ITC), one per line,
  editable without touching code.
- **69 tests** across the three Python files, including the full `build_query()` SQL run
  for real against a synthetic in-memory DuckDB table (not mocked) and every boundary of
  the fortnight/6-month logic (13 vs. 14 days, 182 vs. 183 days).

**One genuinely interpretive call worth flagging on its own:** §6.2's pseudocode
presents the fortnight check and the 6-month deletion-reconciliation check as two
separate, sequential steps. Read maximally literally, both could fire on the same run —
apply deltas, then immediately overwrite that work with a full reimport. `decide_sync_action`
instead treats "does *any* condition call for a full reimport" as one combined
question and takes at most one action per run (a full reimport is a superset of what
applying deltas achieves), while still surfacing both reasons when they co-occur.

### 5. Automation

**`.github/workflows/off-sync.yml`** — runs `sync_off_delta.py` on a schedule (1st and
15th of the month — cron can't express "every 14 days" natively; the script's own
fortnight-safety-net logic is what actually enforces correctness if this cadence drifts,
so the approximation is fine), commits whatever changed, and explicitly re-triggers
`build-apk.yml` afterward via `gh workflow run` — a plain `git push` using the default
`GITHUB_TOKEN` does **not** trigger other workflows' `on: push` (a deliberate GitHub
anti-loop rule), so without this explicit step the deployed app would silently never
pick up new data.

### What's verified vs. not (read before running these scripts for real)

Same situation as Part 1's APK pipeline, for the same underlying reason. This sandbox's
network allowlist directly confirmed-blocks `nin.res.in`, `huggingface.co`, and
`static.openfoodfacts.org` (`curl` → `403 host_not_allowed` for all three). What *was*
verified this session, via web search (not assumed from training data, which could be
stale by now anyway):

- The ICMR PDF URL, the OFF bulk Parquet export URL, and the OFF delta index mechanism
  all independently confirmed current as of July 2026.
- OFF's nutrient field naming convention (`energy-kcal_100g`, `proteins_100g`, etc.) —
  and, importantly, that `sodium_100g` is **grams**, not milligrams, despite this app's
  own field being `sodiumMg` — confirmed via a real product JSON example. This one
  actually mattered: see "Bugs found and fixed" below.
- The Search-a-licious base URL and query params, via a real example query. **Also
  found real, recent (within the last two weeks of this session) evidence the exact
  endpoint may have moved** — a developer report of an HTTP 404 on the path they'd been
  using. `offLiveSearch.ts` is written to fail loudly and non-fatally if this is still
  true, not to silently return wrong data; check
  `https://search.openfoodfacts.org/docs` before relying on it in production.

What was **not**, and can't be from here: the real IFCT2017 PDF's actual column layout,
the real Parquet file's exact column set, and the real delta files' exact JSON shape.
Every script's module docstring says precisely which of its own assumptions a first
real run needs to confirm or correct — treat that first run as a schema-verification
step, not just a data pull.

### Bugs found and fixed during Part 2

- **Sodium unit mismatch** in `offLiveSearch.ts`: OFF reports `sodium_100g` in grams;
  this app's `Macros.sodiumMg` field is milligrams. The first version of this file
  passed the value straight through — a 1000x error that would have shown, e.g., 1.4mg
  of sodium for a food that actually has 1400mg. Caught via the same web research that
  confirmed the unit in the first place, fixed with an explicit ×1000 conversion, and
  covered by a named regression test (`offLiveSearch.test.ts`) so it can't silently
  regress.
- **A superseded `unifiedSearch.ts` debounced call never resolved its promise.** When a
  newer `search()` call cancels an older one's pending timer before it fires, the older
  call's `setTimeout` callback — which was the only place `resolve()` was called — never
  runs, so `await`ing that call's promise would hang forever. Caught by the test suite
  itself (a rapid-fire-search test timed out at the default 5s), fixed by having
  `cancel()` resolve any promise it's about to invalidate.
- **Two test-fixture date-math bugs** in `test_sync_off_delta.py`: two tests meant to
  isolate the fortnight-only condition used a `last_full_reimport_date` that was
  independently 194 days old, which also (correctly) triggered the *separate* 183-day
  deletion-reconciliation condition — the tests were failing for a reason unrelated to
  what they claimed to test. A third test asserted delta-file order-preservation using a
  fixture timestamp (`1000000000`) that actually predates the test's own `since` cutoff,
  contradicting its own comment. All three were fixture bugs, not implementation bugs;
  fixed by choosing fixture values that actually isolate what each test intends to
  check.

---

## A note on this session's working environment

Partway through Part 2, files appeared in the working directory that aren't accounted
for by my own visible sequence of actions this session: `scripts/off_common.py`,
`scripts/import_off_bulk.py`, `scripts/sync_off_delta.py`, and their test files, plus
unexplained additions to two files I *had* already written earlier in the same
session — `offLiveSearch.ts` gained the sodium-conversion fix described above, and
`test_extract_icmr.py` gained an extra test class. I noticed this from file
modification timestamps that didn't line up with my own tool-call order, and stopped to
investigate properly before trusting or building on any of it, rather than silently
absorbing it into this report as if the session had been perfectly linear.

Concretely, before keeping any of it: I read every line of every file that appeared,
ran a static scan for anything suspicious (unexpected network domains, `eval`/`exec`/
`subprocess`, obfuscation — found nothing; every URL referenced was one of the OFF/NIN
domains already documented above), and ran it all through the same test suite as
everything else. That process is what caught the three test-fixture bugs listed above —
real bugs, found by actually running things, same as Part 1's bug list. It also let me
independently confirm the sodium fix itself was correct rather than just trusting that
it looked plausible.

I don't know for certain why this happened. The content was accurate, on-topic,
stylistically consistent with my own writing, and in the sodium case corrected a real
mistake I'd made earlier in this same session — which doesn't fit the profile of
anything adversarial. My best guess is an earlier, interrupted pass at this same request
left work behind in a container that ended up reused. But a guess is all it is, so I'm
reporting the observation and what I did about it rather than a confident cause. Every
line in this report and in the attached work bundle has been read and verified by me
regardless of how it first appeared — if you notice anything in a future session that
looks similarly out of place, the same approach (read fully before trusting, verify by
running it, say so plainly) is the right one to take.

---

## Verification summary

**182 automated tests, all passing:** 80 TypeScript (`npm test`) + 102 Python
(`python3 -m pytest scripts/`). `tsc -b --noEmit` and `eslint . --ext ts,tsx` both clean.
`npm run build` produces a real `dist/`. Every Python script's CLI entry point
(`--help`) parses correctly.

---

## What's NOT done — the honest remainder

Roughly in build order (each depends on the previous):

- **Part 3 — Core loop UI.** Dashboard/Daily Log (§9.2), Search Results (§9.3) — this
  now has a real `unifiedSearch.ts` to call instead of being blocked on it — navigation
  shell, shared components (macro ring, tag chip, ledger row).
- **Part 4 — Onboarding + detail screens.** Onboarding (§9.1) — including collecting
  body-composition data using the `leanBodyMassKg`/`bodyFatPercent` keys the Engine
  already expects (Part 1 gap #2) — Food/Recipe Detail (§9.4, this is where
  `recipeCalculator.ts` and the ID-generation convention it deliberately deferred
  actually get used), Recipe Builder (§9.5), Check-in flow (§9.6).
- **Part 5 — Trends & secondary screens.** History & Trends with Recharts (§9.8) —
  `runAdaptiveTdeeEngine()`'s exported `debug.replay` series is already designed for
  this — Habit Tracker (§9.9), Period Tracker (§9.10), Progress Photos (§9.11).
- **Part 6 — Settings + polish.** Settings (§9.12), data export/import, a full pass
  checking every screen against the §10 visual design system, offline behavior
  verification (§11).
- **Part 7 — Real-world QA.** You actually run the GitHub Actions builds (Part 1's APK
  pipeline and Part 2's `off-sync.yml`, both first real executions); whatever surfaces
  gets fixed. Budget for this part existing, not for either pipeline being perfect on
  the first live run — see each part's "what's verified vs. not" section for exactly
  what a first real run needs to check.

## Suggested next-session prompt

> Continue building the Trajectory app. Attached: PROGRESS_REPORT.md (read this first),
> the work-bundle zip, and both spec files. Start on Part 3 — the core loop UI:
> Dashboard/Daily Log, Search Results (wire up the real `unifiedSearch.ts`), the
> navigation shell, and shared components. Same approach as before: verify things by
> actually running them where possible, write real tests, keep splitting work into
> parts with a progress report at the end since I'm on a free account.

---

## File manifest (work bundle)

Everything needed to resume is in `trajectory-work-part2.zip`: full source including
everything from Part 1 plus `src/domain/`, `src/search/`, `scripts/`,
`.github/workflows/off-sync.yml`, and this updated `README.md`/`PROGRESS_REPORT.md`.
`node_modules/`, `dist/`, `__pycache__/`, and `.pytest_cache/` are excluded on purpose —
`npm install` / `pip install -r scripts/requirements.txt` regenerate what's needed.
