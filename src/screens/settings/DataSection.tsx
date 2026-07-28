import { useState } from 'react';
import type { SyncMeta } from '../../types';
import { exportAllDataAsJson, downloadJson } from '../../data/dataExport';
import { loadBundledFoodDataIfNeeded } from '../../data/bundledFoodData';
import { checkForAppUpdate } from '../../lib/pwaUpdate';
import { todayISO, formatDatasetDate } from '../../lib/dateUtils';

export interface DataSectionProps {
  syncMeta: SyncMeta | undefined;
}

type SyncState = { status: 'idle' } | { status: 'checking' } | { status: 'done'; message: string };
type ExportState = { status: 'idle' } | { status: 'exporting' } | { status: 'error'; message: string };

/** §9.12: data export (full JSON dump, §13's data-portability requirement), manual
 * "sync now" (mirrors §6.2's automatic fortnightly job), and dataset version display
 * (from SyncMeta, §4.5). See bundledFoodData.ts and pwaUpdate.ts for why "sync now"
 * checks for an app update rather than re-running the Python sync script directly —
 * that script needs network access this device doesn't have and only ever runs on a
 * schedule via GitHub Actions. */
export function DataSection({ syncMeta }: DataSectionProps) {
  const [syncState, setSyncState] = useState<SyncState>({ status: 'idle' });
  const [exportState, setExportState] = useState<ExportState>({ status: 'idle' });

  async function handleSyncNow() {
    setSyncState({ status: 'checking' });
    const updateResult = await checkForAppUpdate();
    const loadResult = await loadBundledFoodDataIfNeeded();

    if (loadResult.icmrLoaded || loadResult.offLoaded) {
      const parts: string[] = [];
      if (loadResult.icmrLoaded) parts.push(`${loadResult.icmrCount} ICMR foods`);
      if (loadResult.offLoaded) parts.push(`${loadResult.offCount} OFF foods`);
      setSyncState({ status: 'done', message: `Loaded new data: ${parts.join(', ')}.` });
    } else if (updateResult.supported && updateResult.checked) {
      setSyncState({
        status: 'done',
        message: 'Checked for updates — already current, or a new version will apply shortly.',
      });
    } else {
      setSyncState({ status: 'done', message: 'Already up to date.' });
    }
  }

  async function handleExport() {
    setExportState({ status: 'exporting' });
    try {
      const json = await exportAllDataAsJson();
      downloadJson(`trajectory-export-${todayISO()}.json`, json);
      setExportState({ status: 'idle' });
    } catch (err) {
      setExportState({
        status: 'error',
        message: err instanceof Error ? err.message : 'Export failed — please try again.',
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-ink">Data</h2>

        <button
          type="button"
          onClick={handleExport}
          disabled={exportState.status === 'exporting'}
          className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-left text-sm text-ink disabled:opacity-60"
        >
          {exportState.status === 'exporting' ? 'Preparing export…' : 'Export all data (JSON)'}
          <p className="mt-0.5 text-xs font-normal text-ink-muted">
            Every profile, log, check-in, and photo — nothing is ever locked in.
          </p>
        </button>
        {exportState.status === 'error' && (
          <p className="text-xs text-accent-warn">{exportState.message}</p>
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-hairline pt-6">
        <h2 className="text-sm font-medium text-ink">Nutrition data</h2>

        <div className="hairline-divide rounded-xl border border-hairline bg-surface px-3">
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-ink-muted">ICMR/IFCT dataset</span>
            <span className="tabular text-sm text-ink">
              {syncMeta?.icmrDatasetVersion ? formatDatasetDate(syncMeta.icmrDatasetVersion) : 'Not loaded'}
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-ink-muted">Open Food Facts dataset</span>
            <span className="tabular text-sm text-ink">
              {syncMeta?.offDatasetVersion ? formatDatasetDate(syncMeta.offDatasetVersion) : 'Not loaded'}
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-sm text-ink-muted">Last delta sync</span>
            <span className="tabular text-sm text-ink">
              {syncMeta?.lastDeltaAppliedDate ? formatDatasetDate(syncMeta.lastDeltaAppliedDate) : 'Never'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSyncNow}
          disabled={syncState.status === 'checking'}
          className="w-full rounded-xl border border-accent bg-accent/10 px-4 py-3 text-sm font-medium text-accent disabled:opacity-60"
        >
          {syncState.status === 'checking' ? 'Checking…' : 'Sync now'}
        </button>
        {syncState.status === 'done' && <p className="text-xs text-ink-muted">{syncState.message}</p>}
      </section>
    </div>
  );
}
