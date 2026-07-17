import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { normalizeLimits, readRemoteLimits, maybeRefreshRemoteUsage, REMOTE_USAGE_CACHE } from './remote-usage.js';
import { writeCache } from './cache.js';

// Isolate the cross-process file cache from the developer's real one, and
// ensure no test can ever reach the spawn path with real machine state.
let cacheDir: string;
beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'csb-remote-test-'));
  vi.stubEnv('CLAUDE_STATUSBLOCKS_CACHE_DIR', cacheDir);
});
afterEach(() => {
  vi.unstubAllEnvs();
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
  });

  it('parses ISO resets_at into epoch seconds', () => {
    const limits = normalizeLimits(SERVER_LIMITS);
    expect(limits[0]!.resetsAt).toBe(Math.floor(Date.parse('2026-07-17T17:09:59.841702+00:00') / 1000));
  });

  it('labels unknown future kinds by their kind string, and scoped-by-surface by surface', () => {
    const limits = normalizeLimits([
      { kind: 'monthly_all', percent: 5 },
      { kind: 'weekly_scoped', percent: 12, scope: { model: null, surface: 'cowork' } },
    ]);
    expect(limits.map(l => l.label)).toEqual(['monthly_all', 'cowork']);
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

  it('marks scoped entries and preserves the flag through re-normalization', () => {
    const limits = normalizeLimits(SERVER_LIMITS);
    expect(limits.map(l => !!l.scoped)).toEqual([false, false, true]);
    expect(normalizeLimits(limits).map(l => !!l.scoped)).toEqual([false, false, true]);
  });
});

describe('readRemoteLimits', () => {
  it('returns undefined on a cold cache', () => {
    expect(readRemoteLimits()).toBeUndefined();
  });

  it('round-trips normalized limits through the cache', () => {
    writeCache(REMOTE_USAGE_CACHE, normalizeLimits(SERVER_LIMITS));
    const limits = readRemoteLimits();
    expect(limits).toBeDefined();
    expect(limits!.map(l => l.label)).toEqual(['5h', '7d', 'Fable']);
    expect(limits![2]!.resetsAt).toBeGreaterThan(0);
  });

  it('returns undefined for garbage or empty cached values', () => {
    writeCache(REMOTE_USAGE_CACHE, { not: 'an array' });
    expect(readRemoteLimits()).toBeUndefined();
    writeCache(REMOTE_USAGE_CACHE, []);
    expect(readRemoteLimits()).toBeUndefined();
  });

  it('returns undefined when disabled via env, even with a warm cache', () => {
    writeCache(REMOTE_USAGE_CACHE, normalizeLimits(SERVER_LIMITS));
    vi.stubEnv('CLAUDE_STATUSBLOCKS_NO_REMOTE', '1');
    expect(readRemoteLimits()).toBeUndefined();
  });
});

describe('maybeRefreshRemoteUsage', () => {
  it('does nothing when disabled via env', () => {
    vi.stubEnv('CLAUDE_STATUSBLOCKS_NO_REMOTE', '1');
    maybeRefreshRemoteUsage();
    expect(readdirSync(cacheDir)).toEqual([]);
  });

  it('does not write a throttle marker while the cache is fresh', () => {
    writeCache(REMOTE_USAGE_CACHE, normalizeLimits(SERVER_LIMITS));
    maybeRefreshRemoteUsage();
    expect(readdirSync(cacheDir)).toEqual([REMOTE_USAGE_CACHE]);
  });

  it('respects an existing throttle marker without spawning again', () => {
    writeCache('remote-usage-attempt', 1);
    maybeRefreshRemoteUsage();
    expect(readdirSync(cacheDir).sort()).toEqual(['remote-usage-attempt']);
  });
});
