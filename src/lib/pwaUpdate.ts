/**
 * §9.12's "manual sync now trigger (mirrors the automatic fortnightly job in §6.2)".
 *
 * There is no client-side equivalent of actually re-running `sync_off_delta.py` — that
 * script needs network access to `static.openfoodfacts.org`/`huggingface.co` (blocked
 * from a phone's normal browsing context same as it's blocked from any sandbox, per
 * that script's own module docstring) and runs only via the scheduled GitHub Action.
 * What a phone with `registerType: 'autoUpdate'` (vite.config.ts) *can* do on demand is
 * force an immediate check for whatever build is currently deployed, rather than
 * waiting for the browser's own background check cycle — which is what actually
 * delivers fresher `off_seed.json`/`icmr_ifct2017.json` content, since the sync Action
 * commits new data and then explicitly triggers a rebuild (`off-sync.yml`'s "Trigger a
 * rebuild" step). This wraps the standard `ServiceWorkerRegistration.update()` call
 * that does that — deliberately not a bespoke fetch of just the data file, which would
 * need a separately-hosted endpoint and a hand-rolled version check the platform
 * already does for the whole app.
 */
export async function checkForAppUpdate(): Promise<
  { supported: true; checked: boolean } | { supported: false }
> {
  if (!navigator.serviceWorker) {
    return { supported: false };
  }
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) {
    return { supported: false };
  }
  try {
    await registration.update();
    return { supported: true, checked: true };
  } catch {
    // §11: nothing here should ever hard-fail offline. registration.update() rejects
    // when it can't reach the server to compare — exactly the offline case this needs
    // to degrade out of quietly rather than propagate as an unhandled rejection through
    // Settings' "Sync now" handler.
    return { supported: true, checked: false };
  }
}
