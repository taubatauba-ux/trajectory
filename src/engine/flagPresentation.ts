// EngineResponse.flags (§1.3) are stable machine identifiers, not UI copy — the spec
// says only "UI shows a small badge," leaving the actual wording to whoever builds that
// UI. This is that mapping, used by the Check-in flow's "targets changed" screen (§9.6).
// Placed in engine/ alongside the flag constants themselves so the two can't drift apart
// silently — this imports the real exported constants rather than re-typing their string
// values, everywhere one exists.
import { OUTLIER_FLAG } from './outlierGate';
import { CALORIE_FLOOR_FLAG, LOW_BMI_FLAG } from './targetLimiter';
import {
  PHARMA_ASSISTED_FLAG,
  PREGNANCY_EXCLUSION_UNCONFIRMED_FLAG,
  UNDER_MIN_AGE_FLAG,
} from './populationProfiles';

// These three are inline string literals in their source files (adaptiveTdeeEngine.ts,
// callEngine.ts, stubEngine.ts), not exported constants — there was nothing to import.
// If those literal strings ever change, this mapping needs a matching manual update.
const INSUFFICIENT_DATA_FLAG = 'insufficient_data';
const ENGINE_FALLBACK_TO_STUB_FLAG = 'engine_fallback_to_stub';
const STUB_ENGINE_FLAG = 'stub_engine';

export type FlagSeverity = 'info' | 'caution' | 'warning';

export interface FlagPresentation {
  label: string;
  severity: FlagSeverity;
}

const FLAG_LABELS: Record<string, FlagPresentation> = {
  [INSUFFICIENT_DATA_FLAG]: {
    label: "Still learning your patterns — targets get more precise over the next couple weeks.",
    severity: 'info',
  },
  [OUTLIER_FLAG]: {
    label: 'Your last weigh-in looked like a bigger jump than usual, so it\u2019s being treated cautiously.',
    severity: 'caution',
  },
  [CALORIE_FLOOR_FLAG]: {
    label: 'Your target was held at a safe minimum rather than following your goal rate exactly.',
    severity: 'caution',
  },
  [LOW_BMI_FLAG]: {
    label: 'At your current weight, an aggressive deficit isn\u2019t recommended.',
    severity: 'warning',
  },
  [UNDER_MIN_AGE_FLAG]: {
    label: 'This engine is calibrated for adults 18 and up.',
    severity: 'warning',
  },
  [PREGNANCY_EXCLUSION_UNCONFIRMED_FLAG]: {
    label: 'Targets assume you\u2019re not currently pregnant or breastfeeding \u2014 update your profile if that\u2019s changed.',
    severity: 'warning',
  },
  [PHARMA_ASSISTED_FLAG]: {
    label: 'Calculating with wider tolerances for appetite-affecting medication.',
    severity: 'info',
  },
  [STUB_ENGINE_FLAG]: {
    label: 'This target is a rough placeholder \u2014 the full calculation isn\u2019t wired in yet.',
    severity: 'info',
  },
  [ENGINE_FALLBACK_TO_STUB_FLAG]: {
    label: 'The calculation hit an unexpected error and fell back to a placeholder.',
    severity: 'caution',
  },
};

/** Unknown flags (future Engine versions, etc.) degrade gracefully to their raw
 * underscored string with an 'info' severity rather than disappearing silently. */
export function presentFlag(flag: string): FlagPresentation {
  return FLAG_LABELS[flag] ?? { label: flag.replace(/_/g, ' '), severity: 'info' };
}

export function presentFlags(flags: string[] | undefined): FlagPresentation[] {
  return (flags ?? []).map(presentFlag);
}

const SEVERITY_RANK: Record<FlagSeverity, number> = { info: 0, caution: 1, warning: 2 };

/** Highest severity among a flag list, for e.g. deciding a badge's color when collapsing
 * multiple flags into one summary indicator. Undefined for an empty/absent flag list. */
export function highestSeverity(flags: string[] | undefined): FlagSeverity | undefined {
  const list = presentFlags(flags);
  if (list.length === 0) return undefined;
  return list.reduce<FlagSeverity>(
    (worst, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst] ? f.severity : worst),
    'info',
  );
}
