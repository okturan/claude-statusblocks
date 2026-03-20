#!/usr/bin/env node

import { execSync } from 'child_process';
import type { StatusLineData } from './types.js';
import { loadConfig } from './config.js';
import { render } from './layout.js';

/** Validate that parsed JSON has the minimum shape of StatusLineData */
function isValidStatusData(v: unknown): v is StatusLineData {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  if (!obj.model || typeof obj.model !== 'object') return false;
  if (!obj.context_window || typeof obj.context_window !== 'object') return false;
  if (!obj.workspace || typeof obj.workspace !== 'object') return false;
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
});
