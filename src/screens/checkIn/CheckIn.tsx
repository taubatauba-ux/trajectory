import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { StepFlow } from '../../components/StepFlow';
import { db, getProfile } from '../../data/db';
import { newId } from '../../data/id';
import { upsertWeighInForDate } from '../../data/weighIns';
import { createCheckIn, getLatestCheckIn } from '../../data/checkIns';
import { buildEngineRequest } from '../../engine/buildEngineRequest';
import { callEngine } from '../../engine/callEngine';
import type { EngineResponse } from '../../engine/engine.types';
import type { CheckIn as CheckInRecord, UserProfile } from '../../types/profile';
import { addPhoto } from '../ProgressPhotos/photoStore';
import { WeighInStep } from './WeighInStep';
import { MeasurementsUpdateStep } from './MeasurementsUpdateStep';
import { PhotoStep } from './PhotoStep';
import { ComparisonStep, type ComparisonStatus } from './ComparisonStep';
import { canProceedFromMeasurements, canProceedFromWeighIn, type CheckInState } from './checkInState';

export interface CheckInProps {
  onDone?: (checkIn: CheckInRecord) => void;
  /** §9.6: surfaced as a non-blocking banner, never a forced modal — this is how a
   * screen presenting this component honors that outside the entry point itself: the
   * user can always back out mid-flow. */
  onClose?: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CheckIn({ onDone, onClose }: CheckInProps) {
  const profile = useLiveQuery(() => getProfile());
  const latestWeighIn = useLiveQuery(() => db.weighIns.orderBy('date').last());
  const latestCheckIn = useLiveQuery(() => getLatestCheckIn());

  const [stepPos, setStepPos] = useState(0);
  const [state, setState] = useState<CheckInState>({ weightKg: '', measurementUpdates: {}, photoBlob: null });
  const [status, setStatus] = useState<ComparisonStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [newResponse, setNewResponse] = useState<EngineResponse | undefined>();
  const [resultCheckIn, setResultCheckIn] = useState<CheckInRecord | undefined>();

  // Pre-fill from the last known weigh-in once it loads, but only if the user hasn't
  // already typed something — see checkInState.ts for why this is simpler than the
  // measurements step's placeholder-only approach.
  useEffect(() => {
    if (latestWeighIn && state.weightKg === '') {
      setState((s) => (s.weightKg === '' ? { ...s, weightKg: String(latestWeighIn.weightKg) } : s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestWeighIn]);

  if (profile === undefined || latestCheckIn === undefined) {
    return (
      <div className="flex h-full min-h-[100dvh] items-center justify-center bg-bg">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  const measurementKeys = Object.keys(profile.measurements);
  const hasMeasurements = measurementKeys.length > 0;
  const steps = hasMeasurements
    ? (['weighIn', 'measurements', 'photo', 'review'] as const)
    : (['weighIn', 'photo', 'review'] as const);
  const stepCount = steps.length;
  const currentStep = steps[stepPos]!;

  const stepTitle: Record<(typeof steps)[number], string> = {
    weighIn: "Today's weigh-in",
    measurements: 'Measurements',
    photo: 'Progress photo',
    review: 'Update targets',
  };

  function goBack() {
    setStepPos((i) => Math.max(0, i - 1));
  }
  function goNext() {
    setStepPos((i) => Math.min(stepCount - 1, i + 1));
  }

  const canProceed =
    currentStep === 'weighIn'
      ? canProceedFromWeighIn(state)
      : currentStep === 'measurements'
        ? canProceedFromMeasurements(state)
        : true;

  async function handleSubmit() {
    if (!profile) return;
    setStatus('submitting');
    setErrorMessage(undefined);
    try {
      const today = todayISO();

      const updatedMeasurements = { ...profile.measurements };
      for (const [key, value] of Object.entries(state.measurementUpdates)) {
        if (value.trim() !== '') updatedMeasurements[key] = Number(value);
      }
      const measurementsChanged = measurementKeys.some(
        (k) => updatedMeasurements[k] !== profile.measurements[k],
      );
      const effectiveProfile: UserProfile = measurementsChanged
        ? { ...profile, measurements: updatedMeasurements, updatedAt: new Date().toISOString() }
        : profile;
      if (measurementsChanged) {
        await db.profile.put(effectiveProfile);
      }

      const weighIn = await upsertWeighInForDate(today, Number(state.weightKg));

      const checkInId = newId();
      let progressPhotoIds: string[] | undefined;
      if (state.photoBlob) {
        const photoId = await addPhoto(today, state.photoBlob, undefined, checkInId);
        progressPhotoIds = [photoId];
      }

      const allWeighIns = await db.weighIns.toArray();
      const allLogEntries = await db.logEntries.toArray();
      const request = buildEngineRequest(effectiveProfile, allWeighIns, allLogEntries);
      const response = await callEngine(request);

      const checkIn = await createCheckIn({
        id: checkInId,
        date: today,
        measurements: updatedMeasurements,
        ...(progressPhotoIds ? { progressPhotoIds } : {}),
        engineRequestSnapshot: request,
        engineResponseSnapshot: response,
      });

      void weighIn; // included in history via allWeighIns; kept for clarity at the call site
      setNewResponse(response);
      setResultCheckIn(checkIn);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Something unexpected went wrong.');
    }
  }

  const isReviewStep = currentStep === 'review';
  const isBusy = status === 'submitting' || status === 'success';

  return (
    <StepFlow
      title={stepTitle[currentStep]}
      stepIndex={stepPos}
      stepCount={stepCount}
      onClose={!isBusy ? onClose : undefined}
      onBack={stepPos > 0 && !isReviewStep ? goBack : undefined}
      onNext={!isReviewStep ? goNext : undefined}
      nextDisabled={!canProceed}
    >
      {currentStep === 'weighIn' && (
        <WeighInStep state={state} onChange={(p) => setState((s) => ({ ...s, ...p }))} lastWeighInDate={latestWeighIn?.date} />
      )}
      {currentStep === 'measurements' && (
        <MeasurementsUpdateStep
          state={state}
          onChange={(p) => setState((s) => ({ ...s, ...p }))}
          currentValues={profile.measurements}
        />
      )}
      {currentStep === 'photo' && (
        <PhotoStep photoBlob={state.photoBlob} onChange={(photoBlob) => setState((s) => ({ ...s, photoBlob }))} />
      )}
      {currentStep === 'review' && (
        <ComparisonStep
          status={status}
          previousTargets={latestCheckIn?.engineResponseSnapshot.targets}
          newResponse={newResponse}
          errorMessage={errorMessage}
          onSubmit={handleSubmit}
          onDone={() => resultCheckIn && onDone?.(resultCheckIn)}
        />
      )}
    </StepFlow>
  );
}
