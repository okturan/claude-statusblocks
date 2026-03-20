#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { render } from './layout.js';
import { loadConfig } from './config.js';
import type { StatusLineData } from './types.js';

function settingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

const MOCK_DATA: StatusLineData = {
  model: { id: 'claude-opus-4-6', display_name: 'Opus 4.6' },
  workspace: { current_dir: process.cwd(), project_dir: process.cwd() },
  version: '1.0.80',
  cost: { total_cost_usd: 8.42, total_duration_ms: 2700000, total_api_duration_ms: 1200000, total_lines_added: 245, total_lines_removed: 67 },
  context_window: { context_window_size: 1000000, used_percentage: 34, remaining_percentage: 66, total_input_tokens: 340000, total_output_tokens: 28000, current_usage: { input_tokens: 8000, output_tokens: 1200, cache_creation_input_tokens: 12000, cache_read_input_tokens: 320000 } },
  rate_limits: {
    five_hour: { used_percentage: 12, resets_at: Math.floor(Date.now() / 1000) + 7200 },
    seven_day: { used_percentage: 70, resets_at: Math.floor(Date.now() / 1000) + 75600 },
  },
  exceeds_200k_tokens: true,
  session_id: 'preview',
};

function preview() {
  const config = loadConfig();
  const widths = [120, 80, 50];

  console.log('\n\x1b[1mclaude-statusblocks\x1b[0m preview\n');

  for (const w of widths) {
    console.log(`\x1b[2m${'─'.repeat(w)}\x1b[0m`);
    console.log(`\x1b[2m${w} cols:\x1b[0m`);
    const output = render(MOCK_DATA, w, config);
    console.log(output);
    console.log();
  }
}

function init() {
  console.log('\n\x1b[38;2;217;119;87m\x1b[1mclaude-statusblocks\x1b[0m setup\n');
  try {
    const raw = readFileSync(settingsPath(), 'utf8');
    const settings = JSON.parse(raw);
    const oldCommand = settings.statusLine?.command;
    settings.statusLine = { type: 'command', command: 'npx -y claude-statusblocks@latest', padding: 0 };
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2) + '\n');
    if (oldCommand) console.log(`  Replaced: \x1b[2m${oldCommand}\x1b[0m`);
    console.log('  Installed: \x1b[32mnpx -y claude-statusblocks@latest\x1b[0m');
    console.log('  Settings:  \x1b[2m~/.claude/settings.json\x1b[0m\n');
  } catch (err) {
    console.error(`  Error: Could not update ${settingsPath()}`);
    console.error(`  ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }
}

function help() {
  console.log(`
\x1b[38;2;217;119;87m\x1b[1mclaude-statusblocks\x1b[0m — block-based status line for Claude Code

\x1b[1mUsage:\x1b[0m
  claude-statusblocks init       Install into Claude Code settings
  claude-statusblocks preview    Preview with mock data at various widths
  claude-statusblocks help       Show this help

\x1b[1mBlocks:\x1b[0m
  context    Context window fill bar, percentage, token counts
  model      Model name, directory, effort, duration, version
  promo      Rate promotion status with peak/off-peak countdown
  git        Branch, staged/modified counts, lines added/removed
  usage      5-hour and 7-day rate limit utilization

\x1b[1mCustomize:\x1b[0m
  ~/.claude-statusblocks.json:  { "segments": ["context", "model", "git"] }
  Env vars:            CLAUDE_STATUSBLOCKS_SEGMENTS=context,model
`);
}

const cmd = process.argv[2];
switch (cmd) {
  case 'init': init(); break;
  case 'preview': preview(); break;
  case 'help': case '--help': case '-h': help(); break;
  default:
    if (process.stdin.isTTY) { help(); }
    else { import('./index.js'); }
}
