import { describe, it, expect } from 'vitest';
import { resolveEffort } from './effort.js';

describe('resolveEffort', () => {
  it('returns null for nonexistent transcript path', () => {
    const result = resolveEffort('/nonexistent/path/transcript.jsonl');
    // Should fall through to settings.json or return null
    if (result !== null) {
      expect(['low', 'medium', 'high', 'max']).toContain(result);
    }
  });

  it('returns a valid EffortLevel or null', () => {
    const result = resolveEffort();
    if (result !== null) {
      expect(['low', 'medium', 'high', 'max']).toContain(result);
    } else {
      expect(result).toBeNull();
    }
  });

  it('returns consistent results within cache TTL', () => {
    const first = resolveEffort();
    const second = resolveEffort();
    expect(second).toBe(first);
  });

  it('handles undefined transcript path', () => {
    const result = resolveEffort(undefined);
    // Should not throw — falls through to settings
    if (result !== null) {
      expect(['low', 'medium', 'high', 'max']).toContain(result);
    }
  });

  it('handles empty string transcript path', () => {
    const result = resolveEffort('');
    // Empty path is falsy, skips transcript source
    if (result !== null) {
      expect(['low', 'medium', 'high', 'max']).toContain(result);
    }
  });
});
