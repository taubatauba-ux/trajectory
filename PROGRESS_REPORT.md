# Trajectory — Progress Report & Resume Instructions

**Read this first in any new session.** It's written to be self-sufficient: everything a
new chat needs to pick this up correctly is here, not scattered across the two spec
files (though it references them by section, so keep them attached too).

---

## How to resume this project in a new chat

1. Start a new chat.
2. Attach all four files: this `PROGRESS_REPORT.md`, the `trajectory-work-part1.zip`
   work bundle, `trajectory-app-technical-specification.md`, and
   `adaptive-tdee-engine-spec-v2.md`.
3. Say something like: *"Continue the Trajectory app build from where this progress
   report leaves off — start with Part 2 (data pipelines + search)."* Or paste the
   "Suggested next-session prompt" near the end of this file verbatim.
4. Claude should: unzip the work bundle, `npm install`, run `npm test` and `npm run
   build` to confirm the checkpoint still works before changing anything, then proceed.

Do **not** ask Claude to regenerate `android/` from scratch or re-run
`bubblewrap init`-equivalent steps — it's already generated and correct. Only
`build-tools/generate-android-project.mjs` should ever touch that directory, and only if
something in `twa-manifest.json`'s inputs (name, colors, package id) genuinely needs to
change.

---

## What "done" means below

Every item marked done has been **actually run** in the sandbox that built it — tests
executed and passed, `tsc` typechecked with zero errors, `npm run build` produced a real
`dist/`, the generated Android project was inspected file-by-file, not just assumed
correct from documentation. Where something couldn't be verified (mainly: the actual
`bubblewrap build` compile, which needs Android SDK + Google's Maven — blocked in this
sandbox, see below), that's called out explicitly rather than presented as working.

---

## Part 1 (this session) — COMPLETE

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
  both possible GitHub Pages URL shapes automatically (domain-root for a
  `username.github.io`-named repo, or a `/reponame/` sub-path for any other repo name) —
  this was a real correctness bug caught and fixed during this session (see "Bugs found
  and fixed" below), not something guessed right the first time.
- **`public/.well-known/assetlinks.json`** — Digital Asset Links file so the installed
  APK opens full-screen (no browser URL bar) instead of falling back to a Custom Tab.
  Contains the real SHA-256 fingerprint of the actual keystore above.
- **`README.md`** — full step-by-step: create repo → push → enable Pages → add 3 secrets
  → download APK from Actions artifacts → sideload. This is what you (the user) actually
  need to follow — it hasn't changed since being written, so it's not duplicated here.

**What's NOT verified, and can't be from this sandbox:** whether `bubblewrap build`
actually succeeds against a live GitHub Pages URL on a real GitHub Actions runner. Every
individual piece was checked (YAML parses and its job graph is wired correctly, the
Android project is structurally complete and consistent, the exact non-interactive
invocation was confirmed by reading `@bubblewrap/cli`'s own source rather than guessed
from memory) — but the first real end-to-end run has to happen on your GitHub repo. If
it fails, the error message plus this progress report plus the two spec files is enough
for a new session to debug it.

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
convergence test (seeded, reproducible) and edge cases (calorie floor triggering,
dynamic vs. fixed ρ_eff mode, onboarding-with-one-data-point). **10/10 tests pass.**
Run `npm test` yourself to confirm before trusting any of this.

**Four gaps between the two spec documents, bridged and documented in code** (search
each file for these comments — they're not buried, every one has a code comment at its
exact location explaining the reasoning):

1. Module A needs one of 5 discrete activity buckets (sedentary/light/moderate/
   very/extra); `UserProfile` only has a free-text `activityNote`. Bridged with a
   keyword heuristic in `coldStartPrior.ts`'s `inferActivityLevel()` — deliberately
   low-stakes since Module A's whole design assumes the estimator moves away from a
   rough cold-start guess within weeks anyway.
2. Module A/B need lean body mass or body-fat %; `UserProfile.measurements` is an open
   `Record<string, number>`. Bridged with a documented key convention
   (`MEASUREMENT_KEYS` in `coldStartPrior.ts`): `leanBodyMassKg` and `bodyFatPercent`.
   **The onboarding screen (not built yet) needs to use these exact keys** if/when it
   collects body composition data.
3. Module F needs a numeric `desired_weekly_rate_kg`; `UserProfile.goal` only has a
   category (`cut`/`maintain`/`bulk`). Bridged with defaults in
   `adaptiveTdeeEngine.ts`'s `DEFAULT_WEEKLY_RATE_KG` — the cut default (−0.5 kg/week) is
   not arbitrary, it's the exact rate the TDEE spec's own §10 worked example uses.
4. Module F's rate limiter needs "the previously displayed target," which implies
   persisted state — but the whole engine is deliberately stateless (see next
   paragraph). Bridged by reconstructing the full displayed-target history via the same
   day-by-day replay, comparing each day against the value from exactly 7 days prior.

**Key architectural decision:** the engine is **stateless**. `EngineRequest.history`
carries every weigh-in and log on record (per the app spec's own §1.3 contract), so
`runAdaptiveTdeeEngine()` replays the *entire* Kalman filter recursion from the first
weigh-in through today on every single call, rather than persisting filter state
somewhere. Trivial compute cost at realistic data volumes, and it means the Engine has
zero storage footprint of its own — everything persisted is either raw input (weigh-ins,
logs) or a `CheckIn` display snapshot, never Engine-internal state. If a future session
is tempted to "optimize" this into incremental updates, don't, without a specific
performance problem driving it — statelessness is why this is simple to test and reason
about.

`callEngine.ts` is the one stable seam (per app spec §1.3) — wired to the real engine,
with `stubEngine.ts` retained as a defensive fallback if the real engine throws (tested:
`adaptiveTdeeEngine.test.ts`'s last test confirms the fallback path itself works).

### 3. Full data model, per §4

`src/types/*.ts` — every interface from the spec, plus one addition not explicit in the
spec: `ProgressPhoto` (`src/types/media.ts`), inferred from `CheckIn.progressPhotoIds`
and the Progress Photos screen (§9.11) needing *something* concrete to reference.
Flagged in that file's own comment as an extension, not a spec transcription.

### 4. Dexie (IndexedDB) schema

`src/data/db.ts` — not literally specified in either source document (the spec gives TS
shapes, not table/index definitions), so this is an implementation decision. Index
choices are commented inline with the screen/access-pattern reasoning behind each one.

### 5. Project scaffold

Vite + React 18 + TypeScript (strict, `noUncheckedIndexedAccess` on) + Tailwind +
`vite-plugin-pwa`. Design tokens (§10) as both CSS custom properties
(`src/index.css`) and a TS module (`src/design/tokens.ts`) for the rare case JS needs a
raw value. `src/App.tsx` is **explicitly a scaffold checkpoint, not a real screen** — it
seeds a demo profile, calls the real Engine, and renders the result, purely to prove
Dexie + the Engine + the build pipeline all work together end to end. Replace it
entirely once routing + real screens exist (Part 3 below).

### Bugs found and fixed during this session (documented so they're not re-discovered)

- `tsconfig.node.json` was missing `skipLibCheck`, which broke the production build on
  `vite-plugin-pwa`'s workbox type declarations (they reference `ExtendableEvent`/
  `CacheQueryOptions`, which need the `WebWorker` lib, absent from that project's
  Node-only lib set). One-line fix; `npm run build` is green now.
- Bubblewrap's default fetch engine (`fetch-h2`) hangs indefinitely against a plain
  HTTP/1.1 local server (it expects HTTP/2) — this is how the offline Android-project
  generation script serves the icon/manifest it needs. Fixed by switching to the
  `node-fetch` engine via `fetchUtils.setFetchEngine()`.
- The signing keystore path baked into `twa-manifest.json` was initially an *absolute*
  sandbox path (`/home/claude/trajectory/...`), which would have silently broken on any
  other machine, including the GitHub Actions runner. Fixed to a path relative to
  `android/` (`../android-keystore/android.keystore`), which is where `bubblewrap build`
  is actually invoked from.
- The CI workflow initially assumed GitHub Pages always serves from the domain root.
  It doesn't — only repos literally named `username.github.io` do; anything else serves
  from a `/reponame/` sub-path, which needs `launchUrl` in `build.gradle`, Vite's
  `base`, and the PWA manifest's `start_url`/`scope` to all agree, or every asset 404s
  post-install. Fixed: the workflow now detects which case applies from the repo name
  and threads the right base path through Vite's build (`VITE_BASE_PATH` env var) and a
  second `sed` patch to `build.gradle`.
- `keytool`'s modern default (PKCS12 keystores) silently ignores a distinct key
  password and reuses the keystore password for both — a real warning printed during
  generation, not a hypothetical. `CREDENTIALS-KEEP-SAFE-DO-NOT-COMMIT.txt` and the CI
  workflow both reflect this (same value for both secrets) rather than the more common
  but here-incorrect assumption that they'd differ.

None of these would have been caught without actually running things — which is the
justification for how much of this session went into installing and inspecting
`@bubblewrap/cli`'s real source rather than writing the GitHub Actions workflow from
memory/documentation.

---

## What's NOT done — the honest remainder

Roughly in build order (each depends on the previous):

- **Part 2 — Data pipelines + search.** `scripts/extract_icmr.py` (parses the ICMR/IFCT
  2017 PDF into `src/data/icmr/icmr_ifct2017.json`, §5), `scripts/import_off_bulk.py` +
  `scripts/sync_off_delta.py` (§6.1/§6.2) + `.github/workflows/off-sync.yml` (scheduled
  Action running the delta sync — needs the bulk import to have run at least once
  first). **None of this can be executed from a sandbox with this same network
  restriction** (`nin.res.in` and `huggingface.co` were both directly confirmed blocked
  the same way the Android SDK domains were) — the scripts need to be written correctly
  and then actually run either on your own machine or inside a GitHub Action (which,
  same as the APK build, has normal internet access). This part also covers the unified
  search algorithm (§8, Fuse.js over the three local indexes + live OFF fallback) and
  the custom food/recipe macro calculator (§7) — both pure logic, no network needed, so
  those pieces specifically *can* be fully built and tested in a sandbox like this one.
- **Part 3 — Core loop UI.** Dashboard/Daily Log (§9.2), Search Results (§9.3),
  navigation shell, shared components (macro ring, tag chip, ledger row).
- **Part 4 — Onboarding + detail screens.** Onboarding (§9.1) — including collecting
  body-composition data using the `leanBodyMassKg`/`bodyFatPercent` keys the Engine
  already expects (see gap #2 above) — Food/Recipe Detail (§9.4), Recipe Builder (§9.5),
  Check-in flow (§9.6).
- **Part 5 — Trends & secondary screens.** History & Trends with Recharts (§9.8) — this
  can use `runAdaptiveTdeeEngine()`'s exported `debug.replay` series directly, it's
  already designed for this, see `callEngine.ts`'s re-export — Habit Tracker (§9.9),
  Period Tracker (§9.10), Progress Photos (§9.11).
- **Part 6 — Settings + polish.** Settings (§9.12), data export/import, a full pass
  checking every screen against the §10 visual design system, offline behavior
  verification (§11).
- **Part 7 — Real-world QA.** You actually run the GitHub Actions build (Part 1's
  pipeline, but the first real execution of it); whatever surfaces gets fixed. Given how
  many small real issues turned up just from generating the project once in this
  session, budget for this part existing, not for Part 1's pipeline being perfect on the
  first live run.

## Suggested next-session prompt

> Continue building the Trajectory app. Attached: PROGRESS_REPORT.md (read this first),
> the work-bundle zip, and both spec files. Start on Part 2 — the ICMR extraction
> script, OFF import scripts, the off-sync.yml workflow, the unified search algorithm,
> and the custom food/recipe macro calculator. Same approach as before: verify things by
> actually running them where possible, write real tests, keep splitting work into
> parts with a progress report at the end since I'm on a free account.

---

## File manifest (work bundle)

Everything needed to resume is in `trajectory-work-part1.zip`: full source, `android/`
(generated project), `build-tools/`, `public/`, `.github/workflows/`, all configs,
`README.md`, and `android-keystore/` (keystore + credentials — **not** in git, only in
this bundle). `node_modules/` and `dist/` are excluded on purpose — `npm install` and
`npm run build` regenerate both.
