#!/usr/bin/env node

import { execSync } from 'child_process';
import type { StatusLineData } from './types.js';
import { loadConfig } from './config.js';
import { render } from './layout.js';

// Read all of stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input) as StatusLineData;
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
      } catch { /* */ }
    }
    if (!termWidth) {
      try {
        termWidth = parseInt(execSync('tput cols', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim(), 10) || 0;
      } catch { /* */ }
    }
    if (!termWidth) { termWidth = 120; }
    const output = render(data, termWidth, config);
    process.stdout.write(output + '\n');
  } catch {
    process.stdout.write('\n');
  }
});
