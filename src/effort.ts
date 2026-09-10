import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

// Matches either:
//   - old/custom format: "<level> effort" (e.g. "with high effort")
//   - new built-in /effort format: "Set effort level to <level>"
// `/effort ultracode` is accepted by Claude Code and resolves to xhigh (ultracode
// forces xhigh); it must be matched too, or the scan would fall through to an
// older /effort line and show a stale level.
const EFFORT_RE = /<local-command-stdout>[\s\S]*?\b(?:(low|medium|high|xhigh|max|ultracode)\s+effort|effort\s+level\s+to\s+(low|medium|high|xhigh|max|ultracode))\b[\s\S]*?<\/local-command-stdout>/i;
const VALID_LEVELS = new Set<EffortLevel>(['low', 'medium', 'high', 'xhigh', 'max']);

/** Map a raw level string (payload, transcript, env) to a valid EffortLevel or null */
function normalizeLevel(raw: unknown): EffortLevel | null {
  if (typeof raw !== 'string') return null;
  const v = raw.toLowerCase();
  if (v === 'ultracode') return 'xhigh';
  return VALID_LEVELS.has(v as EffortLevel) ? (v as EffortLevel) : null;
}

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
        if (match) return normalizeLevel((match[1] ?? match[2])!);
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

/** CLAUDE_EFFORT — canonical active effort exposed by Claude Code ≥2.1.133 to hooks
 *  and Bash subprocesses. Reflects the level CC is actually using after override resolution. */
function readActiveEffortEnv(): EffortLevel | null {
  const v = process.env.CLAUDE_EFFORT?.toLowerCase();
  return v && VALID_LEVELS.has(v as EffortLevel) ? (v as EffortLevel) : null;
}

/** CLAUDE_CODE_EFFORT_LEVEL — legacy user override env (commonly set in shell rc or
 *  settings.json env block). Demoted to lowest env source so transcript /effort updates
 *  are still visible in the status line for users who have it pinned. */
function readLegacyOverrideEnv(): EffortLevel | null {
  const v = process.env.CLAUDE_CODE_EFFORT_LEVEL?.toLowerCase();
  return v && VALID_LEVELS.has(v as EffortLevel) ? (v as EffortLevel) : null;
}

// Best-effort lineage defaults when no explicit effort source is set:
// Opus 4.7+ defaults to xhigh; the 4.6 generation and Sonnet 5 default to
// 'high' (or 'medium' on Pro/Max, which we can't detect from model id alone,
// so we stick to the non-plan default). Fable/Mythos 5 defaults are
// unverified, so we show nothing rather than guess.
function inferDefaultFromModel(modelId?: string): EffortLevel | null {
  if (!modelId) return null;
  if (/^claude-opus-4-[7-9]\b/i.test(modelId)) return 'xhigh';
  if (/^claude-(?:opus|sonnet)-4-6\b/i.test(modelId)) return 'high';
  if (/^claude-sonnet-5\b/i.test(modelId)) return 'high';
  return null;
}

/** Resolve effort level.
 *  Priority: payload effort.level → transcript /effort → $CLAUDE_EFFORT → settings.effortLevel
 *            → CLAUDE_CODE_EFFORT_LEVEL → model default.
 *
 *  The payload level is what Claude Code is actually using after every override
 *  (ultracode forces xhigh and ignores modelSettings; /effort ultracode; per-model
 *  settings), so it always wins when present. The heuristics below only serve
 *  older Claude Code versions that don't send it. Transcript beats env so /effort
 *  updates show even when CLAUDE_CODE_EFFORT_LEVEL is pinned in the user's shell. */
export function resolveEffort(transcriptPath?: string, modelId?: string, payloadLevel?: string): EffortLevel | null {
  const fromPayload = normalizeLevel(payloadLevel);
  if (fromPayload) return fromPayload;

  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL) return cache.effort;

  const effort = (transcriptPath ? readEffortFromTranscript(transcriptPath) : null)
    ?? readActiveEffortEnv()
    ?? readEffortFromSettings()
    ?? readLegacyOverrideEnv()
    ?? inferDefaultFromModel(modelId);

  cache = { effort, ts: now };
  return effort;
}
