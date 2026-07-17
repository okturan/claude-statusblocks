import { mkdirSync, readFileSync, writeFileSync, renameSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

/**
 * Cross-process cache. Every statusline render is a fresh node process, so
 * module-level caches never survive between renders — short-TTL files in a
 * per-user tmp dir do. All operations are best-effort: any fs error reads as
 * a cache miss.
 */
function cacheDir(create: boolean): string {
  const override = process.env['CLAUDE_STATUSBLOCKS_CACHE_DIR'];
  const uid = typeof process.getuid === 'function' ? `-${process.getuid()}` : '';
  const dir = override || join(tmpdir(), `claude-statusblocks${uid}`);
  // Reads never need the dir — a missing dir is just a miss.
  if (create) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Raw cache entry with its write timestamp, or undefined on miss. */
export function readCacheEntry(name: string): { ts: number; value: unknown } | undefined {
  try {
    const raw = JSON.parse(readFileSync(join(cacheDir(false), name), 'utf8'));
    if (typeof raw?.ts !== 'number') return undefined;
    return { ts: raw.ts, value: raw.value };
  } catch {
    return undefined;
  }
}

/** Returns the cached value (which may itself be null), or undefined on miss/expiry. */
export function readCache<T>(name: string, ttlMs: number): T | undefined {
  const entry = readCacheEntry(name);
  if (entry === undefined || Date.now() - entry.ts > ttlMs) return undefined;
  return entry.value as T;
}

export function writeCache(name: string, value: unknown): void {
  try {
    const dir = cacheDir(true);
    // Temp file + rename: concurrent readers in other render processes must
    // never observe a truncated file (writeFileSync alone is truncate-then-write).
    const tmp = join(dir, `${name}.tmp-${process.pid}`);
    writeFileSync(tmp, JSON.stringify({ ts: Date.now(), value }));
    renameSync(tmp, join(dir, name));
  } catch { /* cache is best-effort */ }
}

/**
 * Atomically claim a throttle marker: true means this process won the slot
 * for the next ttlMs. Uses O_EXCL creation so concurrent renders can't both
 * win (a read-then-write throttle would let them both pass the check).
 */
export function acquireMarker(name: string, ttlMs: number): boolean {
  try {
    const path = join(cacheDir(true), name);
    try {
      writeFileSync(path, String(Date.now()), { flag: 'wx' });
      return true;
    } catch {
      if (Date.now() - statSync(path).mtimeMs <= ttlMs) return false;
      unlinkSync(path); // stale marker — remove and race for the recreate
      writeFileSync(path, String(Date.now()), { flag: 'wx' });
      return true;
    }
  } catch {
    return false;
  }
}

/** Sanitize an arbitrary string into a filename-safe cache key part. */
export function safeKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
}

/** Short stable hash for keys that may be long or contain path separators. */
export function hashKey(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 12);
}
