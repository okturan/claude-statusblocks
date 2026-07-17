import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getOAuthToken } from './credentials.js';

// Only the CLAUDE_CONFIG_DIR file path is exercised here — the Keychain
// fallback would read the developer's real credentials, so assertions are
// written to hold regardless of what (if anything) the Keychain returns.
describe('getOAuthToken', () => {
  let dir: string;
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('honors CLAUDE_CONFIG_DIR like the rest of the app', () => {
    dir = mkdtempSync(join(tmpdir(), 'csb-creds-test-'));
    writeFileSync(join(dir, '.credentials.json'), JSON.stringify({
      claudeAiOauth: { accessToken: 'test-token-123', expiresAt: Date.now() + 3600000 },
    }));
    vi.stubEnv('CLAUDE_CONFIG_DIR', dir);
    expect(getOAuthToken()).toBe('test-token-123');
  });

  it('rejects an expired file token instead of returning it', () => {
    dir = mkdtempSync(join(tmpdir(), 'csb-creds-test-'));
    writeFileSync(join(dir, '.credentials.json'), JSON.stringify({
      claudeAiOauth: { accessToken: 'stale-token', expiresAt: Date.now() - 1000 },
    }));
    vi.stubEnv('CLAUDE_CONFIG_DIR', dir);
    expect(getOAuthToken()).not.toBe('stale-token');
  });
});
