#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, rmSync, existsSync } from 'fs';
import { join, dirname, basename, sep } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { render } from './layout.js';
import { loadConfig } from './config.js';
import { color, c } from './colors.js';
import { isValidVersion, isNewerVersion } from './version.js';
import type { StatusLineData } from './types.js';

type Settings = {
  statusLine?: { type?: string; command?: string; padding?: number; [k: string]: unknown };
  [k: string]: unknown;
};

const PACKAGE_VERSION: string = (() => {
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version?: unknown };
  if (typeof manifest.version !== 'string' || !isValidVersion(manifest.version)) {
    throw new Error('package.json contains an invalid version');
  }
  return manifest.version;
})();

function settingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

/**
 * Statusline command that survives every shell Claude Code may run it
 * through: forward slashes + quotes parse identically in sh, Git Bash, cmd,
 * and PowerShell. Backslashes would be eaten as escapes by bash on Windows,
 * and unquoted paths break on spaces (e.g. C:\Users\First Last).
 */
function statusLineCommand(dest: string): string {
  return `node "${join(dest, 'index.js').split(sep).join('/')}"`;
}

/** Read ~/.claude/settings.json; a missing file is a valid empty config. */
function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(settingsPath(), 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`could not parse ${settingsPath()}: ${err instanceof Error ? err.message : err}`);
  }
}

/** Is this statusline command one of ours (any historical form)? */
function isOurCommand(cmd: string): boolean {
  return cmd.includes('claude-statusblocks') || /[\\/]statusblocks[\\/]index\.js/.test(cmd);
}

function installDir(): string {
  return join(homedir(), '.claude', 'statusblocks');
}

/** Stamp file in the install dir recording which version the files came from. */
const VERSION_STAMP = '.version';

/** Install-dir files that are ours but not part of dist — never sweep them. */
const KEEP_FILES = new Set(['.last-update-check', VERSION_STAMP]);

/** Would this dist entry be installed? Mirrors the tarball's test-file exclusion. */
function isInstallable(path: string): boolean {
  return !/\.test\./.test(basename(path));
}

/** The version stamped into the install dir, or '' when unstamped/unreadable. */
function installedVersion(dest: string): string {
  try {
    return readFileSync(join(dest, VERSION_STAMP), 'utf8').trim();
  } catch {
    return '';
  }
}

/** Copy dist files to ~/.claude/statusblocks/ for fast direct-node invocation */
function installFiles(): string {
  const dest = installDir();
  const distDir = dirname(fileURLToPath(import.meta.url));
  mkdirSync(dest, { recursive: true });
  cpSync(distDir, dest, { recursive: true, force: true, filter: isInstallable });
  // Sweep files a previous version installed that this one no longer ships.
  // Leftovers are live code (ESM imports resolve at run time), and a
  // mixed-version install is exactly how imports break. Copy-then-sweep, not
  // clean-then-copy, so a render racing the update never sees an empty dir.
  for (const rel of readdirSync(dest, { recursive: true }) as string[]) {
    if (KEEP_FILES.has(rel)) continue;
    if (existsSync(join(distDir, rel)) && isInstallable(rel)) continue;
    rmSync(join(dest, rel), { recursive: true, force: true });
  }
  // Stamp what's installed: the downgrade guard and the background update
  // check both compare against this.
  writeFileSync(join(dest, VERSION_STAMP), PACKAGE_VERSION);
  return dest;
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
  vim: { mode: 'NORMAL' },
  agent: { name: 'code-architect', type: 'Explore' },
  worktree: {
    name: 'feature-auth',
    path: '/tmp/worktrees/feature-auth',
    branch: 'feature/auth-rework',
    original_cwd: process.cwd(),
    original_branch: 'main',
  },
};

function preview() {
  // Preview must demo MOCK_DATA, not leak the user's real cached usage
  // (screenshots!) — the usage segment would otherwise read the live cache.
  process.env['CLAUDE_STATUSBLOCKS_NO_REMOTE'] = '1';
  const config = loadConfig();
  const widths = [120, 80, 50];

  console.log(`\n${color('claude-statusblocks', c.bold)} preview\n`);

  for (const w of widths) {
    console.log(color('─'.repeat(w), c.dim));
    console.log(color(`${w} cols:`, c.dim));
    const output = render(MOCK_DATA, w, config);
    console.log(output);
    console.log();
  }
}

function init() {
  console.log(`\n${color('claude-statusblocks', c.orange, c.bold)} setup\n`);
  try {
    // Install dist files to ~/.claude/statusblocks/ (also creates ~/.claude)
    const dest = installFiles();
    const command = statusLineCommand(dest);

    const settings = readSettings();
    const oldCommand = settings.statusLine?.command;
    settings.statusLine = { type: 'command', command, padding: 0 };
    writeFileSync(settingsPath(), JSON.stringify(settings, null, 2) + '\n');
    if (oldCommand && oldCommand !== command) console.log(`  Replaced: ${color(oldCommand, c.dim)}`);
    console.log(`  Installed: ${color(command, c.green)}`);
    console.log(`  Files:     ${color(dest, c.dim)}`);
    console.log(`  Settings:  ${color('~/.claude/settings.json', c.dim)}`);
    console.log(`\n  Run ${color('npx claude-statusblocks update', c.cyan)} to update later.\n`);
  } catch (err) {
    console.error(`  Error: Could not update ${settingsPath()}`);
    console.error(`  ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }
}

function update(force: boolean) {
  console.log(`\n${color('claude-statusblocks', c.orange, c.bold)} update\n`);
  try {
    // Downgrade guard: update is the automated path (postinstall, the daily
    // background check), and a stale npx cache once served an old package
    // here — never let it overwrite a newer install. `init` stays unguarded:
    // it's an explicit "install THIS version".
    const installed = installedVersion(installDir());
    if (!force && isNewerVersion(installed, PACKAGE_VERSION)) {
      console.log(`  Kept:     installed ${color(installed, c.green)} is newer than this package (${PACKAGE_VERSION})`);
      console.log(`  ${color('Run with --force to downgrade.', c.dim)}\n`);
      return;
    }

    const dest = installFiles();
    console.log(`  Updated:  ${color(dest, c.green)}`);

    // Migrate any stale form of our command: the old npx invocation, or the
    // pre-0.5 unquoted/backslash direct form that breaks on Windows shells
    try {
      const settings = readSettings();
      const cmd = String(settings.statusLine?.command ?? '');
      const command = statusLineCommand(dest);
      if (cmd && isOurCommand(cmd) && cmd !== command) {
        settings.statusLine = { type: 'command', ...settings.statusLine, command };
        writeFileSync(settingsPath(), JSON.stringify(settings, null, 2) + '\n');
        console.log(`  Migrated: ${color(command, c.cyan)}`);
      }
    } catch { /* settings update is best-effort */ }

    console.log();
  } catch (err) {
    console.error(`  Error: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }
}

function help() {
  console.log(`
${color('claude-statusblocks', c.orange, c.bold)} — block-based status line for Claude Code

${color('Usage:', c.bold)}
  claude-statusblocks init       Install into Claude Code settings
  claude-statusblocks update     Update installed files (--force to downgrade)
  claude-statusblocks preview    Preview with mock data at various widths
  claude-statusblocks --version  Print the installed package version
  claude-statusblocks help       Show this help

${color('Blocks:', c.bold)}
  context    Context window fill bar, percentage, token counts
  model      Model name, directory, effort, duration, version
  promo      Rate promotion status with peak/off-peak countdown
  git        Branch, staged/modified counts, lines added/removed
  usage      5-hour, 7-day, and per-model rate limit utilization
  vim        Vim mode indicator (NORMAL/INSERT)
  agent      Active agent name and type
  worktree   Worktree branch and original branch

${color('Customize:', c.bold)}
  ~/.claude-statusblocks.json:  { "segments": ["context", "model", "git"] }
  Env vars:            CLAUDE_STATUSBLOCKS_SEGMENTS=context,model
`);
}

const cmd = process.argv[2];
switch (cmd) {
  case 'init': init(); break;
  case 'update': update(process.argv.includes('--force')); break;
  case 'preview': preview(); break;
  case '--version': case '-v': console.log(PACKAGE_VERSION); break;
  case 'help': case '--help': case '-h': help(); break;
  default:
    if (process.stdin.isTTY) { help(); }
    else { import('./index.js'); }
}
