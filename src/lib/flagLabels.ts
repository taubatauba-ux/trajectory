// EngineResponse.flags (engine.types.ts) is `string[]` — the Engine's own contract
// deliberately keeps it stringly-typed on the wire, so the UI is the layer responsible
// for turning known flag strings into something a person should actually read. This is
// the complete set of flags the shipped engine can currently emit — cross-checked
// against every `flags.push(...)` / literal flags array in src/engine/*.ts, not
// reconstructed from memory of the spec prose. An unrecognized flag (a future flag this
// file hasn't been updated for) still renders — humanized, not silently dropped.

export type FlagTone = 'info' | 'caution' | 'dev';

export interface FlagInfo {
  key: string;
  label: string;
  tone: FlagTone;
}

const FLAG_COPY: Record<string, { label: string; tone: FlagTone }> = {
  insufficient_data: {
    label: 'Still calibrating — targets will sharpen as more days come in',
    tone: 'info',
  },
  possible_transient_weight_shift: {
    label: 'A recent weigh-in looks like a one-off shift, so it\u2019s being weighted cautiously',
    tone: 'info',
  },
  calorie_floor_applied: {
    label: 'Target held at a safe minimum rather than following the trend further down',
    tone: 'caution',
  },
  low_bmi_deficit_caution: {
    label: 'Deficit size is being limited — BMI is already in a range where cutting further needs care',
    tone: 'caution',
  },
  pharmacologically_assisted_profile_active: {
    label: 'Using calibration for GLP-1/similar-assisted profiles',
    tone: 'info',
  },
  under_minimum_age_exclusion: {
    label: 'Some population-level assumptions were excluded because of age',
    tone: 'info',
  },
  pregnancy_breastfeeding_status_unconfirmed: {
    label: 'Pregnancy/breastfeeding status needs confirming — targets stay conservative until then',
    tone: 'caution',
  },
  stub_engine: {
    label: 'Running on simplified placeholder math, not the full model',
    tone: 'dev',
  },
  engine_fallback_to_stub: {
    label: 'Switched to simplified math after a calculation error',
    tone: 'dev',
  },
};

function humanize(flag: string): string {
  const spaced = flag.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function describeFlag(flag: string): FlagInfo {
  const known = FLAG_COPY[flag];
  return known ? { key: flag, ...known } : { key: flag, label: humanize(flag), tone: 'info' };
}

/** Maps every flag to display info, with one collapsing rule: callEngine's fallback path
 * (callEngine.ts) always emits stub_engine + engine_fallback_to_stub together, and
 * showing both is redundant — "fallback" already implies "running the stub". */
export function describeFlags(flags: string[]): FlagInfo[] {
  const hasBoth = flags.includes('stub_engine') && flags.includes('engine_fallback_to_stub');
  const source = hasBoth ? flags.filter((f) => f !== 'stub_engine') : flags;
  return source.map(describeFlag);
}
