// build-tools/generate-android-project.mjs
//
// Drives @bubblewrap/core directly (the same library `bubblewrap init` uses under the hood)
// to generate the android/ TWA project WITHOUT needing an interactive terminal and WITHOUT
// needing the PWA to already be hosted live somewhere.
//
// Why this exists: `bubblewrap init` always prompts interactively (there's no --yes flag),
// and it fetches the web manifest + icon from a live URL. Neither is available in an
// unattended CI job or a sandboxed build environment. This script calls the same
// TwaManifest / TwaGenerator classes the CLI calls, but feeds them values directly instead
// of prompting, and serves the icon from localhost instead of a live domain.
//
// The generated project uses a placeholder host (see PLACEHOLDER_HOST below). The
// build-apk.yml GitHub Actions workflow replaces that placeholder with the real
// GitHub Pages URL at build time — see that workflow for the sed step. If you're running
// this script by hand instead of relying on CI, pass the real host as argv[2]:
//   node build-tools/generate-android-project.mjs myusername.github.io/trajectory
//
// Re-run this script (from the repo root: `npm run generate:android`) any time
// twa-manifest values need to change — package id, app name, colors, etc. It fully
// regenerates android/, so don't hand-edit files under android/ directly (same rule
// the spec's own repo structure section states).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TwaManifest, TwaGenerator, ConsoleLog, fetchUtils } from '@bubblewrap/core';

// The default 'fetch-h2' engine expects HTTP/2 and hangs against a plain HTTP/1.1
// localhost server. 'node-fetch' works fine for both localhost (this script) and real
// HTTPS hosts (real `bubblewrap init/build` runs), so switch to it unconditionally.
fetchUtils.setFetchEngine('node-fetch');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

export const PLACEHOLDER_HOST = 'placeholder-trajectory-pwa.example';

async function withLocalIconServer(iconPath, maskableIconPath, getManifestJson, fn) {
  const icon = await readFile(iconPath);
  const maskable = await readFile(maskableIconPath);
  const server = createServer((req, res) => {
    if (req.url === '/icon.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(icon);
    } else if (req.url === '/icon-maskable.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(maskable);
    } else if (req.url === '/manifest.webmanifest') {
      // TwaGenerator.writeWebManifest() fetches this live at the end of project
      // generation to bundle a copy into the Android app's assets. Serve it locally so
      // generation works before the real PWA is deployed anywhere.
      res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
      res.end(JSON.stringify(getManifestJson()));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

async function main() {
  const hostOverride = process.argv[2] || PLACEHOLDER_HOST;
  const webManifestUrl = new URL(`https://${hostOverride}/manifest.webmanifest`);

  let webManifestRef;
  await withLocalIconServer(
    path.join(REPO_ROOT, 'build-tools/icon-src/icon-1024.png'),
    path.join(REPO_ROOT, 'build-tools/icon-src/icon-maskable-1024.png'),
    () => webManifestRef,
    async (localOrigin) => {
      // A minimal Web App Manifest object — mirrors what vite-plugin-pwa will emit for
      // real once the app is built (see vite.config.ts). Kept in sync by hand for now;
      // if you change vite.config.ts's manifest block, mirror the change here too.
      const webManifest = {
        name: 'Trajectory',
        short_name: 'Trajectory',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#14171A',
        background_color: '#14171A',
        icons: [
          { src: `${localOrigin}/icon.png`, sizes: '1024x1024', type: 'image/png', purpose: 'any' },
          { src: `${localOrigin}/icon-maskable.png`, sizes: '1024x1024', type: 'image/png', purpose: 'maskable' },
        ],
      };
      webManifestRef = webManifest;

      const twaManifest = TwaManifest.fromWebManifestJson(webManifestUrl, webManifest);
      // host/packageId/startUrl/fullScopeUrl above are now correctly derived from the
      // placeholder host. Redirect ONLY the live end-of-generation manifest fetch to
      // localhost, since PLACEHOLDER_HOST doesn't resolve to anything real yet.
      twaManifest.webManifestUrl = new URL(`${localOrigin}/manifest.webmanifest`);

      // Fields confirmed against §12 of trajectory-app-technical-specification.md and
      // the design tokens in §10.
      twaManifest.packageId = 'app.trajectory.nutrition';
      twaManifest.launcherName = 'Trajectory';
      twaManifest.themeColor = twaManifest.themeColor; // #14171A, from manifest
      twaManifest.navigationColor = twaManifest.themeColor;
      twaManifest.backgroundColor = twaManifest.themeColor;
      twaManifest.display = 'standalone';
      twaManifest.orientation = 'portrait';
      twaManifest.signingKey = {
        // Relative to the android/ directory, since that's where `bubblewrap build` is
        // run from (both in CI and if you run it locally) — an absolute path here would
        // only work on the exact machine that generated it, which is the opposite of
        // what should be committed to a repo. Verified against the actual consumer
        // (Build.signApk() in @bubblewrap/cli's build.js) to confirm it's used as-is,
        // not re-resolved against some other base path.
        path: '../android-keystore/android.keystore',
        alias: 'trajectory',
      };
      twaManifest.appVersionName = '1.0.0';
      twaManifest.appVersionCode = 1;

      const targetDirectory = path.join(REPO_ROOT, 'android');
      const twaGenerator = new TwaGenerator();
      const log = new ConsoleLog('generate-android-project');

      const error = twaManifest.validate();
      if (error) {
        throw new Error(`Invalid TWA manifest: ${error}`);
      }

      await twaGenerator.createTwaProject(targetDirectory, twaManifest, log, () => {});

      const manifestFile = path.join(REPO_ROOT, 'twa-manifest.json');
      await twaManifest.saveToFile(manifestFile);

      // Cosmetic cleanup: saveToFile() captured the throwaway localhost URLs we swapped
      // webManifestUrl to. Rewrite them back to their real placeholder-host equivalents
      // so the committed file doesn't show a random local port number.
      const { readFile: readF, writeFile: writeF } = await import('node:fs/promises');
      let manifestText = await readF(manifestFile, 'utf-8');
      manifestText = manifestText
        .replaceAll(`http://127.0.0.1:${new URL(localOrigin).port}/icon.png`, `https://${hostOverride}/icon.png`)
        .replaceAll(`http://127.0.0.1:${new URL(localOrigin).port}/icon-maskable.png`, `https://${hostOverride}/icon-maskable.png`)
        .replaceAll(`http://127.0.0.1:${new URL(localOrigin).port}/manifest.webmanifest`, `https://${hostOverride}/manifest.webmanifest`);
      await writeF(manifestFile, manifestText);

      // Replicates generateManifestChecksumFile() from bubblewrap's own cmds/shared.js so
      // `bubblewrap build` (if used later) doesn't think the project needs re-init.
      const crypto = await import('node:crypto');
      const manifestContents = await readFile(manifestFile);
      const sum = crypto.createHash('sha1').update(manifestContents).digest('hex');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path.join(targetDirectory, 'manifest-checksum.txt'), sum);

      console.log(`Android TWA project generated at ${targetDirectory}`);
      console.log(`Placeholder host baked in: ${hostOverride}`);
      console.log('twa-manifest.json written to repo root.');
    },
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
