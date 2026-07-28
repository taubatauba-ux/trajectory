import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Navigate } from 'react-router-dom';
import { getProfile, getSyncMeta, updateProfile } from '../../data/db';
import type { UserProfile } from '../../types/profile';
import { ProfileEditSection } from './ProfileEditSection';
import { DataSection } from './DataSection';
import { profileToSettingsState, settingsStateToProfilePatch, isSettingsFormValid, type SettingsFormState } from './settingsState';

// Same LOADING-sentinel pattern as DashboardScreen.tsx, and for the same reason: a
// legitimately-still-resolving Dexie read and a confirmed "no profile yet" both start
// as falsy, but only the second one should ever redirect anywhere.
const LOADING = 'loading' as const;

type SaveStatus = { status: 'idle' } | { status: 'saving' } | { status: 'saved' } | { status: 'error'; message: string };

/** §9.12 Settings. Profile edit (all of §4.1, plus the two Part 6 additions),
 * metric/imperial toggle, data export, manual sync, dataset version display — see
 * ProfileEditSection.tsx and DataSection.tsx for those two halves; this file owns
 * loading the profile, holding the in-progress edit as local state until Save is
 * pressed, and persisting it via data/db.ts's updateProfile. */
export default function SettingsScreen() {
  const profile = useLiveQuery(() => getProfile(), [], LOADING);
  const syncMeta = useLiveQuery(() => getSyncMeta());

  const [formState, setFormState] = useState<SettingsFormState | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ status: 'idle' });

  if (profile === LOADING) {
    return null;
  }
  if (!profile) {
    return <Navigate to="/onboarding" replace />;
  }
  // Captured here, after narrowing, specifically so handleSave below (a closure
  // defined later in this same function) can use it: TS's control-flow narrowing from
  // the two checks above doesn't persist into a nested function body (it can't
  // statically prove handleSave is only ever called after this point, even though it
  // obviously is) — it would otherwise re-widen back to UserProfile | typeof LOADING
  // inside the closure, which a bare `!` assertion doesn't fix (LOADING isn't
  // null/undefined). A plain const with an explicit narrowed type sidesteps that.
  const loadedProfile: UserProfile = profile;

  // Local edit state is seeded from the loaded profile once, the first time it's
  // available — not re-derived on every profile change, or an in-progress edit would
  // get silently clobbered by this screen's own save triggering a Dexie live-query
  // update partway through. Simplest correct way to express "once, from this value" in
  // a function component without an effect: derive lazily on first render, from here.
  const state = formState ?? profileToSettingsState(loadedProfile);
  function onChange(patch: Partial<SettingsFormState>) {
    setFormState({ ...state, ...patch });
    if (saveStatus.status !== 'idle') setSaveStatus({ status: 'idle' });
  }

  const dirty = formState !== null;
  const valid = isSettingsFormValid(state);

  async function handleSave() {
    if (!valid) return;
    setSaveStatus({ status: 'saving' });
    try {
      await updateProfile(loadedProfile, settingsStateToProfilePatch(state));
      setFormState(null); // next render re-seeds from the now-updated profile
      setSaveStatus({ status: 'saved' });
    } catch (err) {
      setSaveStatus({
        status: 'error',
        message: err instanceof Error ? err.message : 'Could not save — please try again.',
      });
    }
  }

  return (
    <div className="flex flex-col gap-8 px-4 pb-28 pt-6">
      <h1 className="text-lg text-ink">Settings</h1>

      <ProfileEditSection state={state} onChange={onChange} />

      {dirty && (
        <div className="sticky bottom-20 flex items-center gap-3 border-t border-hairline bg-surface-raised px-4 py-3">
          <div className="min-w-0 flex-1">
            {!valid && <p className="text-xs text-accent-warn">Check the highlighted fields above.</p>}
            {saveStatus.status === 'error' && <p className="text-xs text-accent-warn">{saveStatus.message}</p>}
            {saveStatus.status === 'saved' && <p className="text-xs text-accent">Saved.</p>}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!valid || saveStatus.status === 'saving'}
            className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg disabled:opacity-40"
          >
            {saveStatus.status === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}

      <div className="border-t border-hairline pt-6">
        <DataSection syncMeta={syncMeta} />
      </div>
    </div>
  );
}
