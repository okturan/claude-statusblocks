import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

const EFFORT_RE = /^<local-command-stdout>Set model to[\s\S]*? with (low|medium|high|max) effort<\/local-command-stdout>$/i;
const VALID_LEVELS = new Set(['low', 'medium', 'high', 'max']);

let cache: { effort: EffortLevel | null; ts: number } | null = null;
const CACHE_TTL = 5000;

/** Scan transcript JSONL from end for most recent /model effort change */
function readEffortFromTranscript(path: string): EffortLevel | null {
  try {
    const lines = readFileSync(path, 'utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]!.trim();
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        const msg = entry?.message?.content ?? entry?.content ?? '';
        const text = typeof msg === 'string' ? msg : Array.isArray(msg)
          ? msg.map((b: { text?: string }) => b.text ?? '').join('')
          : '';
        const match = EFFORT_RE.exec(text);
        if (match) return match[1]!.toLowerCase() as EffortLevel;
      } catch { /* skip malformed JSONL lines */ }
    }
  } catch { /* transcript file not readable */ }
  return null;
}

/** Read effort level from ~/.claude/settings.json */
function readEffortFromSettings(): EffortLevel | null {
  try {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    const settings = JSON.parse(readFileSync(join(configDir, 'settings.json'), 'utf8'));
    if (settings.effortLevel && VALID_LEVELS.has(settings.effortLevel)) {
      return settings.effortLevel as EffortLevel;
    }
  } catch { /* no settings file */ }
  return null;
}

/** Resolve effort level: transcript (per-session) takes precedence over settings */
export function resolveEffort(transcriptPath?: string): EffortLevel | null {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) return cache.effort;

  const effort = (transcriptPath ? readEffortFromTranscript(transcriptPath) : null)
    ?? readEffortFromSettings();

  cache = { effort, ts: now };
  return effort;
}
