import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

// Matches either:
//   - old/custom format: "<level> effort" (e.g. "with high effort")
//   - new built-in /effort format: "Set effort level to <level>"
const EFFORT_RE = /<local-command-stdout>[\s\S]*?\b(?:(low|medium|high|xhigh|max)\s+effort|effort\s+level\s+to\s+(low|medium|high|xhigh|max))\b[\s\S]*?<\/local-command-stdout>/i;
const VALID_LEVELS = new Set<EffortLevel>(['low', 'medium', 'high', 'xhigh', 'max']);

let cache: { effort: EffortLevel | null; ts: number } | null = null;
const CACHE_TTL = 5000;

/** Scan transcript JSONL from end for most recent /effort command output */
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
        if (match) return (match[1] ?? match[2])!.toLowerCase() as EffortLevel;
      } catch { /* malformed JSONL entry — skip to next line */ }
    }
  } catch { /* transcript file missing or unreadable — fall through to settings */ }
  return null;
}

/** Read persistent effortLevel from ~/.claude/settings.json */
function readEffortFromSettings(): EffortLevel | null {
  try {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    const settings = JSON.parse(readFileSync(join(configDir, 'settings.json'), 'utf8'));
    if (settings.effortLevel && VALID_LEVELS.has(settings.effortLevel)) {
      return settings.effortLevel as EffortLevel;
    }
  } catch { /* settings file missing or invalid — return null */ }
  return null;
}

/** CLAUDE_CODE_EFFORT_LEVEL env var takes precedence over all other sources */
function readEffortFromEnv(): EffortLevel | null {
  const v = process.env.CLAUDE_CODE_EFFORT_LEVEL?.toLowerCase();
  return v && VALID_LEVELS.has(v as EffortLevel) ? (v as EffortLevel) : null;
}

// Opus 4.7 always defaults to xhigh when no explicit effort source is set;
// older effort-capable models default to 'high' (or 'medium' on Pro/Max, which
// we can't detect from model id alone, so we stick to the non-plan default).
function inferDefaultFromModel(modelId?: string): EffortLevel | null {
  if (!modelId) return null;
  if (/^claude-opus-4-7\b/i.test(modelId)) return 'xhigh';
  if (/^claude-(?:opus|sonnet)-4-6\b/i.test(modelId)) return 'high';
  return null;
}

/** Resolve effort level. Priority: env → transcript → settings → model default. */
export function resolveEffort(transcriptPath?: string, modelId?: string): EffortLevel | null {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) return cache.effort;

  const effort = readEffortFromEnv()
    ?? (transcriptPath ? readEffortFromTranscript(transcriptPath) : null)
    ?? readEffortFromSettings()
    ?? inferDefaultFromModel(modelId);

  cache = { effort, ts: now };
  return effort;
}
