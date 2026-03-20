import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { StatusBlocksConfig } from './types.js';

const VALID_THEMES = new Set<string>(['default', 'minimal', 'full']);

export function loadConfig(): StatusBlocksConfig {
  const envSegments = process.env['CLAUDE_STATUSBLOCKS_SEGMENTS'];
  const envTheme = process.env['CLAUDE_STATUSBLOCKS_THEME'];

  let config: StatusBlocksConfig = {};
  try {
    const raw = readFileSync(join(homedir(), '.claude-statusblocks.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (Array.isArray(parsed.segments)) config.segments = parsed.segments.filter((s: unknown) => typeof s === 'string');
      if (typeof parsed.theme === 'string' && VALID_THEMES.has(parsed.theme)) config.theme = parsed.theme as StatusBlocksConfig['theme'];
    }
  } catch { /* no config file — use defaults */ }

  if (envSegments) config.segments = envSegments.split(',');
  if (envTheme && VALID_THEMES.has(envTheme)) config.theme = envTheme as StatusBlocksConfig['theme'];
  return config;
}
