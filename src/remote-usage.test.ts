import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { normalizeLimits, readRemoteLimits, maybeRefreshRemoteUsage, resetRemoteUsageMemo, storeRemoteLimits, REMOTE_USAGE_CACHE } from './remote-usage.js';
import { writeCache, acquireMarker } from './cache.js';

// Isolate the cross-process file cache from the developer's real one, and
// neutralize any ambient kill switch (a user's exported
// CLAUDE_STATUSBLOCKS_NO_REMOTE=1 must not turn the suite red).
let cacheDir: string;
beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'csb-remote-test-'));
  vi.stubEnv('CLAUDE_STATUSBLOCKS_CACHE_DIR', cacheDir);
  vi.stubEnv('CLAUDE_STATUSBLOCKS_NO_REMOTE', '');
  resetRemoteUsageMemo();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetRemoteUsageMemo();
  rmSync(cacheDir, { recursive: true, force: true });
});

const SERVER_LIMITS = [
  { kind: 'session', group: 'session', percent: 40, resets_at: '2026-07-17T17:09:59.841702+00:00', scope: null, is_active: true },
  { kind: 'weekly_all', group: 'weekly', percent: 19, resets_at: '2026-07-19T16:59:59.841724+00:00', scope: null, is_active: false },
  { kind: 'weekly_scoped', group: 'weekly', percent: 27, resets_at: '2026-07-19T16:59:59.842066+00:00', scope: { model: { id: null, display_name: 'Fable' }, surface: null }, is_active: false },
];

describe('normalizeLimits', () => {
  it('maps generic kinds to short labels and scoped kinds to the model name', () => {
    const limits = normalizeLimits(SERVER_LIMITS);
    expect(limits.map(l => l.label)).toEqual(['5h', '7d', 'Fable']);
    expect(limits.map(l => l.percent)).toEqual([40, 19, 27]);
    expect(limits.map(l => l.scope)).toEqual([undefined, undefined, 'model']);
    expect(limits[2]!.match).toBe('fable');
  });

  it('parses ISO resets_at into epoch seconds', () => {
    const limits = normalizeLimits(SERVER_LIMITS);
    expect(limits[0]!.resetsAt).toBe(Math.floor(Date.parse('2026-07-17T17:09:59.841702+00:00') / 1000));
  });

  it('keeps the full untruncated name as the match key, truncating only the label', () => {
    const limits = normalizeLimits([
      { kind: 'weekly_scoped', percent: 9, scope: { model: { display_name: 'Claude Fable 5' } } },
    ]);
    expect(limits[0]!.label).toBe('Claude Fable');
    expect(limits[0]!.match).toBe('claude fable 5');
  });

  it('marks surface scopes as surface, and labels unknown generic kinds by their kind', () => {
    const limits = normalizeLimits([
      { kind: 'monthly_all', percent: 5 },
      { kind: 'weekly_scoped', percent: 12, scope: { model: null, surface: 'cowork' } },
    ]);
    expect(limits.map(l => l.label)).toEqual(['monthly_all', 'cowork']);
    expect(limits.map(l => l.scope)).toEqual([undefined, 'surface']);
  });

  it('never lets server fields flip generic buckets: scope on weekly_all stays 7d, label is ignored', () => {
    const limits = normalizeLimits([
      { kind: 'weekly_all', percent: 30, scope: { surface: 'default' } },
      { kind: 'session', percent: 42, label: 'Session' },
    ]);
    expect(limits.map(l => l.label)).toEqual(['7d', '5h']);
    expect(limits.map(l => l.scope)).toEqual([undefined, undefined]);
  });

  it('carries the server model id for stable matching when populated', () => {
    const limits = normalizeLimits([
      { kind: 'weekly_scoped', percent: 9, scope: { model: { id: 'claude-fable-5', display_name: 'Fable' } } },
    ]);
    expect(limits[0]!.id).toBe('claude-fable-5');
  });

  it('skips entries without a numeric percent and clamps/rounds valid ones', () => {
    const limits = normalizeLimits([
      { kind: 'session', percent: null },
      { kind: 'weekly_all', percent: 'high' },
      { kind: 'weekly_all', percent: 19.6 },
      { kind: 'session', percent: -3 },
      { kind: 'session', percent: 5000 },
    ]);
    expect(limits.map(l => l.percent)).toEqual([20, 0, 999]);
  });

  it('sanitizes labels: strips control chars, truncates to 12', () => {
    const limits = normalizeLimits([
      { kind: 'weekly_scoped', percent: 1, scope: { model: { display_name: 'Fa\x1b[31mble' } } },
      { kind: 'weekly_scoped', percent: 2, scope: { model: { display_name: 'A Very Long Model Name' } } },
    ]);
    expect(limits[0]!.label).toBe('Fa[31mble');
    expect(limits[1]!.label).toBe('A Very Long ');
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeLimits(undefined)).toEqual([]);
    expect(normalizeLimits({ limits: [] })).toEqual([]);
    expect(normalizeLimits('nope')).toEqual([]);
  });
});

describe('readRemoteLimits', () => {
  it('returns undefined on a cold cache', () => {
    expect(readRemoteLimits()).toBeUndefined();
  });

  it('round-trips normalized limits through the store/read path', () => {
    storeRemoteLimits(normalizeLimits(SERVER_LIMITS));
    resetRemoteUsageMemo();
    const limits = readRemoteLimits();
    expect(limits).toBeDefined();
    expect(limits!.map(l => l.label)).toEqual(['5h', '7d', 'Fable']);
    expect(limits![2]!.scope).toBe('model');
    expect(limits![2]!.match).toBe('fable');
    expect(limits![2]!.resetsAt).toBeGreaterThan(0);
  });

  it('returns undefined for garbage or empty cached values', () => {
    writeCache(REMOTE_USAGE_CACHE, { not: 'an array' });
    resetRemoteUsageMemo();
    expect(readRemoteLimits()).toBeUndefined();
    writeCache(REMOTE_USAGE_CACHE, []);
    resetRemoteUsageMemo();
    expect(readRemoteLimits()).toBeUndefined();
    writeCache(REMOTE_USAGE_CACHE, [{ label: '', percent: 5, resetsAt: 0 }]);
    resetRemoteUsageMemo();
    expect(readRemoteLimits()).toBeUndefined();
  });

  it('returns undefined when disabled via env, even with a warm cache', () => {
    storeRemoteLimits(normalizeLimits(SERVER_LIMITS));
    resetRemoteUsageMemo();
    vi.stubEnv('CLAUDE_STATUSBLOCKS_NO_REMOTE', '1');
    expect(readRemoteLimits()).toBeUndefined();
  });
});

describe('acquireMarker', () => {
  it('grants the slot once, then refuses until the marker goes stale', () => {
    expect(acquireMarker('test-marker', 60000)).toBe(true);
    expect(acquireMarker('test-marker', 60000)).toBe(false);
    // Age the marker past the TTL — the next claim should win again.
    const old = (Date.now() - 120000) / 1000;
    utimesSync(join(cacheDir, 'test-marker'), old, old);
    expect(acquireMarker('test-marker', 60000)).toBe(true);
  });
});

describe('maybeRefreshRemoteUsage', () => {
  it('does nothing when disabled via env', () => {
    vi.stubEnv('CLAUDE_STATUSBLOCKS_NO_REMOTE', '1');
    maybeRefreshRemoteUsage();
    expect(readdirSync(cacheDir)).toEqual([]);
  });

  it('does not claim the throttle marker while the cache is fresh', () => {
    storeRemoteLimits(normalizeLimits(SERVER_LIMITS));
    resetRemoteUsageMemo();
    maybeRefreshRemoteUsage();
    expect(readdirSync(cacheDir)).toEqual([REMOTE_USAGE_CACHE]);
  });

  it('respects a freshly claimed throttle marker without spawning again', () => {
    acquireMarker('remote-usage-attempt', 60000);
    maybeRefreshRemoteUsage();
    expect(readdirSync(cacheDir).sort()).toEqual(['remote-usage-attempt']);
  });
});
