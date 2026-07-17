import { fileURLToPath } from 'url';
import { readCacheEntry, writeCache, acquireMarker } from './cache.js';
import { spawnDetached } from './spawn.js';

/**
 * Remote usage limits — the same data the claude.ai Usage page and Claude
 * Code's /usage screen show, fetched from the (undocumented) OAuth usage
 * endpoint. Unlike the stdin `rate_limits` field, this includes
 * model-scoped weekly limits (e.g. a separate Fable bucket), served as a
 * generic `limits` array so new scoped models appear without code changes.
 *
 * The render path never touches the network: renders read a short-TTL
 * file cache, and a detached background child (remote-usage-fetch.js)
 * refreshes it at most once per REFRESH_INTERVAL.
 */

export interface RemoteLimit {
  /** Display text (sanitized, may be truncated) */
  label: string;
  percent: number;
  /** Unix epoch seconds; 0 when unknown */
  resetsAt: number;
  /** Present on scoped limits; generic buckets (5h/7d) have no scope */
  scope?: 'model' | 'surface';
  /** Model-scope match key: full untruncated scope name, lowercased */
  match?: string;
  /** Model-scope id from the server, when it populates one */
  id?: string;
}

export const REMOTE_USAGE_CACHE = 'remote-usage';
const REFRESH_THROTTLE_MARKER = 'remote-usage-attempt';
/** Serve cached limits for up to 5 min — stale beats a blocking fetch */
const DISPLAY_TTL = 300000;
/** Kick off a background refresh when the cache is older than this */
const REFRESH_INTERVAL = 60000;

function remoteUsageDisabled(): boolean {
  return !!process.env['CLAUDE_STATUSBLOCKS_NO_REMOTE'];
}

/** Shared display names for the server's generic limit kinds (also used by the stdin fallback). */
export const KIND_LABELS: Record<string, string> = {
  session: '5h',
  weekly_all: '7d',
};
const KNOWN_GENERIC_KINDS = new Set(Object.keys(KIND_LABELS));

function sanitizeLabel(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 12);
}

function clampPercent(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(999, Math.max(0, Math.round(v)));
}

/**
 * Normalize the SERVER's `limits` array into RemoteLimit[]. This accepts
 * only the raw server shape — cached data goes through validateLimits()
 * instead, so a future server field (e.g. `label`, or a scope on a generic
 * bucket) can never be mistaken for our own normalized output and relabel
 * or hide the generic 5h/7d bars.
 */
export function normalizeLimits(raw: unknown): RemoteLimit[] {
  if (!Array.isArray(raw)) return [];
  const out: RemoteLimit[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const percent = clampPercent(e.percent);
    if (percent === null) continue;

    let resetsAt = 0;
    if (typeof e.resets_at === 'string') {
      const ms = Date.parse(e.resets_at);
      if (Number.isFinite(ms)) resetsAt = Math.floor(ms / 1000);
    }

    const kind = typeof e.kind === 'string' ? e.kind : '';
    // Known generic kinds are unconditionally generic — a scope the server
    // might attach to them must not flip the 5h/7d bars into scoped limits.
    if (KNOWN_GENERIC_KINDS.has(kind)) {
      out.push({ label: KIND_LABELS[kind]!, percent, resetsAt });
      continue;
    }

    const scope = e.scope as { model?: { id?: unknown; display_name?: unknown } | null; surface?: unknown } | null | undefined;
    const modelName = typeof scope?.model?.display_name === 'string' ? scope.model.display_name : '';
    const modelId = typeof scope?.model?.id === 'string' ? scope.model.id : '';
    const surface = typeof scope?.surface === 'string' ? scope.surface : '';

    if (modelName || modelId) {
      const label = sanitizeLabel(modelName || modelId);
      if (!label) continue;
      const limit: RemoteLimit = { label, percent, resetsAt, scope: 'model', match: (modelName || modelId).toLowerCase() };
      if (modelId) limit.id = modelId;
      out.push(limit);
    } else if (surface) {
      const label = sanitizeLabel(surface);
      if (!label) continue;
      out.push({ label, percent, resetsAt, scope: 'surface' });
    } else {
      // Unknown future generic kind: render its raw kind string rather than drop data.
      const label = sanitizeLabel(kind);
      if (!label) continue;
      out.push({ label, percent, resetsAt });
    }
  }
  return out;
}

/** Re-validate OUR OWN normalized shape on cache reads; undefined if it isn't one. */
function validateLimits(v: unknown): RemoteLimit[] | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const out: RemoteLimit[] = [];
  for (const entry of v) {
    if (!entry || typeof entry !== 'object') return undefined;
    const e = entry as Record<string, unknown>;
    const percent = clampPercent(e.percent);
    const label = typeof e.label === 'string' ? sanitizeLabel(e.label) : '';
    if (percent === null || !label) return undefined;
    const limit: RemoteLimit = {
      label,
      percent,
      resetsAt: typeof e.resetsAt === 'number' && Number.isFinite(e.resetsAt) && e.resetsAt > 0 ? e.resetsAt : 0,
    };
    if (e.scope === 'model' || e.scope === 'surface') limit.scope = e.scope;
    if (typeof e.match === 'string') limit.match = e.match;
    if (typeof e.id === 'string') limit.id = e.id;
    out.push(limit);
  }
  return out;
}

// Per-process memo: enabled(), render(), and the refresh check all need the
// cache entry, and every render is a fresh process — one file read suffices.
let entryMemo: { ts: number; value: unknown } | null | undefined;
let limitsMemo: RemoteLimit[] | null | undefined;

function cachedEntry(): { ts: number; value: unknown } | null {
  if (entryMemo === undefined) entryMemo = readCacheEntry(REMOTE_USAGE_CACHE) ?? null;
  return entryMemo;
}

/** Test hook: forget the per-process memo so a rewritten cache file is re-read. */
export function resetRemoteUsageMemo(): void {
  entryMemo = undefined;
  limitsMemo = undefined;
}

/** Cached remote limits, re-validated on read; undefined on miss/expiry/disabled. */
export function readRemoteLimits(): RemoteLimit[] | undefined {
  if (remoteUsageDisabled()) return undefined;
  const entry = cachedEntry();
  if (!entry || Date.now() - entry.ts > DISPLAY_TTL) return undefined;
  if (limitsMemo === undefined) limitsMemo = validateLimits(entry.value) ?? null;
  return limitsMemo ?? undefined;
}

/** Spawn a detached background refresh if the cache is stale (atomically throttled). */
export function maybeRefreshRemoteUsage(): void {
  if (remoteUsageDisabled()) return;
  try {
    const entry = cachedEntry();
    if (entry && Date.now() - entry.ts <= REFRESH_INTERVAL) return;
    if (!acquireMarker(REFRESH_THROTTLE_MARKER, REFRESH_INTERVAL)) return;
    spawnDetached(process.execPath, [fileURLToPath(new URL('./remote-usage-fetch.js', import.meta.url))]);
  } catch { /* remote usage is best-effort */ }
}

/** Write freshly fetched, already-normalized limits (used by the fetch child). */
export function storeRemoteLimits(limits: RemoteLimit[]): void {
  if (limits.length > 0) writeCache(REMOTE_USAGE_CACHE, limits);
}
