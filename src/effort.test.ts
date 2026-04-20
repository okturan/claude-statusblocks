import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('resolveEffort', () => {
  const tmpDir = join(tmpdir(), `csb-effort-test-${process.pid}`);
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(() => { mkdirSync(tmpDir, { recursive: true }); });
  afterAll(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  // Reset module cache and env between tests so a developer's shell can't shadow expected fallbacks
  beforeEach(() => {
    vi.resetModules();
    for (const k of ['CLAUDE_CODE_EFFORT_LEVEL', 'CLAUDE_CONFIG_DIR']) {
      savedEnv[k] = process.env[k];
      delete process.env[k];
    }
    // Point settings lookup at an empty dir by default so tests aren't affected by ~/.claude/settings.json
    process.env.CLAUDE_CONFIG_DIR = join(tmpDir, 'empty-config');
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('parses the last matching effort from transcript JSONL', async () => {
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'multi.jsonl');
    const lines = [
      JSON.stringify({ message: { content: '<local-command-stdout>Set model to x with low effort</local-command-stdout>' } }),
      JSON.stringify({ message: { content: 'unrelated message' } }),
      JSON.stringify({ message: { content: '<local-command-stdout>Set model to x with max effort</local-command-stdout>' } }),
    ];
    writeFileSync(path, lines.join('\n') + '\n');
    expect(resolveEffort(path)).toBe('max');
  });

  it('parses the new built-in /effort command format', async () => {
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'new-format.jsonl');
    writeFileSync(path, JSON.stringify({
      message: { content: '<local-command-stdout>Set effort level to xhigh (this session only): Best results for most coding and agentic tasks</local-command-stdout>' }
    }) + '\n');
    expect(resolveEffort(path)).toBe('xhigh');
  });

  it('parses max from the new built-in /effort format', async () => {
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'new-format-max.jsonl');
    writeFileSync(path, JSON.stringify({
      message: { content: '<local-command-stdout>Set effort level to max (this session only): Maximum capability with deepest reasoning</local-command-stdout>' }
    }) + '\n');
    expect(resolveEffort(path)).toBe('max');
  });

  it('skips malformed JSON lines without throwing', async () => {
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'bad.jsonl');
    const lines = [
      'not valid json',
      '{broken',
      JSON.stringify({ message: { content: '<local-command-stdout>Set model to x with medium effort</local-command-stdout>' } }),
    ];
    writeFileSync(path, lines.join('\n') + '\n');
    expect(resolveEffort(path)).toBe('medium');
  });

  it('returns cached result on second call within TTL', async () => {
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'cached.jsonl');
    writeFileSync(path, JSON.stringify({
      message: { content: '<local-command-stdout>Set model to x with high effort</local-command-stdout>' }
    }) + '\n');
    const first = resolveEffort(path);
    const second = resolveEffort(path);
    expect(first).toBe('high');
    expect(second).toBe('high');
  });

  it('matches effort even if output format changes', async () => {
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'alt-format.jsonl');
    // Simulate a different output format that still contains "X effort" within the tag
    writeFileSync(path, JSON.stringify({
      message: { content: '<local-command-stdout>Model changed — now using high effort</local-command-stdout>' }
    }) + '\n');
    expect(resolveEffort(path)).toBe('high');
  });

  it('matches effort when surrounded by other content', async () => {
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'embedded.jsonl');
    writeFileSync(path, JSON.stringify({
      message: { content: 'prefix text <local-command-stdout>Set model to x with low effort</local-command-stdout> suffix text' }
    }) + '\n');
    expect(resolveEffort(path)).toBe('low');
  });

  it('returns null for empty transcript when no settings, env, or model default apply', async () => {
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'empty.jsonl');
    writeFileSync(path, '');
    expect(resolveEffort(path)).toBeNull();
  });

  it('ignores legacy alwaysThinkingEnabled (no longer a valid source)', async () => {
    const configDir = join(tmpDir, 'legacy-config');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ alwaysThinkingEnabled: true }));
    process.env.CLAUDE_CONFIG_DIR = configDir;
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'legacy.jsonl');
    writeFileSync(path, '');
    expect(resolveEffort(path)).toBeNull();
  });

  it('reads effortLevel from settings.json (including xhigh)', async () => {
    const configDir = join(tmpDir, 'persistent-config');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ effortLevel: 'xhigh' }));
    process.env.CLAUDE_CONFIG_DIR = configDir;
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'settings.jsonl');
    writeFileSync(path, '');
    expect(resolveEffort(path)).toBe('xhigh');
  });

  it('env CLAUDE_CODE_EFFORT_LEVEL takes precedence over transcript and settings', async () => {
    const configDir = join(tmpDir, 'env-override-config');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'settings.json'), JSON.stringify({ effortLevel: 'low' }));
    process.env.CLAUDE_CONFIG_DIR = configDir;
    process.env.CLAUDE_CODE_EFFORT_LEVEL = 'max';
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'env-override.jsonl');
    writeFileSync(path, JSON.stringify({
      message: { content: '<local-command-stdout>Set effort level to high (this session only): ...</local-command-stdout>' }
    }) + '\n');
    expect(resolveEffort(path)).toBe('max');
  });

  it('falls back to xhigh for Opus 4.7 when nothing else is set', async () => {
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'opus47.jsonl');
    writeFileSync(path, '');
    expect(resolveEffort(path, 'claude-opus-4-7')).toBe('xhigh');
    // Module cache persists the first answer; this second call just confirms the signature accepts model id.
  });

  it('falls back to xhigh for Opus 4.7 with 1M suffix', async () => {
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'opus47-1m.jsonl');
    writeFileSync(path, '');
    expect(resolveEffort(path, 'claude-opus-4-7[1m]')).toBe('xhigh');
  });

  it('falls back to high for Opus 4.6 / Sonnet 4.6', async () => {
    const { resolveEffort: r1 } = await import('./effort.js');
    const path = join(tmpDir, 'opus46.jsonl');
    writeFileSync(path, '');
    expect(r1(path, 'claude-opus-4-6')).toBe('high');
  });

  it('returns null for unknown models when no other source', async () => {
    const { resolveEffort } = await import('./effort.js');
    const path = join(tmpDir, 'unknown-model.jsonl');
    writeFileSync(path, '');
    expect(resolveEffort(path, 'claude-haiku-4-5-20251001')).toBeNull();
  });
});
