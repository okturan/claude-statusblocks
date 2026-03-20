import { describe, it, expect } from 'vitest';
import { getActiveCampaign } from './engine.js';

describe('getActiveCampaign', () => {
  it('returns null or a valid campaign status', () => {
    const result = getActiveCampaign();
    if (result === null) {
      expect(result).toBeNull();
    } else {
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('countdown');
      expect(result).toHaveProperty('progress');
      expect(['active-boosted', 'active-normal', 'upcoming', 'ended', 'weekend']).toContain(result.state);
      expect(typeof result.progress).toBe('number');
      expect(result.progress).toBeGreaterThanOrEqual(0);
      expect(result.progress).toBeLessThanOrEqual(1);
    }
  });
});
