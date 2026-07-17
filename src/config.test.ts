import { describe, it, expect, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  afterEach(() => {
    delete process.env['CLAUDE_STATUSBLOCKS_SEGMENTS'];
  });

  it('returns empty config when no file and no env vars', () => {
    const config = loadConfig();
    expect(config).toEqual({});
  });

  it('applies CLAUDE_STATUSBLOCKS_SEGMENTS env var', () => {
    process.env['CLAUDE_STATUSBLOCKS_SEGMENTS'] = 'context,model';
    const config = loadConfig();
    expect(config.segments).toEqual(['context', 'model']);
  });
});
