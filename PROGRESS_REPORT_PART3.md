# Trajectory — Part 3 Progress Report

**Scope:** Core loop UI — Dashboard/Daily Log (§9.2), Search Results (§9.3), navigation
shell, shared components (macro ring, tag chip, ledger row), per PROGRESS_REPORT.md's
roadmap. Built starting from the `trajectory-work-part1.zip` checkpoint, with Part 2
(data pipelines + unified search algorithm) understood to be running in a **separate,
uncoordinated session in parallel** — that constraint shaped several decisions below and
is worth reading before touching `src/search/`.

Checkpoint status: **10/10 Part 1 tests still passing, 51 new tests added (61/61
total), `tsc -b` clean, `vite build` clean, and a full interactive walkthrough verified
in a real headless browser** (details in "How this was verified"). This report, like
Part 1's, tries to say plainly what's actually been exercised versus what's merely
plausible.

---

## 1. What's built

### Dashboard / Daily Log (§9.2) — `src/screens/dashboard/`
- **TodaySummary** — the day's kcal/protein/carb/fat, consumed vs. target, tabular-mono
  throughout (§10's "one non-negotiable" element). A `MacroRing` for kcal, `MacroBar`
  strips for the three macros.
- **EngineFlagsBadges** — renders `EngineResponse.flags` as small badges instead of the
  old scaffold's raw snake_case dump, using a new flag→copy mapping (§3 below).
- **QuickWeighIn** — the "single always-visible number input, separate from the heavier
  Check-in flow" the spec asks for. Upserts `WeighIn` for today; shows a saved state if
  today's already logged.
- **Search bar + Recents & Favorites / Search Results** — empty query shows Favorites
  (pinned, remembered gram amount) then "Frequently logged" (ranked by log count, ties
  broken by recency); 2+ characters shows live results. One-tap add via a "+" button
  (writes the log entry, shows an undo toast); tapping the row body expands an inline
  gram editor with a live macro preview instead of navigating to a Food Detail screen
  that doesn't exist yet (Part 4 owns §9.4 — see §5).
- **TimelineLog** — single chronological list, no meal grouping, per spec. Swipeable to
  reveal Edit/Delete (§9.2's literal words), with a non-swipe fallback: the actions sit
  in normal tab order and opening on focus, so keyboard/screen-reader use doesn't depend
  on performing a drag gesture.
- **CheckInBanner** — non-blocking, shown when `nextCheckIn` is today or past; links to
  a `/check-in` placeholder (Part 4's real screen lands at the same route).
- **DashboardScreen** — wires all of the above to Dexie via `useLiveQuery` and to the
  Engine via `callEngine`. Redirects to `/onboarding` if no profile exists yet, rather
  than rendering broken/empty data.

### Navigation shell — `src/App.tsx`, `src/components/layout/`
`HashRouter` (not `BrowserRouter` — see §2) wrapping a `RootLayout` (bottom nav: Today /
Trends / Habits / More) for the four persistent destinations, plus `/onboarding` and
`/check-in` outside that shell as focused, chrome-free flows. Every route in §9 that
isn't built yet gets a real placeholder screen (`src/screens/placeholders/`) instead of
a 404 or a crash, so the whole shell is clickable today — the same "ship a stub behind
the real interface" philosophy §1.3 uses for the Engine, applied to routing.

### Shared components — `src/components/`
`MacroRing`, `MacroBar`, `TagChip`, `LedgerRow` (the four named in scope), plus
`SearchBar`, `SearchResultRow`, `Toast`, and a small hand-rolled `icons.tsx` (no icon
library dependency — see §2). `SearchResultRow` is reused for search results, Favorites,
and Recents, which is why pinning/quick-add/expand behave identically in all three.

### Everything else added
- `types/favorites.ts` — new `Favorite` interface, same "spec implies a shape §4 never
  defines" situation as Part 1's `ProgressPhoto`. Documented the same way.
- `data/db.ts` — additive `version(2).stores({ favorites: ... })`. Verified empirically
  (a throwaway fake-indexeddb script, not just Dexie's docs) that this preserves every
  other table without needing to repeat their definitions.
- `data/seedDemoFoodData.ts` / `data/seedDemoProfile.ts` — see §2.4.
- `engine/buildEngineRequest.ts` — see §2.3.
- `lib/` (new directory) — `macros.ts`, `dateUtils.ts`, `recents.ts`, `flagLabels.ts`,
  `cx.ts`: pure, unit-tested logic shared across screens. Likely directly reusable by
  Part 5 (Trends needs the same macro-summing and date logic) and Part 4 (Check-in needs
  `buildEngineRequest`).

---

## 2. Decisions worth knowing about before building on top of this

### 2.1 `src/search/` was deliberately left untouched
Part 2's own scope (per PROGRESS_REPORT.md) is "the unified search algorithm (§8,
Fuse.js over the three local indexes + live OFF fallback)", landing at
`src/search/unifiedSearch.ts`/`fuzzyIndex.ts` per §3's repo structure. Since that
session runs with no visibility into this one (and vice versa), writing anything to that
exact path here risked a real failure mode: whichever zip gets applied second silently
clobbers the other's actual work.

Instead, the Dashboard's search is wired through dependency injection:
`SearchBar`/`SearchResultRow` never import a specific search implementation — they take
`searchFn: (query) => Promise<FoodItem[]>` as a prop. Today, `DashboardScreen` passes in
`src/screens/dashboard/localFoodSearchFallback.ts`, a small Fuse.js-over-`db.foodItems`
implementation with a `TODO(part2)` header comment. **Integrating Part 2's real search is
a one-line change**: swap that one import/prop in `DashboardScreen.tsx` for the real
`searchFood` from `src/search/unifiedSearch.ts`, then delete the fallback file. Neither
`SearchBar` nor `SearchResultRow` need to change at all.

`useFoodSearch.ts` (the hook doing the actual fetching) fires on every keystroke rather
than debouncing — §8's own pseudocode treats local results as instant/undebounced and
only the live-OFF portion as 600ms-debounced, and that timing distinction belongs inside
`searchFood`'s own implementation, not the calling UI. Race conditions across
overlapping calls are handled with a request-id token, unit-testable without a real
search backend.

### 2.2 `HashRouter`, not `BrowserRouter`
This deploys as a static GitHub Pages site (per `vite.config.ts`'s `BASE_PATH` comment)
with no server-side rewrite rule and no `public/404.html` SPA-redirect workaround in
this bundle — confirmed by checking, not assuming. A direct or refreshed load of e.g.
`/trends` under `BrowserRouter` would 404 at the host before React ever runs.
`HashRouter`'s routing lives entirely in the URL fragment, which the server never sees,
so it works identically fresh, offline, or mid-navigation inside the installed TWA
(which has no visible address bar anyway). Revisit only if a real server-side rewrite
gets added to the deploy setup — the reasoning is in a comment at the top of `App.tsx`
so it doesn't get "simplified" back without someone re-deriving this.

### 2.3 The Engine is called with today's log excluded
`buildEngineRequest(profile, weighIns, logEntries, asOf)` aggregates `logEntries` into
per-day totals for the Engine's `history.dailyLogs`, but **always drops the current
date**. `LogEntry`s accumulate through the day, so "today's total" is a moving target;
the Kalman filter (`adaptiveTdeeEngine.ts`) has no way to know a given date's total is
partial rather than final — whatever's in the map for a date, it treats as that day's
finished number. Today's real total becomes available from tomorrow's call onward, once
it's a completed day. Weigh-ins are *not* filtered this way — `WeighIn` is one-per-day,
upsert-on-duplicate, so whatever's stored for today is already final the moment it
exists, nothing to exclude.

This rule lives in `src/engine/` (not inside the Dashboard) because it applies to any
caller — Check-in (§9.6, Part 4) will also call the Engine and needs the same treatment,
so it should reuse this function rather than re-deriving (or worse, silently
contradicting) the same logic.

The Dashboard calls the Engine on mount and again whenever `weighIns` changes (a fresh
weigh-in is exactly the kind of history change the Engine is designed to react to), but
*not* on every food-log edit — the Engine is cheap enough to call on every render, but
doing so would make the displayed target visibly jitter as someone logs meals through
the day, which is both a bad look and not obviously more correct (today isn't in the
request either way, see above).

### 2.4 Demo/seed data — two separate, differently-scoped files
`Part 2 hasn't run yet in this bundle`, so `foodItems` ships empty — an empty search box
that always returns nothing looks broken, not "correctly waiting for data". Two files
address this, deliberately kept separate because they make different kinds of claims:

- `seedDemoFoodDataIfEmpty()` — ~24 illustrative foods (icmr/off/custom mix, plausible
  but not IFCT-sourced macros, clearly commented as such) seeded automatically whenever
  `foodItems` is empty. This is reference/catalog data, not a claim about the user, so
  auto-seeding is fine — and it's self-cleaning: the moment Part 2's real import
  populates real rows, the empty-check stops firing.
- `seedDemoProfileAndHistory()` — a fake person (profile, 21 days of noisy-but-trending
  weigh-ins, matching food logs). This **fabricates identity**, so unlike the catalog
  it is never called automatically — it's reachable only via one explicit, clearly
  labeled button on the `/onboarding` placeholder ("Load demo profile & sample data"),
  and Part 4's real onboarding flow replaces that placeholder outright. 21 days clears
  `MIN_DAYS_FOR_CONFIDENCE` (7) so the demo shows a converged Engine response rather than
  an immediate insufficient-data flag.

### 2.5 A gap worth flagging for Part 4/6, not fixed here
`populationProfiles.ts` derives `pharmacologically_assisted` status from a
`runAdaptiveTdeeEngine` **options** parameter, not from `UserProfile` — there's currently
no data-model field or Settings UI for a person to declare this, so `callEngine()` is
always invoked with the default (`'general'`). Whoever builds Onboarding/Settings will
need to both add the profile field and thread it through as an option where the Engine
gets called (`buildEngineRequest`'s output would need a sibling options object). Flagging
rather than guessing at a UI for this now, since it's out of this part's scope and a
wrong guess would be worse than an honest gap.

Similarly, `pregnancy_breastfeeding_status_unconfirmed` fires on **every** call
unconditionally (Part 1's own documented gap — no such field exists on `UserProfile`
either) — this isn't a Part 3 bug, it'll show on the Dashboard for any real profile
until that field exists, and the flag copy ("needs confirming") is written to read
sensibly in that permanent state.

---

## 3. Bugs found and fixed

Two categories: one pre-existing (found while building on top of Part 1's work), and a
couple introduced and caught during this part's own build.

**Pre-existing — tag color permutation (`design/tokens.ts`, `index.css`).** Spec §10
assigns `--tag-icmr: #C9A24E` (gold), `--tag-off: #6B84A6` (blue), `--tag-custom:
#8B7EC8` (purple). The shipped values were a cyclic swap of these three — icmr had off's
color, off had custom's, custom had icmr's — internally consistent between the two files
(so not a copy-paste mismatch between them), but not matching the spec, and specifically
undermining §9.3's explicit point that the ICMR tag's gold tone is "a deliberate nod to
the source." Corrected to the spec's exact hex values in both files, verified in a real
rendered page afterward (`getComputedStyle` on a rendered ICMR tag returns
`rgb(201, 162, 78)` — the corrected gold — not the old blue).

**Found via testing — stale closure in `LedgerRow`'s swipe handling.** `handlePointerUp`
computed its open/closed decision from the `offset` React state variable captured in its
own render closure. When pointer events fire in rapid/synchronous succession — confirmed
with a fast programmatic drag, plausible for a real fast flick too — `pointerup` could
run before React had re-rendered since the preceding `pointermove`s, so it would read a
stale pre-drag value and immediately snap the row back closed on release, right after
correctly computing the open position moments earlier. Fixed by mirroring the live
offset onto the `useRef` the gesture already uses for `startX`/`moved`, so the decision
at pointer-up time is always read from the ref (synchronously current by construction),
never from the closure.

**Found via testing — `setPointerCapture` swallowing clicks on nested interactive
content.** `LedgerRow` called `setPointerCapture` on every pointerdown within the row,
including ones that originated on a child button — e.g. the inline gram editor's Save
button, which lives inside the same swipeable content div. Capturing the pointer there
silently redirects the subsequent pointerup (and the click event derived from it) away
from the button and onto the row, so Save/Cancel did nothing, with no error anywhere.
Fixed by skipping swipe-engagement entirely when the pointerdown's target is (or is
inside) a `button`/`input`/`textarea`/`select`/`a`, and by wrapping the capture call in a
try/catch regardless (it can also throw for pointer ids the browser doesn't consider
"active", which — separately — is worth knowing turns out to be true of
programmatically-dispatched PointerEvents specifically, not just an edge case).

**Found via testing — ambiguous aria-labels.** The quick-add button's label (`"Add
{name}"`) was a literal prefix of the favorite-toggle button's label (`"Add {name} to
favorites"`) on the same row. Discovered because it broke an automated selector, but the
same ambiguity would affect a screen-reader user picking between the two by label.
Renamed the quick-add label to `"Log {name}"`, which also matches the app's own internal
vocabulary (`LogEntry`, `handleLog`) better than "Add" did.

---

## 4. How this was verified

Same standard Part 1 set: `npm test` (Vitest), `tsc -b`, `vite build`. All new pure logic
(`lib/`, `engine/buildEngineRequest.ts`) has unit tests — 51 new tests, 61/61 total.

Two things worth calling out beyond that baseline:

**A real Dexie integration test** (`src/data/integration.test.ts`, via
`fake-indexeddb`, already a devDependency) seeds the demo catalog and profile, builds a
real `EngineRequest` from that data, and calls the actual (non-stub) Engine end to end —
asserting the response is sane (finite targets in a plausible range, no
`insufficient_data`, no fallback-to-stub) and that today never leaks into the request.
This exercises the exact seam most likely to have subtle bugs — a hand-crafted unit-test
fixture wouldn't have caught the timezone bug below, for instance.

**A scripted browser walkthrough**, since this part is mostly UI and neither of the
above renders anything. A headless Chromium happened to be available in this sandbox
(verified rather than assumed — it does not appear to be reachable from a standard `npm`/
`pip` toolchain given this project's allowed network domains, so this was very much a
one-off using what was on hand, not something wired into the repo or its CI). Screenshot
inspection turned out not to be usable in this session (confirmed by testing on a known
image file, not assumed), so verification went further than eyeballing anyway: scripted
walkthroughs drove real interactions and asserted on console output, computed styles,
and DOM state — onboarding→dashboard redirect, search, quick-add with the undo toast,
favoriting, cross-tab navigation, layout (bottom nav doesn't overlap content), and the
corrected tag color rendering as the actual gold RGB value, not just in source. All of
the LedgerRow bugs in §3 were caught exactly this way, mid-verification, not by
inspection.

**What this doesn't cover:** there's no checked-in component-testing setup (no jsdom /
React Testing Library). Existing tests are all plain-node `.test.ts`; adding a browser
DOM environment felt like a bigger addition to shared tooling than this session should
make unilaterally mid-parallel-build. The browser walkthrough substituted for this
where it could, but it's a one-off verification, not regression coverage — if that's
wanted going forward, `jsdom` + `@testing-library/react` would be the natural addition
and is very unlikely to conflict with anything Part 2 needs (its scope doesn't obviously
touch `package.json` at all). Also not covered: real touch input on an actual device,
right-to-left or non-English strings anywhere, and the Android/TWA shell itself (out of
this part's scope, untouched).

---

## 5. What Part 3 explicitly did not build (and why)

- **Food/Recipe Detail (§9.4), Recipe Builder (§9.5)** — Part 4's screens. Search rows
  support one-tap-add and an inline expand-to-adjust-quantity, which covers "add with a
  custom amount" without needing to navigate to a Detail screen that doesn't exist.
  Nothing here should need to change when Part 4 adds real navigation to Detail — the
  row's "view more" affordance (if any is added) is additive.
- **Onboarding (§9.1), Check-in (§9.6)** — Part 4's screens, stand in as placeholders at
  their real routes (`/onboarding`, `/check-in`), reachable from the flows that lead to
  them (no-profile redirect, check-in banner).
- **Trends (§9.8), Habit Tracker (§9.9)** — Parts 5's screens, bottom-nav destinations
  wired to placeholders.
- **Period Tracker (§9.10), Progress Photos (§9.11), Settings (§9.12)** — listed as
  rows-to-come on the `/more` placeholder, not built.
- **Recipe macro calculator (§7)** — Part 2's scope per PROGRESS_REPORT.md; not needed
  since Recipe Builder isn't built here either.

---

## 6. File manifest

**New:**
```
src/types/favorites.ts
src/lib/{macros,dateUtils,recents,flagLabels,cx}.ts (+ .test.ts each)
src/engine/buildEngineRequest.ts (+ .test.ts)
src/data/seedDemoFoodData.ts
src/data/seedDemoProfile.ts
src/data/integration.test.ts
src/components/{MacroRing,MacroBar,TagChip,LedgerRow,SearchBar,SearchResultRow,Toast,icons}.tsx
src/components/useFoodSearch.ts
src/components/layout/{RootLayout,BottomNav}.tsx
src/screens/dashboard/{DashboardScreen,TodaySummary,EngineFlagsBadges,QuickWeighIn,
  TimelineLog,RecentsAndFavorites,CheckInBanner,localFoodSearchFallback}.tsx|ts
src/screens/placeholders/{ComingSoonScreen,TrendsScreen,HabitsScreen,MoreScreen,
  CheckInScreen,OnboardingScreen}.tsx
```

**Modified:**
```
src/App.tsx              — full rewrite: router + nav shell (was Part 1's scaffold)
src/data/db.ts            — +favorites table (v2 migration), +favorites helpers
src/types/index.ts        — +favorites barrel export
src/design/tokens.ts       — tag color fix
src/index.css              — tag color fix
```

**Untouched, deliberately:** everything in `src/engine/` besides the new
`buildEngineRequest.ts`; `src/search/`; `src/data/icmr/`, `src/data/off/`; all Python
scripts and workflows; the Android/`build-tools` project; `vitest.config.ts`,
`tailwind.config.js`, and `package.json` besides content already covered above (no new
runtime dependencies — the icon set, className-joining, and search debouncing were all
hand-rolled specifically to avoid adding npm packages a concurrently-running session
had no reason to expect).

---

## Suggested next-session prompt

*"Continuing the Trajectory build. Attached: the Part 3 checkpoint zip, this report, the
technical spec, and the TDEE engine spec. Once Part 2's data pipeline work is available,
integrate it first (swap the one import noted in §2.1 of this report, delete the
fallback file, confirm search still works end to end) before starting new screens. Then
build Part 4 — Onboarding (§9.1), Food/Recipe Detail (§9.4), Recipe Builder (§9.5),
Check-in (§9.6) — replacing the placeholders at their existing routes. Same approach as
before: verify things by actually running them where possible, write real tests, and
check components/screens render correctly rather than assuming from the code alone."*
