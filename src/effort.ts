import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

const EFFORT_RE = /^<local-command-stdout>Set model to[\s\S]*? with (low|medium|high|max) effort<\/local-command-stdout>$/i;

let cache: { effort: EffortLevel | null; ts: number } | null = null;
const CACHE_TTL = 5000;

/** Try transcript JSONL first (per-session, reflects /model changes), then settings.json */
export function resolveEffort(transcriptPath?: string): EffortLevel | null {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) return cache.effort;

  let effort: EffortLevel | null = null;

  // Source 1: transcript JSONL — scan from end for most recent /model change
  if (transcriptPath) {
    try {
      const content = readFileSync(transcriptPath, 'utf8');
      const lines = content.split('\n');
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
          if (match) {
            effort = match[1]!.toLowerCase() as EffortLevel;
            break;
          }
        } catch { /* skip malformed lines */ }
      }
    } catch { /* file not readable */ }
  }

  // Source 2: ~/.claude/settings.json
  if (!effort) {
    try {
      const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
      const settings = JSON.parse(readFileSync(join(configDir, 'settings.json'), 'utf8'));
      if (settings.effortLevel && ['low', 'medium', 'high', 'max'].includes(settings.effortLevel)) {
        effort = settings.effortLevel as EffortLevel;
      }
    } catch { /* no settings */ }
  }

  cache = { effort, ts: now };
  return effort;
}
