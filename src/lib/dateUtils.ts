// Small date helpers shared across screens. Deliberately NOT engine logic (no
// trend-smoothing, no back-calculation — see engine.types.ts's header comment for why
// that distinction matters) — just calendar-day bookkeeping for the UI layer.
//
// Every function that cares about "today" takes an optional `now` override instead of
// calling `new Date()` internally, so callers (and tests) can pin a deterministic date
// without a mocking framework.

/** ISO calendar date (YYYY-MM-DD) for the given instant, defaulting to the real "now".
 *
 * Deliberately UTC-based (toISOString, not local getFullYear/getMonth/getDate) — this
 * matches adaptiveTdeeEngine.ts's own day-boundary convention exactly (its `today` and
 * `addDaysISO` are both `asOf.toISOString().slice(0, 8)`-style UTC slicing). A user's
 * *local* midnight would arguably be the more correct day boundary for a nutrition app,
 * but that's a pre-existing characteristic of the already-tested Engine, not something
 * this file should silently diverge from — doing the "more correct" thing only on the
 * UI side would make `buildEngineRequest`'s today-exclusion (engine/buildEngineRequest.ts)
 * disagree with the Engine's own idea of "today" right at the day boundary, which is
 * worse than both sides sharing one consistent (if imperfect) definition. Worth revisiting
 * as a deliberate cross-cutting change later, not a one-file fix. */
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function isSameDate(isoA: string, isoB: string): boolean {
  return isoA.slice(0, 10) === isoB.slice(0, 10);
}

/** True if `dateISO` is today or already in the past relative to `now` — used for the
 * check-in banner condition (§9.6: "triggered when nextCheckIn is today or past"). */
export function isTodayOrPast(dateISO: string, now: Date = new Date()): boolean {
  return dateISO.slice(0, 10) <= todayISO(now);
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Short, human label for a log timestamp: just the time for today's entries (the
 * timeline, §9.2, is a single unbucketed list ordered by loggedAt — the date is implied
 * by context, so repeating it on every row would be noise). */
export function formatLogTime(iso: string): string {
  const d = new Date(iso);
  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${minutes} ${suffix}`;
}

/** Weekday + day-of-month for headers that need a fuller date than formatLogTime. */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  // getDay() is always 0-6 and WEEKDAY_LABELS has exactly 7 entries, so this index is
  // always in range — the assertion is safe, noUncheckedIndexedAccess just can't see it.
  const weekday = WEEKDAY_LABELS[d.getDay()]!;
  return `${weekday} ${d.getDate()}`;
}

/** For dates that could be arbitrarily old rather than always-recent (a dataset sync
 * date, e.g. — Settings' §9.12 display) — full month/day/year rather than
 * formatDayLabel's weekday+day, which reads ambiguously once "how long ago" stops being
 * obvious from context. Also, unlike formatDayLabel/todayISO, robust to *either* a bare
 * YYYY-MM-DD or a full ISO timestamp as input: SyncMeta's three date fields aren't
 * uniformly shaped (extract_icmr.py writes a full `datetime.isoformat()`;
 * sync_off_delta.py writes a bare `date.isoformat()` — see bundledFoodData.ts's own
 * comment on the same distinction), and appending "T00:00:00" to a string that already
 * has a time component would double up rather than parse. */
export function formatDatasetDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
