// §1.3's call site. Per trajectory-app-technical-specification.md §1.3: "replace this
// function's body only. Nothing else in the app changes." The body has been replaced —
// it now calls the real Adaptive TDEE Engine (adaptiveTdeeEngine.ts, implementing
// adaptive-tdee-engine-spec-v2.md) instead of the stub. The stub is retained as a
// defensive fallback: everything upstream of this function is local, synchronous
// arithmetic with no I/O, so a thrown error here should be rare (malformed data, not a
// network hiccup) — but "rare" isn't "never", and a screen that can't render targets at
// all is a worse failure than one showing a clearly-flagged, cruder estimate.
import type { EngineRequest, EngineResponse } from './engine.types';
import { runAdaptiveTdeeEngine, type AdaptiveEngineOptions } from './adaptiveTdeeEngine';
import { stubEngine } from './stubEngine';

export async function callEngine(
  req: EngineRequest,
  options?: AdaptiveEngineOptions,
): Promise<EngineResponse> {
  try {
    const { response } = runAdaptiveTdeeEngine(req, options);
    return response;
  } catch (err) {
    console.error(
      '[callEngine] Adaptive TDEE Engine threw, falling back to stubEngine. This should ' +
        'be investigated, not silently relied on:',
      err,
    );
    const fallback = stubEngine(req);
    return {
      ...fallback,
      flags: [...(fallback.flags ?? []), 'engine_fallback_to_stub'],
    };
  }
}

// Re-exported so screens that need the full day-by-day estimate series for charting
// (History & Trends, §9.8) can get it without adding a second seam — see the doc
// comment on runAdaptiveTdeeEngine in adaptiveTdeeEngine.ts for why this exists
// alongside, not instead of, the one-function contract.
export { runAdaptiveTdeeEngine } from './adaptiveTdeeEngine';
export type { AdaptiveEngineOptions, AdaptiveEngineDebugInfo, DailyReplayPoint } from './adaptiveTdeeEngine';
