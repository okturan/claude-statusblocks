import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { isValidVersion, isNewerVersion } from './version.js';

/**
 * Daily update check — runs ONLY as the detached background child spawned by
 * maybeAutoUpdate(), never on the render path. Resolves the latest published
 * version from the registry and runs the update pinned to that exact version:
 * `npx pkg@latest` can serve a stale cached resolution of `latest`, which
 * once downgraded a newer local install (the incoming package's `update`
 * command copies whatever dist it ships). Pinning skips that cache, and the
 * explicit is-newer comparison means an old package is never even fetched.
 */

const REGISTRY_URL = 'https://registry.npmjs.org/claude-statusblocks/latest';

async function main(): Promise<void> {
  // The install stamp written by `installFiles()` next to this script.
  // Missing stamp (pre-0.6.4 install) → can't compare, so let the update run;
  // its own downgrade guard still protects the destination.
  let installed = '';
  try {
    installed = readFileSync(new URL('./.version', import.meta.url), 'utf8').trim();
  } catch { /* unstamped install */ }

  let latest = '';
  try {
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return;
    const body = (await res.json()) as { version?: unknown };
    if (typeof body.version === 'string') latest = body.version.trim();
  } catch { return; /* offline/registry down — try again tomorrow */ }

  // `latest` is interpolated into a shell command — never run an unvalidated
  // registry response.
  if (!isValidVersion(latest)) return;
  if (isValidVersion(installed) && !isNewerVersion(latest, installed)) return;

  execSync(`npx -y claude-statusblocks@${latest} update`, {
    stdio: 'ignore',
    windowsHide: true,
    timeout: 300000,
  });
}

main().catch(() => { /* auto-update is best-effort */ });
