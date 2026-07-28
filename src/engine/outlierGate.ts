// Module D — Outlier / Regime-Change Gate. Source of truth:
// adaptive-tdee-engine-spec-v2.md §6. Standard robust-filtering "3-sigma gate": flags a
// day, never discards it — per Module C's own logic, a true sustained shift SHOULD move
// the estimate. The gate's job is to make the event legible for later UI explanation
// and to optionally suppress *displaying* a target change for a few days while the
// filter re-stabilizes (§6, detection rule comment block).

export interface OutlierGateResult {
  flagged: boolean;
  /** |y_t| / sqrt(S_t) — how many sigmas away the innovation was. */
  sigmaMultiple: number;
}

const GATE_THRESHOLD_SIGMAS = 3;
/** §6: "optionally suppress DISPLAYING a target change ... for 3-5 days". We use the
 * upper end of that range. */
export const POST_FLAG_SUPPRESSION_DAYS = 5;

export function checkOutlierGate(innovation: number, innovationCovariance: number): OutlierGateResult {
  const sigma = Math.sqrt(Math.max(innovationCovariance, 1e-9));
  const sigmaMultiple = Math.abs(innovation) / sigma;
  return {
    flagged: sigmaMultiple > GATE_THRESHOLD_SIGMAS,
    sigmaMultiple,
  };
}

/**
 * §6's named failure-mode list, kept here (not just in a comment) so the UI badge shown
 * alongside a flagged day (EngineResponse.flags, per the app spec's §1.3 contract) can
 * point at *something* human-readable instead of a bare "flagged: true". This is
 * deliberately generic ("a large, recent weight change") rather than guessing *which*
 * named cause applies — the engine has no way to distinguish creatine-loading from a
 * cycling trip from menstrual water retention using weight data alone (§6's own list,
 * §12 items 1-3, 7).
 */
export const OUTLIER_FLAG = 'possible_transient_weight_shift';
