#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { StatusLineData } from './types.js';
import { loadConfig } from './config.js';
import { render } from './layout.js';

const AUTO_UPDATE_INTERVAL = 86400000; // 24 hours

/** Once per day, spawn a background npx process to update ~/.claude/statusblocks/ */
function maybeAutoUpdate() {
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
    });
    child.unref();
  } catch { /* auto-update is best-effort */ }
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
    // Detect terminal width — stty on parent's TTY, then tput, then fallback
    let termWidth = process.stderr.columns || process.stdout.columns || 0;
    if (!termWidth) {
      try {
        const tty = execSync('ps -o tty= -p $(ps -o ppid= -p $$)', {
          encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], shell: '/bin/sh'
        }).trim();
        if (tty && tty !== '?' && tty !== '??' && /^[a-zA-Z0-9/]+$/.test(tty)) {
          termWidth = parseInt(execSync(`stty size < /dev/${tty} | awk '{print $2}'`, {
            encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], shell: '/bin/sh'
          }).trim(), 10) || 0;
        }
      } catch { /* TTY detection failed — try fallback */ }
    }
    if (!termWidth) {
      try {
        termWidth = parseInt(execSync('tput cols', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim(), 10) || 0;
      } catch { /* tput unavailable — use default */ }
    }
    if (!termWidth) { termWidth = 120; }
    const output = render(data, termWidth, config);
    process.stdout.write(output + '\n');
  } catch (err) {
    process.stderr.write(`[claude-statusblocks] ${err instanceof Error ? err.message : err}\n`);
    process.stdout.write('\n');
  }
  maybeAutoUpdate();
});
