import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { ClaudelineConfig } from './types.js';

const CONFIG_PATH = join(homedir(), '.claudeline.json');

export function loadConfig(): ClaudelineConfig {
  // Env var overrides
  const envSegments = process.env['CLAUDELINE_SEGMENTS'];
  const envTheme = process.env['CLAUDELINE_THEME'];

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw) as ClaudelineConfig;
    if (envSegments) config.segments = envSegments.split(',');
    if (envTheme) config.theme = envTheme as ClaudelineConfig['theme'];
    return config;
  } catch {
    const config: ClaudelineConfig = {};
    if (envSegments) config.segments = envSegments.split(',');
    if (envTheme) config.theme = envTheme as ClaudelineConfig['theme'];
    return config;
  }
}
