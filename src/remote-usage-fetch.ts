#!/usr/bin/env node

import { getOAuthToken } from './credentials.js';
import { normalizeLimits, storeRemoteLimits } from './remote-usage.js';

/**
 * Background refresher for the remote usage cache. Runs as a detached
 * child spawned by maybeRefreshRemoteUsage() — never on the render path.
 * Fetches the OAuth usage endpoint (the /usage screen's data source) and
 * writes the normalized `limits` array to the cross-process cache.
 * Everything is best-effort and silent: on any failure the statusline
 * simply keeps rendering from stdin rate_limits.
 */
async function main(): Promise<void> {
  const token = getOAuthToken();
  if (!token) return;

  const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'anthropic-beta': 'oauth-2025-04-20',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return;

  const body = await res.json() as { limits?: unknown };
  storeRemoteLimits(normalizeLimits(body?.limits));
}

main().catch(() => { /* silent — fallback rendering covers this */ });
