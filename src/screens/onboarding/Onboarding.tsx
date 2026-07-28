import { useState } from 'react';
import { StepFlow } from '../../components/StepFlow';
import { db } from '../../data/db';
import { newId } from '../../data/id';
import { createCheckIn } from '../../data/checkIns';
import { upsertWeighInForDate } from '../../data/weighIns';
import { callEngine } from '../../engine/callEngine';
import type { EngineRequest, EngineResponse } from '../../engine/engine.types';
import type { CheckIn, UserProfile, WeighIn } from '../../types/profile';
import { AboutYouStep } from './AboutYouStep';
import { GoalStep } from './GoalStep';
import { BodyCompositionStep } from './BodyCompositionStep';
import { ReviewStep, type ReviewStatus } from './ReviewStep';
import {
  canProceedFromAboutYou,
  canProceedFromBodyComposition,
  canProceedFromGoal,
  initialOnboardingState,
  type OnboardingState,
} from './onboardingState';

export interface OnboardingResult {
  profile: UserProfile;
  weighIn: WeighIn;
  checkIn: CheckIn;
}

export interface OnboardingProps {
  /** Called once the user taps through from the success screen. Onboarding does not
   * navigate itself — the parent (Part 3's router, once it exists) decides what "the
   * Dashboard" means. */
  onComplete: (result: OnboardingResult) => void;
}

const STEP_COUNT = 4;
const STEP_TITLES = ['About you', 'Your goal', 'Body composition', 'Review'];

export function Onboarding({ onComplete }: OnboardingProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [state, setState] = useState<OnboardingState>(initialOnboardingState);
  const [status, setStatus] = useState<ReviewStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [engineResponse, setEngineResponse] = useState<EngineResponse | undefined>();
  const [result, setResult] = useState<OnboardingResult | undefined>();

  function patchState(patch: Partial<OnboardingState>) {
    setState((prev) => ({ ...prev, ...patch }));
  }

  function goBack() {
    setStepIndex((i) => Math.max(0, i - 1));
  }

  function goNext() {
    setStepIndex((i) => Math.min(STEP_COUNT - 1, i + 1));
  }

  async function handleSubmit() {
    setStatus('submitting');
    setErrorMessage(undefined);
    try {
      const now = new Date().toISOString();
      const today = now.slice(0, 10);

      const measurements: Record<string, number> = {};
      for (const m of state.measurements) {
        if (m.key.trim() !== '' && m.value.trim() !== '') {
          measurements[m.key] = Number(m.value);
        }
      }

      const profile: UserProfile = {
        id: newId(),
        sex: state.sex!,
        dateOfBirth: state.dateOfBirth,
        heightCm: Number(state.heightCm),
        goal: {
          type: state.goalType,
          ...(state.targetWeightKg.trim() !== '' ? { targetWeightKg: Number(state.targetWeightKg) } : {}),
        },
        measurements,
        ...(state.activityNote.trim() !== '' ? { activityNote: state.activityNote } : {}),
        ...(state.pregnancyOrBreastfeedingStatus
          ? { pregnancyOrBreastfeedingStatus: state.pregnancyOrBreastfeedingStatus }
          : {}),
        createdAt: now,
        updatedAt: now,
      };

      // Profile + weigh-in are saved before the Engine call, not after — the Engine
      // itself doesn't require this (it takes both as plain arguments), but a saved
      // weigh-in the app can show even if the Engine call somehow fails partway is
      // strictly better than losing the user's entered data over an Engine-side hiccup.
      await db.profile.put(profile);
      const weighIn = await upsertWeighInForDate(today, Number(state.currentWeightKg));

      const request: EngineRequest = {
        profile,
        history: { weighIns: [weighIn], dailyLogs: [] },
      };
      const response = await callEngine(request);

      const checkIn = await createCheckIn({
        date: today,
        engineRequestSnapshot: request,
        engineResponseSnapshot: response,
      });

      setEngineResponse(response);
      setResult({ profile, weighIn, checkIn });
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Something unexpected went wrong.');
    }
  }

  const canProceed = [
    canProceedFromAboutYou(state),
    canProceedFromGoal(state),
    canProceedFromBodyComposition(state),
    true, // review step's "next" is the submit button rendered inside ReviewStep itself
  ][stepIndex];

  return (
    <StepFlow
      title={STEP_TITLES[stepIndex]!}
      stepIndex={stepIndex}
      stepCount={STEP_COUNT}
      onBack={stepIndex > 0 && status !== 'submitting' && status !== 'success' ? goBack : undefined}
      onNext={stepIndex < STEP_COUNT - 1 ? goNext : undefined}
      nextDisabled={!canProceed}
    >
      {stepIndex === 0 && <AboutYouStep state={state} onChange={patchState} />}
      {stepIndex === 1 && <GoalStep state={state} onChange={patchState} />}
      {stepIndex === 2 && <BodyCompositionStep state={state} onChange={patchState} />}
      {stepIndex === 3 && (
        <ReviewStep
          state={state}
          status={status}
          engineResponse={engineResponse}
          errorMessage={errorMessage}
          onSubmit={handleSubmit}
          onContinue={() => result && onComplete(result)}
        />
      )}
    </StepFlow>
  );
}
