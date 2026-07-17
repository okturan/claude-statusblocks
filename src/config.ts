import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { StatusBlocksConfig } from './types.js';

export function loadConfig(): StatusBlocksConfig {
  const envSegments = process.env['CLAUDE_STATUSBLOCKS_SEGMENTS'];

  let config: StatusBlocksConfig = {};
  try {
    const raw = readFileSync(join(homedir(), '.claude-statusblocks.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (Array.isArray(parsed.segments)) config.segments = parsed.segments.filter((s: unknown) => typeof s === 'string');
      if (typeof parsed.remoteUsage === 'boolean') config.remoteUsage = parsed.remoteUsage;
    }
  } catch { /* no config file — use defaults */ }

  if (envSegments) config.segments = envSegments.split(',');
  return config;
}
