import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Must re-import to reset module cache between tests
let resolveEffort: typeof import('./effort.js').resolveEffort;

beforeEach(async () => {
  const mod = await import('./effort.js');
  resolveEffort = mod.resolveEffort;
});

describe('resolveEffort', () => {
  const tmpDir = join(tmpdir(), 'claude-statusblocks-test-effort');

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses effort from transcript JSONL', () => {
    const transcriptPath = join(tmpDir, 'transcript.jsonl');
    const lines = [
      JSON.stringify({ message: { content: '<local-command-stdout>Set model to x with low effort</local-command-stdout>' } }),
      JSON.stringify({ message: { content: 'some other message' } }),
      JSON.stringify({ message: { content: '<local-command-stdout>Set model to x with high effort</local-command-stdout>' } }),
    ];
    writeFileSync(transcriptPath, lines.join('\n') + '\n');
    const result = resolveEffort(transcriptPath);
    // Should find the LAST matching entry (high, not low)
    expect(result).toBe('high');
  });

  it('handles empty transcript file', () => {
    const transcriptPath = join(tmpDir, 'empty.jsonl');
    writeFileSync(transcriptPath, '');
    const result = resolveEffort(transcriptPath);
    // Falls through to settings
    if (result !== null) {
      expect(['low', 'medium', 'high', 'max']).toContain(result);
    }
  });

  it('handles malformed JSON lines gracefully', () => {
    const transcriptPath = join(tmpDir, 'bad.jsonl');
    writeFileSync(transcriptPath, 'not json\n{broken\n');
    const result = resolveEffort(transcriptPath);
    // Should not throw — skips bad lines
    if (result !== null) {
      expect(['low', 'medium', 'high', 'max']).toContain(result);
    }
  });
});
