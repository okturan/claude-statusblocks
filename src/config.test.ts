import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  afterEach(() => {
    delete process.env['CLAUDE_STATUSBLOCKS_SEGMENTS'];
    delete process.env['CLAUDE_STATUSBLOCKS_THEME'];
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

  it('applies valid CLAUDE_STATUSBLOCKS_THEME env var', () => {
    process.env['CLAUDE_STATUSBLOCKS_THEME'] = 'minimal';
    const config = loadConfig();
    expect(config.theme).toBe('minimal');
  });

  it('ignores invalid theme values', () => {
    process.env['CLAUDE_STATUSBLOCKS_THEME'] = 'nope';
    const config = loadConfig();
    expect(config.theme).toBeUndefined();
  });
});
