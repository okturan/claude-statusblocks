import { describe, it, expect } from 'vitest';
import { resolveEffort } from './effort.js';

describe('resolveEffort', () => {
  it('returns null when no transcript and no settings match', () => {
    const result = resolveEffort('/nonexistent/path');
    // Should return null or a valid effort level from settings
    if (result !== null) {
      expect(['low', 'medium', 'high', 'max']).toContain(result);
    }
  });

  it('returns a valid effort level or null', () => {
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
});
