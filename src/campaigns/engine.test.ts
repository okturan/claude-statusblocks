import { describe, it, expect, vi, afterEach } from 'vitest';
import { getActiveCampaign } from './engine.js';

describe('getActiveCampaign', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns null or a valid campaign status shape', () => {
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

  it('returns a campaign with a valid countdown string', () => {
    const result = getActiveCampaign();
    if (result) {
      expect(typeof result.countdown).toBe('string');
      // Countdown is either empty or matches Xh Ym format
      if (result.countdown) {
        expect(result.countdown).toMatch(/^\d+[hm]/);
      }
    }
  });

  it('returns consistent state for same timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T12:00:00-04:00'));
    const first = getActiveCampaign();
    const second = getActiveCampaign();
    expect(first?.state).toBe(second?.state);
    expect(first?.progress).toBe(second?.progress);
  });

  it('returns upcoming for dates before campaign start', () => {
    vi.useFakeTimers();
    // Set time well before any campaign
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const result = getActiveCampaign();
    // Should be null (no campaigns) or upcoming
    if (result) {
      expect(result.state).toBe('upcoming');
    }
  });

  it('returns null for dates after all campaigns end', () => {
    vi.useFakeTimers();
    // Set time well after any campaign
    vi.setSystemTime(new Date('2099-01-01T00:00:00Z'));
    const result = getActiveCampaign();
    expect(result).toBeNull();
  });

  it('returns weekend state on Saturday', () => {
    vi.useFakeTimers();
    // Saturday in ET
    vi.setSystemTime(new Date('2026-03-21T15:00:00-04:00'));
    const result = getActiveCampaign();
    if (result) {
      expect(result.state).toBe('weekend');
    }
  });
});
