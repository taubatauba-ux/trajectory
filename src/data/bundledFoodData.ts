import { db, getSyncMeta, setSyncMeta } from './db';
import type { ICMRFoodItem, OFFFoodItem } from '../types/food';

// Vite glob-imports rather than a literal `import icmrData from './icmr/icmr_ifct2017.json'`
// — a static import of a file that doesn't exist is a build error, and neither pipeline
// output exists in this repo yet (scripts/extract_icmr.py / import_off_bulk.py haven't
// been run — see both data pipeline READMEs under src/data/icmr, src/data/off). Glob
// import resolves to an empty object today, compiles cleanly either way, and picks the
// real files up automatically — no code change needed — the day either pipeline
// actually produces them.
const icmrModules = import.meta.glob<{ default: ICMRFoodItem[] }>('./icmr/icmr_ifct2017.json', {
  eager: true,
});
const icmrMetaModules = import.meta.glob<{ default: { extractionDate: string } }>(
  './icmr/icmr.meta.json',
  { eager: true },
);
const offModules = import.meta.glob<{ default: OFFFoodItem[] }>('./off/off_seed.json', {
  eager: true,
});
const offMetaModules = import.meta.glob<
  { default: { lastDeltaAppliedDate?: string | null; lastFullReimportDate?: string | null } }
>('./off/sync-meta.json', { eager: true });

function firstModuleDefault<T>(modules: Record<string, { default: T }>): T | undefined {
  const key = Object.keys(modules)[0];
  if (!key) return undefined;
  return modules[key]?.default;
}

export interface BundledFoodDataResult {
  icmrLoaded: boolean;
  offLoaded: boolean;
  icmrCount: number;
  offCount: number;
}

const EMPTY_RESULT: BundledFoodDataResult = { icmrLoaded: false, offLoaded: false, icmrCount: 0, offCount: 0 };

interface BundledInputs {
  icmrItems: ICMRFoodItem[] | undefined;
  icmrMeta: { extractionDate: string } | undefined;
  offItems: OFFFoodItem[] | undefined;
  offMeta: { lastDeltaAppliedDate?: string | null; lastFullReimportDate?: string | null } | undefined;
}

/**
 * §6.2: "The installed app never downloads or reprocesses this data itself — it just
 * fetches the small, already-filtered, already-current file on next launch if its
 * bundled version is older than the published one." In this codebase, "fetches on next
 * launch" is the PWA's own `autoUpdate` service worker (vite.config.ts) picking up a
 * new deployed build — the OFF-sync GitHub Action (§6.2, `off-sync.yml`) commits fresh
 * data and then explicitly triggers a rebuild (see that workflow's own header comment
 * on why), so a newer bundle *contains* newer `icmr_ifct2017.json`/`off_seed.json` as a
 * side effect of a normal redeploy — not a bespoke separate runtime fetch of just the
 * data file. This function is the other half: whatever's actually in *this* running
 * bundle, get it from the static JSON into Dexie if it's newer than what's already
 * there.
 *
 * Split from `loadBundledFoodDataIfNeeded` below (which supplies `inputs` from
 * `import.meta.glob`) as an injectable-for-testing seam, the same shape as
 * `scripts/sync_off_delta.py`'s `delta_records_fetcher`/`bulk_importer` params — real
 * fixture files would otherwise have to exist at the exact glob-matched path (which
 * would mean committing fake data into `src/data/icmr|off/`) just to test this.
 */
export async function syncBundledFoodData(inputs: BundledInputs): Promise<BundledFoodDataResult> {
  const { icmrItems, icmrMeta, offItems, offMeta } = inputs;
  if (!icmrItems?.length && !offItems?.length) return EMPTY_RESULT;

  const current = await getSyncMeta();
  const result: BundledFoodDataResult = { ...EMPTY_RESULT };

  if (icmrItems?.length && icmrMeta?.extractionDate) {
    if (!current || current.icmrDatasetVersion !== icmrMeta.extractionDate) {
      await db.foodItems.bulkPut(icmrItems);
      result.icmrLoaded = true;
      result.icmrCount = icmrItems.length;
    }
  }

  // sync_off_delta.py's actual sync-meta.json (scripts/off_common.py's
  // read_sync_meta/write_sync_meta) writes lastDeltaAppliedDate/lastFullReimportDate,
  // not a literal offDatasetVersion field — SyncMeta.offDatasetVersion's own spec
  // comment ("timestamp of last successful OFF sync") is exactly what the more recent
  // of those two dates already means, so it's derived here rather than requiring a
  // Python-side change for a field that would just duplicate an existing one.
  const derivedOffVersion = [offMeta?.lastDeltaAppliedDate, offMeta?.lastFullReimportDate]
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);

  if (offItems?.length && derivedOffVersion) {
    if (!current || current.offDatasetVersion !== derivedOffVersion) {
      await db.foodItems.bulkPut(offItems);
      result.offLoaded = true;
      result.offCount = offItems.length;
    }
  }

  if (result.icmrLoaded || result.offLoaded) {
    await setSyncMeta({
      icmrDatasetVersion: icmrMeta?.extractionDate ?? current?.icmrDatasetVersion ?? '',
      offDatasetVersion: derivedOffVersion ?? current?.offDatasetVersion ?? '',
      lastDeltaAppliedDate: offMeta?.lastDeltaAppliedDate ?? current?.lastDeltaAppliedDate ?? '',
    });
  }

  return result;
}

/** Thin wrapper supplying the real bundle contents (or lack thereof) via Vite's glob
 * import — see `syncBundledFoodData` above for the actual logic and why it's split out. */
export async function loadBundledFoodDataIfNeeded(): Promise<BundledFoodDataResult> {
  return syncBundledFoodData({
    icmrItems: firstModuleDefault(icmrModules),
    icmrMeta: firstModuleDefault(icmrMetaModules),
    offItems: firstModuleDefault(offModules),
    offMeta: firstModuleDefault(offMetaModules),
  });
}
