import type { GoalType, Sex } from '../../types/profile';
import { MEASUREMENT_KEYS } from '../../engine/coldStartPrior';

export interface MeasurementRow {
  /** Stable local id for React keys / editing — not persisted. */
  id: string;
  /** The Record<string, number> key this becomes on submit, e.g. "leanBodyMassKg". */
  key: string;
  /** Display label shown in the UI — for the two suggested keys this is fixed; for
   * custom rows the user edits this directly and `key` is derived from it. */
  label: string;
  value: string;
  /** True for the two Engine-recognized suggested rows (PROGRESS_REPORT.md's documented
   * gap #2: Module A/B need lean body mass or body-fat %, but UserProfile.measurements
   * is an open Record) — their
   * `key` is locked to the exact MEASUREMENT_KEYS value and isn't user-editable. */
  suggested: boolean;
  unit?: string;
}

export interface OnboardingState {
  sex: Sex | null;
  dateOfBirth: string;
  heightCm: string;
  currentWeightKg: string;
  goalType: GoalType;
  targetWeightKg: string;
  activityNote: string;
  pregnancyOrBreastfeedingStatus: 'not_applicable' | 'pregnant' | 'breastfeeding' | undefined;
  measurements: MeasurementRow[];
}

export const initialOnboardingState: OnboardingState = {
  sex: null,
  dateOfBirth: '',
  heightCm: '',
  currentWeightKg: '',
  goalType: 'maintain',
  targetWeightKg: '',
  activityNote: '',
  pregnancyOrBreastfeedingStatus: undefined,
  measurements: [],
};

/** "Hip circumference" -> "hipCircumference", so free-typed measurement labels become
 * reasonably consistent Record keys instead of arbitrary strings with spaces/casing that
 * would look inconsistent next to the two fixed camelCase Engine keys. */
export function slugifyMeasurementKey(label: string): string {
  const words = label.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  return words[0] + words.slice(1).map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');
}

export function suggestedMeasurementDefs() {
  return [
    { key: MEASUREMENT_KEYS.leanBodyMassKg, label: 'Lean body mass', unit: 'kg' },
    { key: MEASUREMENT_KEYS.bodyFatPercent, label: 'Body fat', unit: '%' },
  ] as const;
}

function isValidDateOfBirth(iso: string): boolean {
  if (!iso) return false;
  const dob = new Date(iso);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  if (dob > now) return false;
  const age = (now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return age < 130; // sanity bound, not a policy — the Engine's own under-18 check (§9.2) is separate
}

function isPositiveNumber(s: string): boolean {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) && n > 0;
}

export function canProceedFromAboutYou(state: OnboardingState): boolean {
  return (
    state.sex !== null &&
    isValidDateOfBirth(state.dateOfBirth) &&
    isPositiveNumber(state.heightCm) &&
    isPositiveNumber(state.currentWeightKg)
  );
}

export function canProceedFromGoal(state: OnboardingState): boolean {
  // targetWeightKg is optional even for cut/bulk (Goal.targetWeightKg? in the data
  // model) — if entered, it just needs to be a sane positive number.
  return state.targetWeightKg.trim() === '' || isPositiveNumber(state.targetWeightKg);
}

// Body composition step has nothing to validate — it's entirely optional (§9.1: "empty
// extensible measurements block... rather than a fixed field list"), so the only
// constraint worth enforcing is that any row the user *did* start filling in is coherent
// enough to submit: a non-empty key and a valid positive number.
export function canProceedFromBodyComposition(state: OnboardingState): boolean {
  return state.measurements.every((m) => {
    if (m.value.trim() === '' && m.key.trim() === '') return true; // untouched row, ignored on submit
    return m.key.trim() !== '' && isPositiveNumber(m.value);
  });
}
