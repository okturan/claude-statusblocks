#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { StatusLineData } from './types.js';
import { loadConfig } from './config.js';
import { render } from './layout.js';
import { readCache, writeCache, safeKey } from './cache.js';
import { maybeRefreshRemoteUsage } from './remote-usage.js';

const AUTO_UPDATE_INTERVAL = 86400000; // 24 hours
const WIDTH_CACHE_TTL = 15000; // resize lag tolerance vs. subprocess cost per render

/** Once per day, spawn a background npx process to update ~/.claude/statusblocks/ */
function maybeAutoUpdate() {
  if (process.env.CLAUDE_STATUSBLOCKS_NO_UPDATE) return;
  try {
    const dir = join(homedir(), '.claude', 'statusblocks');
    if (!existsSync(dir)) return;

    const checkFile = join(dir, '.last-update-check');
    let lastCheck = 0;
    try { lastCheck = parseInt(readFileSync(checkFile, 'utf8'), 10) || 0; } catch { /* missing file */ }
    if (Date.now() - lastCheck < AUTO_UPDATE_INTERVAL) return;

    writeFileSync(checkFile, String(Date.now()));

    const child = spawn('npx -y claude-statusblocks@latest update', {
      detached: true,
      stdio: 'ignore',
      shell: true,
      windowsHide: true, // detached children get their own console window on Windows otherwise
    });
    child.unref();
  } catch { /* auto-update is best-effort */ }
}

/**
 * Claude Code doesn't pass terminal width to status line commands (issue
 * #22115) and pipes stdio, so process.std*.columns is normally unset.
 * Cascade: std streams → COLUMNS env → per-session cache → (non-Windows
 * only) parent TTY via ps + stty → tput → fallback 120. The spawn-based
 * result is cached so renders don't pay two subprocesses each.
 */
function detectWidth(sessionId: string): number {
  let w = process.stderr.columns || process.stdout.columns || 0;
  if (!w) w = parseInt(process.env.COLUMNS ?? '', 10) || 0;
  if (w > 0) return w;

  const cacheName = `width-${safeKey(sessionId)}`;
  const cached = readCache<number>(cacheName, WIDTH_CACHE_TTL);
  if (cached !== undefined && cached > 0) return cached;

  if (process.platform !== 'win32') {
    try {
      const tty = execSync('ps -o tty= -p $(ps -o ppid= -p $$)', {
        encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], shell: '/bin/sh'
      }).trim();
      if (tty && tty !== '?' && tty !== '??' && /^[a-zA-Z0-9/]+$/.test(tty)) {
        w = parseInt(execSync(`stty size < /dev/${tty} | awk '{print $2}'`, {
          encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], shell: '/bin/sh'
        }).trim(), 10) || 0;
      }
    } catch { /* TTY detection failed — try fallback */ }
    if (!w) {
      try {
        w = parseInt(execSync('tput cols', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim(), 10) || 0;
      } catch { /* tput unavailable — use default */ }
    }
  }
  if (!w) w = 120;
  writeCache(cacheName, w); // cache the fallback too: failed detection would just fail again
  return w;
}

/** Validate that parsed JSON has the required shape of StatusLineData */
function isValidStatusData(v: unknown): v is StatusLineData {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  // Validate required top-level objects exist with expected leaf fields
  const model = obj.model as Record<string, unknown> | undefined;
  if (!model || typeof model !== 'object' || typeof model.display_name !== 'string') return false;
  const cw = obj.context_window as Record<string, unknown> | undefined;
  if (!cw || typeof cw !== 'object' || typeof cw.context_window_size !== 'number') return false;
  const ws = obj.workspace as Record<string, unknown> | undefined;
  if (!ws || typeof ws !== 'object' || typeof ws.current_dir !== 'string') return false;
  return true;
}

// Read all of stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const parsed = JSON.parse(input);
    if (!isValidStatusData(parsed)) {
      process.stdout.write('\n');
      return;
    }
    const data = parsed;
    const config = loadConfig();
    const termWidth = detectWidth(String(data.session_id ?? 'default'));
    const output = render(data, termWidth, config);
    process.stdout.write(output + '\n');
    if (config.remoteUsage !== false) maybeRefreshRemoteUsage();
  } catch (err) {
    process.stderr.write(`[claude-statusblocks] ${err instanceof Error ? err.message : err}\n`);
    process.stdout.write('\n');
  }
  maybeAutoUpdate();
});
