import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface UsageData {
  sessionUsage: number;       // 5-hour utilization 0-100
  sessionResetAt: string;     // ISO timestamp
  weeklyUsage: number;        // 7-day utilization 0-100
  weeklyResetAt: string;      // ISO timestamp
  extraUsageEnabled: boolean;
  extraUsageLimit: number;    // cents
  extraUsageUsed: number;     // cents
  extraUsageUtilization: number;
}

const CACHE_DIR = join(homedir(), '.cache', 'claude-statusblocks');
const CACHE_FILE = join(CACHE_DIR, 'usage.json');
const LOCK_FILE = join(CACHE_DIR, 'usage.lock');
const CACHE_MAX_AGE_MS = 180_000;  // 3 minutes
const LOCK_MAX_AGE_MS = 30_000;    // 30 seconds

interface CacheEntry {
  data: UsageData;
  ts: number;
}

let memCache: CacheEntry | null = null;

function getOAuthToken(): string | null {
  // 1. macOS Keychain
  if (process.platform === 'darwin') {
    try {
      const raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      const parsed = JSON.parse(raw);
      const token = parsed?.claudeAiOauth?.accessToken;
      if (token) return token;
    } catch { /* */ }
  }

  // 2. Credentials file
  const configDir = process.env['CLAUDE_CONFIG_DIR'] || join(homedir(), '.claude');
  try {
    const raw = readFileSync(join(configDir, '.credentials.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const token = parsed?.claudeAiOauth?.accessToken;
    if (token) return token;
  } catch { /* */ }

  return null;
}

function isLocked(): boolean {
  try {
    const raw = readFileSync(LOCK_FILE, 'utf8');
    const lock = JSON.parse(raw);
    return Date.now() < (lock.blockedUntil ?? 0);
  } catch { return false; }
}

function setLock(durationMs: number): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(LOCK_FILE, JSON.stringify({ blockedUntil: Date.now() + durationMs }));
  } catch { /* */ }
}

function readFileCache(): CacheEntry | null {
  try {
    const raw = readFileSync(CACHE_FILE, 'utf8');
    return JSON.parse(raw) as CacheEntry;
  } catch { return null; }
}

function writeFileCache(entry: CacheEntry): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(entry));
  } catch { /* */ }
}

export function fetchUsage(): UsageData | null {
  const now = Date.now();

  // Check memory cache
  if (memCache && now - memCache.ts < CACHE_MAX_AGE_MS) {
    return memCache.data;
  }

  // Check file cache
  const fileCache = readFileCache();
  if (fileCache && now - fileCache.ts < CACHE_MAX_AGE_MS) {
    memCache = fileCache;
    return fileCache.data;
  }

  // Don't hit API if locked
  if (isLocked()) {
    return memCache?.data ?? fileCache?.data ?? null;
  }

  const token = getOAuthToken();
  if (!token) return fileCache?.data ?? null;

  // Set lock before fetching
  setLock(LOCK_MAX_AGE_MS);

  try {
    // Synchronous HTTP via curl — pass token via env to avoid shell escaping issues
    const response = execSync(
      'curl -s -m 5 -w "\\n%{http_code}" -H "Authorization: Bearer $CLAUDE_TOKEN" -H "anthropic-beta: oauth-2025-04-20" https://api.anthropic.com/api/oauth/usage',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], shell: '/bin/sh', env: { ...process.env, CLAUDE_TOKEN: token } },
    );

    const lines = response.trim().split('\n');
    const httpCode = parseInt(lines.pop() ?? '', 10);
    const body = lines.join('\n');

    if (httpCode === 429) {
      setLock(300_000); // 5 min backoff
      return fileCache?.data ?? null;
    }

    if (httpCode !== 200) {
      return fileCache?.data ?? null;
    }

    const json = JSON.parse(body);
    const data: UsageData = {
      sessionUsage: json.five_hour?.utilization ?? 0,
      sessionResetAt: json.five_hour?.resets_at ?? '',
      weeklyUsage: json.seven_day?.utilization ?? 0,
      weeklyResetAt: json.seven_day?.resets_at ?? '',
      extraUsageEnabled: json.extra_usage?.is_enabled ?? false,
      extraUsageLimit: json.extra_usage?.monthly_limit ?? 0,
      extraUsageUsed: json.extra_usage?.used_credits ?? 0,
      extraUsageUtilization: json.extra_usage?.utilization ?? 0,
    };

    const entry: CacheEntry = { data, ts: now };
    memCache = entry;
    writeFileCache(entry);
    return data;
  } catch {
    return fileCache?.data ?? null;
  }
}
