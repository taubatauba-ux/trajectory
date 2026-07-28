import type { GoalType, Sex, UserProfile } from '../../types/profile';
import {
  slugifyMeasurementKey,
  suggestedMeasurementDefs,
  type MeasurementRow,
} from '../onboarding/onboardingState';

export { slugifyMeasurementKey, suggestedMeasurementDefs };
export type { MeasurementRow };

export interface SettingsFormState {
  sex: Sex;
  dateOfBirth: string;
  heightCm: string;
  goalType: GoalType;
  targetWeightKg: string;
  activityNote: string;
  pregnancyOrBreastfeedingStatus: 'not_applicable' | 'pregnant' | 'breastfeeding' | undefined;
  pharmacologicallyAssisted: boolean;
  unitPreference: 'metric' | 'imperial';
  measurements: MeasurementRow[];
}

/** Reconstructs editable form state from a stored profile — the inverse of
 * `settingsStateToProfilePatch` below. Every `UserProfile.measurements` entry becomes a
 * row; suggested (Engine-recognized) keys are marked `suggested: true` so they render
 * with a locked label exactly like onboarding's BodyCompositionStep does, and any other
 * key the user (or a future feature) added becomes an editable custom row rather than
 * being silently dropped — this is meant to be a lossless round trip. */
export function profileToSettingsState(profile: UserProfile): SettingsFormState {
  const suggestedKeys = new Map(suggestedMeasurementDefs().map((d) => [d.key as string, d]));
  let rowCounter = 0;
  const measurements: MeasurementRow[] = Object.entries(profile.measurements).map(([key, value]) => {
    const def = suggestedKeys.get(key);
    rowCounter += 1;
    return {
      id: `existing-${rowCounter}`,
      key,
      label: def?.label ?? key,
      value: String(value),
      suggested: Boolean(def),
      unit: def?.unit,
    };
  });

  return {
    sex: profile.sex,
    dateOfBirth: profile.dateOfBirth,
    heightCm: String(profile.heightCm),
    goalType: profile.goal.type,
    targetWeightKg: profile.goal.targetWeightKg !== undefined ? String(profile.goal.targetWeightKg) : '',
    activityNote: profile.activityNote ?? '',
    pregnancyOrBreastfeedingStatus: profile.pregnancyOrBreastfeedingStatus,
    pharmacologicallyAssisted: profile.pharmacologicallyAssisted ?? false,
    unitPreference: profile.unitPreference ?? 'metric',
    measurements,
  };
}

function isPositiveNumber(s: string): boolean {
  const n = Number(s);
  return s.trim() !== '' && Number.isFinite(n) && n > 0;
}

function isValidDateOfBirth(iso: string): boolean {
  if (!iso) return false;
  const dob = new Date(iso);
  if (Number.isNaN(dob.getTime())) return false;
  const now = new Date();
  if (dob > now) return false;
  const age = (now.getTime() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return age < 130;
}

/** Same shape of check as onboarding's canProceedFromAboutYou/Goal/BodyComposition
 * combined into one, since Settings isn't a step wizard — everything is visible and
 * editable at once, so there's one "is the whole form save-able" question rather than
 * three per-step ones. */
export function isSettingsFormValid(state: SettingsFormState): boolean {
  const aboutYouValid = isValidDateOfBirth(state.dateOfBirth) && isPositiveNumber(state.heightCm);
  const goalValid = state.targetWeightKg.trim() === '' || isPositiveNumber(state.targetWeightKg);
  const measurementsValid = state.measurements.every((m) => {
    if (m.value.trim() === '' && m.key.trim() === '') return true;
    return m.key.trim() !== '' && isPositiveNumber(m.value);
  });
  return aboutYouValid && goalValid && measurementsValid;
}

/** Inverse of `profileToSettingsState` — only the fields this form actually edits
 * (id/createdAt/updatedAt are the caller's responsibility, same division of labor as
 * onboarding's own submit handler). Assumes `isSettingsFormValid(state)` was already
 * checked; does not re-validate. */
export function settingsStateToProfilePatch(
  state: SettingsFormState,
): Omit<UserProfile, 'id' | 'createdAt' | 'updatedAt'> {
  const measurements: Record<string, number> = {};
  for (const row of state.measurements) {
    if (row.key.trim() === '' || row.value.trim() === '') continue;
    measurements[row.key] = Number(row.value);
  }

  return {
    sex: state.sex,
    dateOfBirth: state.dateOfBirth,
    heightCm: Number(state.heightCm),
    goal: {
      type: state.goalType,
      ...(state.targetWeightKg.trim() !== '' ? { targetWeightKg: Number(state.targetWeightKg) } : {}),
    },
    measurements,
    ...(state.activityNote.trim() !== '' ? { activityNote: state.activityNote } : {}),
    pregnancyOrBreastfeedingStatus: state.pregnancyOrBreastfeedingStatus,
    pharmacologicallyAssisted: state.pharmacologicallyAssisted,
    unitPreference: state.unitPreference,
  };
}
