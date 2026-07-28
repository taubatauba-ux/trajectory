# Trajectory

Adaptive nutrition tracking: daily targets computed by a Kalman-filter TDEE estimator
(the "Engine"), food logging against an offline ICMR/IFCT 2017 database plus an online
Open Food Facts cache, and custom foods/recipes. Ships as an installable Android APK (a
Trusted Web Activity wrapping a local-first PWA — no server, no account, no sync target
other than the OFF cache refresh).

Built from `trajectory-app-technical-specification.md` and
`adaptive-tdee-engine-spec-v2.md`, across seven work sessions (`PROGRESS_REPORT.md` and
`PART4_PROGRESS_REPORT.md`/`PART5_PROGRESS_REPORT.md`/`PROGRESS_REPORT_part_2.md`/
`PROGRESS_REPORT_PART3.md` cover Parts 1-5 individually, built in parallel with no
visibility into each other; `INTEGRATION_REPORT_PARTS_1-5.md` covers merging them into
one coherent app; `PART6_PROGRESS_REPORT.md` covers Settings, the design/offline
verification pass, and Part 7 prep). This file only covers "how do I run/build what
already exists."

## Status at a glance

All 12 screens (§9.1–9.12) are built, wired into one router, and integrated — Onboarding
through Settings, including the Engine, the ICMR/OFF search layer, and every secondary
screen (History & Trends, Habit/Period Tracker, Progress Photos). `npm run
typecheck`/`lint`/`test`/`build` all run clean (see `PART6_PROGRESS_REPORT.md` for exact
counts). The Android build pipeline is wired up and verified end-to-end except for the
actual `bubblewrap build` compile step, which needs GitHub Actions to run (see below —
this is expected, not a bug) — that, plus fixing whatever a real Actions run surfaces, is
the one remaining piece (Part 7) and needs a real GitHub repo to do. The ICMR/OFF
Python pipelines (`scripts/`) have never actually been run (need network access no
sandbox in this project's history has had) — the app works correctly with an empty
catalog either way (see `data/bundledFoodData.ts`, which picks up real data
automatically the day either pipeline produces it, no code change needed) or with the
sample catalog seeded in `data/seedDemoFoodData.ts`.

## Local development

```bash
npm install
npm run dev          # http://localhost:5173
npm test              # 322 tests across 43 files
npm run typecheck
npm run lint
npm run build          # production build to dist/ — this is what gets deployed to Pages
```

There's also a `ci.yml` workflow that runs all four of the above on every push and PR —
separate from `build-apk.yml` (which only runs on push to `main` and additionally builds
the signed Android APK, a much heavier job) so a broken build shows up in under a
minute rather than waiting on the full pipeline.

## Building the APK

### Why this needs GitHub Actions, not just your own machine or this chat

Compiling the Android project needs three things: the Android SDK, the Android Gradle
Plugin's dependencies from Google's Maven repo (`maven.google.com`/`dl.google.com`), and
Gradle itself (`services.gradle.org`). Whatever sandboxed environment produced this
repo had a network allowlist that blocked all three — confirmed directly (`curl` to each
returned `403 host_not_allowed`), not assumed. That's the "GitHub block" you read about:
the standard workaround for exactly this situation is to let GitHub Actions do the
compile, since Actions runners have normal, unrestricted internet access. **Your
finished app is not limited in any way by this** — it's purely a constraint on where the
one-time compilation step can run.

The Android project itself (`android/`) is already generated and committed — you are
not running `bubblewrap init` or fighting its interactive setup wizard. The workflow at
`.github/workflows/build-apk.yml` does exactly two things: builds the web app and
deploys it to GitHub Pages, then compiles + signs the APK against that live URL.

### Step 1 — Create a GitHub repository

Either name works; user/org Pages repos need one less moving part, which is why it's
the recommendation:

- **Recommended:** name it exactly `<your-github-username>.github.io`. GitHub serves
  this at your domain root with no extra path, which is what this project defaults to.
- **Also fine:** any other name (e.g. `trajectory`). The workflow detects this
  automatically and builds with the correct `/reponame/` sub-path — you don't need to
  configure anything differently.

Create it at github.com/new. **Leave it empty** — no README, no .gitignore (you already
have one).

### Step 2 — Push this code

From the folder this README is in:

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

(`android-keystore/` will NOT be pushed — it's in `.gitignore` on purpose. See Step 4.)

### Step 3 — Turn on GitHub Pages

Repo → **Settings → Pages** → under "Build and deployment", set **Source** to
**GitHub Actions**. (Not "Deploy from a branch" — that's the older Jekyll-based path and
isn't what `build-apk.yml` uses.)

### Step 4 — Add three repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**. Add all
three, using the values already generated for you in
`android-keystore/CREDENTIALS-KEEP-SAFE-DO-NOT-COMMIT.txt` (in the work bundle this repo
came with — not in this repo, on purpose):

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | output of the command below |
| `ANDROID_KEYSTORE_PASSWORD` | `KEYSTORE_PASSWORD` line from the credentials file |
| `ANDROID_KEY_PASSWORD` | `KEY_PASSWORD` line from the credentials file (same value as above — see that file's own note on why) |

Get the base64 value (run this against the `android-keystore/android.keystore` file from
the work bundle, wherever you saved it):

```bash
base64 -w0 android-keystore/android.keystore
```

(macOS: `base64 -i android-keystore/android.keystore` — no `-w0` flag there.)

Paste the entire output as `ANDROID_KEYSTORE_BASE64`'s value.

**Use this exact keystore. Don't generate a new one.** Every future rebuild has to be
signed with the same key, or Android treats it as a different, incompatible app and
won't let it overwrite the one you already installed. Keep
`android-keystore/android.keystore` and its credentials file somewhere safe outside git
— a password manager, an encrypted backup, anything durable. If you lose it, you can
still build a *new* app, just never update this one in place.

### Step 5 — Let it build

Pushing in Step 2 already triggered `build-apk.yml` once (it'll have failed if you
hadn't added the secrets yet — that's fine). Re-run it: repo → **Actions** →
"Build Android APK" → pick the latest run → **Re-run all jobs**. Or push any new commit.

It runs two jobs: build the web app and deploy it to Pages (~1 min), then compile and
sign the APK against that live URL (~3-5 min, mostly Gradle's first-run dependency
download — GitHub's runner has full internet access, so this just works).

### Step 6 — Get the APK

Same Actions run page → scroll to **Artifacts** → download `trajectory-apk` (a zip
containing `app-release-signed.apk` and `app-release-bundle.aab`; you only need the
`.apk` for sideloading — the `.aab` is a bonus, for if you ever want Play Store
distribution).

### Step 7 — Install it on your phone

Transfer the `.apk` to your phone (email it to yourself, or `adb install app-release-signed.apk`
over USB if you have `adb`). You'll need to allow installs from that source — Android
will prompt you the first time with a link straight to the right settings screen if you
don't.

### If a run fails

| Symptom | Cause | Fix |
|---|---|---|
| `build-apk` job errors immediately on the keystore step | Secrets not set (or misnamed) | Re-check Step 4's exact three names |
| Pages deploy fails / "Get Pages site failed" | Pages source not set to GitHub Actions | Step 3 |
| App installs but opens in a browser tab (not full-screen) | Digital Asset Links didn't verify yet, or Pages hasn't finished propagating | Wait a few minutes and reinstall; check `https://<your-host>/.well-known/assetlinks.json` loads and matches the fingerprint in that file |
| App opens to a blank/404 screen | Wrong base path for a project-Pages repo | Shouldn't happen — the workflow detects this automatically; if it does, check the "Determine GitHub Pages base path" step's log output against your actual Pages URL |

## Project structure

```
src/
  engine/       The Adaptive TDEE Engine — Modules A-F, plus buildEngineRequest.ts and
                flagPresentation.ts (the two shared "call it correctly" helpers)
  types/        The §4 data model
  data/         Dexie (IndexedDB) schema (db.ts) + one query/mutation module per
                domain concept (checkIns, weighIns, dailyLogs, dataExport,
                bundledFoodData, ...)
  design/       Design tokens (§10)
  lib/          Small cross-screen utilities (dates, macros math, units, flag copy)
  search/       Part 2's search engine (Fuse indexes + live OFF fallback) — consumed
                via search/useUnifiedSearch.ts, the adapter hook Dashboard and Recipe
                Builder both actually use
  components/   Shared UI (MacroRing, TagChip, LedgerRow, form primitives, nav shell)
  screens/      One directory per §9.x screen — dashboard, onboarding, checkIn,
                foodDetail, recipeBuilder, HistoryTrends, HabitTracker, PeriodTracker,
                ProgressPhotos, settings
scripts/        ICMR/OFF pipeline scripts (§5/§6) — never actually run in this
                project's history (needs network no sandbox here has had); the app
                works with an empty or seeded-demo catalog either way
android/        Generated Android project. Don't hand-edit — see build-tools/ instead.
build-tools/    generate-android-project.mjs regenerates android/ from twa-manifest.json
.github/workflows/
  build-apk.yml   Builds + deploys the web app, then compiles + signs the APK (main only)
  ci.yml          typecheck/lint/test/build on every push and PR — fast, no Android
  off-sync.yml    Scheduled OFF delta sync (§6.2) — commits fresh data, triggers a rebuild
```

Full explanation of every design decision (and every place this implementation had to
bridge a gap between the two source specs) is in the code comments — every non-obvious
file starts with one explaining what spec section it implements and why. `PROGRESS_REPORT.md`
is the map; start there before diving into source.
