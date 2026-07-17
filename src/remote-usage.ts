import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { readCache, writeCache } from './cache.js';

/**
 * Remote usage limits — the same data the claude.ai Usage page and Claude
 * Code's /usage screen show, fetched from the (undocumented) OAuth usage
 * endpoint. Unlike the stdin `rate_limits` field, this includes
 * model-scoped weekly limits (e.g. a separate Fable bucket), served as a
 * generic `limits` array so new scopes appear without code changes here.
 *
 * The render path never touches the network: renders read a short-TTL
 * file cache, and a detached background child (remote-usage-fetch.js)
 * refreshes it at most once per REFRESH_INTERVAL.
 */

export interface RemoteLimit {
  label: string;
  percent: number;
  /** Unix epoch seconds; 0 when unknown */
  resetsAt: number;
  /** True for model/surface-scoped limits (label is the scope name) */
  scoped?: boolean;
}

export const REMOTE_USAGE_CACHE = 'remote-usage';
const REFRESH_THROTTLE_CACHE = 'remote-usage-attempt';
/** Serve cached limits for up to 5 min — stale beats a blocking fetch */
const DISPLAY_TTL = 300000;
/** Kick off a background refresh when the cache is older than this */
const REFRESH_INTERVAL = 60000;

export function remoteUsageDisabled(): boolean {
  return !!process.env['CLAUDE_STATUSBLOCKS_NO_REMOTE'];
}

const KIND_LABELS: Record<string, string> = {
  session: '5h',
  weekly_all: '7d',
};

function sanitizeLabel(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 12);
}

/**
 * Normalize the endpoint's `limits` array into RemoteLimit[]. Scoped
 * entries are labeled by their model display name so future scoped
 * models render without a code change. Exported for the fetch script
 * and tests; also used to re-validate cache reads.
 */
export function normalizeLimits(raw: unknown): RemoteLimit[] {
  if (!Array.isArray(raw)) return [];
  const out: RemoteLimit[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const percent = typeof e.percent === 'number' && Number.isFinite(e.percent)
      ? Math.min(999, Math.max(0, Math.round(e.percent)))
      : null;
    if (percent === null) continue;

    const kind = typeof e.kind === 'string' ? e.kind : '';
    const scope = e.scope as { model?: { display_name?: unknown }; surface?: unknown } | null | undefined;
    const scopeName = typeof scope?.model?.display_name === 'string' ? scope.model.display_name
      : typeof scope?.surface === 'string' ? scope.surface
      : '';
    // e.label/e.scoped carry through the already-normalized shape on cache reads
    const rawLabel = typeof e.label === 'string' ? e.label : (scopeName || KIND_LABELS[kind] || kind);
    const label = sanitizeLabel(rawLabel);
    if (!label) continue;
    const scoped = e.scoped === true || kind === 'weekly_scoped' || !!scopeName;

    let resetsAt = 0;
    if (typeof e.resets_at === 'string') {
      const ms = Date.parse(e.resets_at);
      if (Number.isFinite(ms)) resetsAt = Math.floor(ms / 1000);
    } else if (typeof e.resetsAt === 'number' && Number.isFinite(e.resetsAt)) {
      resetsAt = e.resetsAt; // already-normalized shape, from cache
    }
    out.push(scoped ? { label, percent, resetsAt, scoped } : { label, percent, resetsAt });
  }
  return out;
}

/** Cached remote limits, re-validated on read; undefined on miss/disabled. */
export function readRemoteLimits(): RemoteLimit[] | undefined {
  if (remoteUsageDisabled()) return undefined;
  const cached = readCache<unknown>(REMOTE_USAGE_CACHE, DISPLAY_TTL);
  if (cached === undefined) return undefined;
  const limits = normalizeLimits(cached);
  return limits.length > 0 ? limits : undefined;
}

/** Spawn a detached background refresh if the cache is stale (throttled). */
export function maybeRefreshRemoteUsage(): void {
  if (remoteUsageDisabled()) return;
  try {
    if (readCache<unknown>(REMOTE_USAGE_CACHE, REFRESH_INTERVAL) !== undefined) return;
    if (readCache<number>(REFRESH_THROTTLE_CACHE, REFRESH_INTERVAL) !== undefined) return;
    writeCache(REFRESH_THROTTLE_CACHE, 1);

    const script = fileURLToPath(new URL('./remote-usage-fetch.js', import.meta.url));
    const child = spawn(process.execPath, [script], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch { /* remote usage is best-effort */ }
}
