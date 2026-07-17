import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * Claude Code OAuth token lookup. Only ever called from the detached
 * background refresher (see remote-usage-fetch.ts), never on the render
 * path — the macOS Keychain read spawns a subprocess.
 */

function parseToken(raw: string): string | null {
  const creds = JSON.parse(raw);
  const oauth = creds?.claudeAiOauth;
  if (!oauth || typeof oauth.accessToken !== 'string' || !oauth.accessToken) return null;
  if (typeof oauth.expiresAt === 'number' && oauth.expiresAt < Date.now()) return null;
  return oauth.accessToken;
}

export function getOAuthToken(): string | null {
  try {
    const raw = readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf8');
    const token = parseToken(raw);
    if (token) return token;
  } catch { /* no credentials file — try the Keychain */ }

  if (process.platform === 'darwin') {
    try {
      const raw = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 5000,
      });
      return parseToken(raw);
    } catch { /* locked keychain, missing item — treat as no token */ }
  }
  return null;
}
