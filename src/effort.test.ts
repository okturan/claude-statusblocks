import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { resolveEffort } from './effort.js';

describe('resolveEffort', () => {
  const tmpDir = join(tmpdir(), `csb-effort-test-${process.pid}`);
  const transcriptPath = join(tmpDir, 'transcript.jsonl');

  beforeAll(() => {
    mkdirSync(tmpDir, { recursive: true });
    // Write a transcript with multiple entries — last match is "max"
    const lines = [
      JSON.stringify({ message: { content: 'unrelated message' } }),
      'not valid json',
      JSON.stringify({ message: { content: '<local-command-stdout>Set model to x with low effort</local-command-stdout>' } }),
      JSON.stringify({ message: { content: '<local-command-stdout>Set model to x with max effort</local-command-stdout>' } }),
    ];
    writeFileSync(transcriptPath, lines.join('\n') + '\n');
  });

  afterAll(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('parses the last matching effort level from transcript', () => {
    // Transcript has both "low" and "max" — should return "max" (last match)
    expect(resolveEffort(transcriptPath)).toBe('max');
  });

  it('returns consistent result from cache', () => {
    // Second call within 5s cache TTL should return same value
    expect(resolveEffort(transcriptPath)).toBe('max');
  });

  it('returns a valid EffortLevel type', () => {
    const result = resolveEffort(transcriptPath);
    expect(['low', 'medium', 'high', 'max']).toContain(result);
  });

  it('returns max from cache even without transcript path', () => {
    // Cache from test 1 still holds 'max' within the 5s TTL
    expect(resolveEffort()).toBe('max');
  });
});
