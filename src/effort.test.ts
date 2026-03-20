import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('resolveEffort', () => {
  const tmpDir = join(tmpdir(), `csb-effort-test-${process.pid}`);

  beforeAll(() => { mkdirSync(tmpDir, { recursive: true }); });
  afterAll(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  // Reset module cache between tests to eliminate cross-test coupling
  beforeEach(() => { vi.resetModules(); });

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

  it('returns null for empty transcript when no settings exist', async () => {
    // Point CLAUDE_CONFIG_DIR to a nonexistent path so settings fallback returns null
    const origDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = join(tmpDir, 'nonexistent');
    try {
      const { resolveEffort } = await import('./effort.js');
      const path = join(tmpDir, 'empty.jsonl');
      writeFileSync(path, '');
      expect(resolveEffort(path)).toBeNull();
    } finally {
      if (origDir !== undefined) process.env.CLAUDE_CONFIG_DIR = origDir;
      else delete process.env.CLAUDE_CONFIG_DIR;
    }
  });
});
