// Assembles the same EngineRequest shape any other caller would (§1.3) and calls
// runAdaptiveTdeeEngine directly — NOT callEngine() — because this screen specifically
// needs the `debug.replay` series callEngine() doesn't return (see callEngine.ts's own
// comment on why it re-exports runAdaptiveTdeeEngine alongside the one-function
// contract). This hook does no estimation/smoothing of its own: it feeds the Engine
// exactly the persisted weigh-ins and logged totals and renders whatever comes back.
//
// Deliberately calls db.weighIns / getAllDailyTotals directly rather than importing
// from a shared "assemble EngineRequest" helper: `dailyTotals` (unfiltered, including
// today) is also returned below for other consumers (AdherencePanel, CSV export), so
// building the request via a second raw-logEntries query + re-aggregation through
// buildEngineRequest.ts (Part 3's version of that helper, merged in alongside this
// screen) would mean computing the same totals twice. Instead: aggregate once here via
// getAllDailyTotals, and exclude today only from the copy handed to the Engine —
// today's log is still a moving target for the Kalman filter's purposes (see
// buildEngineRequest.ts's own doc comment for the full reasoning, which this mirrors).
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getProfile } from '../../data/db';
import {
  runAdaptiveTdeeEngine,
  type AdaptiveEngineDebugInfo,
} from '../../engine/callEngine';
import type { EngineRequest, EngineResponse } from '../../engine/engine.types';
import type { Macros, WeighIn } from '../../types';
import { getAllDailyTotals } from './dailyLogTotals';
import { todayISO } from '../_shared/dates';

export type EngineHistoryResult =
  | { status: 'loading' }
  /** No UserProfile row yet — Onboarding (§9.1, Part 4) hasn't run. Not an error: this
   * is the expected state for a fresh install. */
  | { status: 'no-profile' }
  /** Profile exists but zero weigh-ins — runAdaptiveTdeeEngine refuses to run without
   * at least one (see its own thrown error), and rightly so: Module B's cold-start
   * prior needs a first weight to anchor to (adaptive-tdee-engine-spec-v2.md §4). */
  | { status: 'no-weighins' }
  /** The Engine threw for some other reason. Surfaced distinctly from 'no-weighins' so
   * the empty state copy can be accurate instead of generically "try again". */
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      response: EngineResponse;
      debug: AdaptiveEngineDebugInfo;
      weighIns: WeighIn[];
      /** Also returned here (not just consumed internally to build the request) so
       * callers doing adherence/CSV work don't need a second query + re-aggregation of
       * the same logEntries table. */
      dailyTotals: Map<string, Macros>;
    };

/** `asOf` lets tests/stories pin "today"; production callers omit it. */
export function useEngineHistory(asOf?: Date): EngineHistoryResult {
  const result = useLiveQuery<EngineHistoryResult>(
    async () => {
      const profile = await getProfile();
      if (!profile) return { status: 'no-profile' };

      const weighIns = await db.weighIns.toArray();
      if (weighIns.length === 0) return { status: 'no-weighins' };

      const dailyTotals = await getAllDailyTotals();
      const today = todayISO(asOf);
      const dailyLogs = Array.from(dailyTotals, ([date, totals]) => ({ date, totals })).filter(
        (d) => d.date !== today,
      );
      const req: EngineRequest = { profile, history: { weighIns, dailyLogs } };

      try {
        const { response, debug } = runAdaptiveTdeeEngine(req, asOf ? { asOf } : undefined);
        return { status: 'ready', response, debug, weighIns, dailyTotals };
      } catch (err) {
        return { status: 'error', message: err instanceof Error ? err.message : String(err) };
      }
    },
    // asOf's identity changes every render if a caller passes `new Date()` inline —
    // callers that care about stability (tests) should pass a stable Date instance.
    [asOf],
  );
  return result ?? { status: 'loading' };
}
