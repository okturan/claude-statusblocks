import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { ClaudeckConfig } from './types.js';

const CONFIG_PATH = join(homedir(), '.claudeck.json');

export function loadConfig(): ClaudeckConfig {
  // Env var overrides
  const envSegments = process.env['CLAUDECK_SEGMENTS'];
  const envTheme = process.env['CLAUDECK_THEME'];

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw) as ClaudeckConfig;
    if (envSegments) config.segments = envSegments.split(',');
    if (envTheme) config.theme = envTheme as ClaudeckConfig['theme'];
    return config;
  } catch {
    const config: ClaudeckConfig = {};
    if (envSegments) config.segments = envSegments.split(',');
    if (envTheme) config.theme = envTheme as ClaudeckConfig['theme'];
    return config;
  }
}
