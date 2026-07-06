import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

/**
 * Cross-process cache. Every statusline render is a fresh node process, so
 * module-level caches never survive between renders — short-TTL files in a
 * per-user tmp dir do. All operations are best-effort: any fs error reads as
 * a cache miss.
 */
function cacheDir(): string {
  const uid = typeof process.getuid === 'function' ? `-${process.getuid()}` : '';
  const dir = join(tmpdir(), `claude-statusblocks${uid}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Returns the cached value (which may itself be null), or undefined on miss/expiry. */
export function readCache<T>(name: string, ttlMs: number): T | undefined {
  try {
    const raw = JSON.parse(readFileSync(join(cacheDir(), name), 'utf8'));
    if (typeof raw?.ts !== 'number' || Date.now() - raw.ts > ttlMs) return undefined;
    return raw.value as T;
  } catch {
    return undefined;
  }
}

export function writeCache(name: string, value: unknown): void {
  try {
    writeFileSync(join(cacheDir(), name), JSON.stringify({ ts: Date.now(), value }));
  } catch { /* cache is best-effort */ }
}

/** Sanitize an arbitrary string into a filename-safe cache key part. */
export function safeKey(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
}

/** Short stable hash for keys that may be long or contain path separators. */
export function hashKey(s: string): string {
  return createHash('sha1').update(s).digest('hex').slice(0, 12);
}
