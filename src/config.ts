import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { StatusBlocksConfig } from './types.js';

const CONFIG_PATH = join(homedir(), '.claude-statusblocks.json');

export function loadConfig(): StatusBlocksConfig {
  // Env var overrides
  const envSegments = process.env['CLAUDE_STATUSBLOCKS_SEGMENTS'];
  const envTheme = process.env['CLAUDE_STATUSBLOCKS_THEME'];

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw) as StatusBlocksConfig;
    if (envSegments) config.segments = envSegments.split(',');
    if (envTheme) config.theme = envTheme as StatusBlocksConfig['theme'];
    return config;
  } catch {
    const config: StatusBlocksConfig = {};
    if (envSegments) config.segments = envSegments.split(',');
    if (envTheme) config.theme = envTheme as StatusBlocksConfig['theme'];
    return config;
  }
}
