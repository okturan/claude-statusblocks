import { describe, it, expect, vi, afterEach } from 'vitest';
import { getActiveCampaign } from './engine.js';

describe('getActiveCampaign', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns null after all campaigns have ended', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-01-01T00:00:00Z'));
    expect(getActiveCampaign()).toBeNull();
  });

  it('returns upcoming before campaign start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T12:00:00-04:00'));
    const result = getActiveCampaign();
    expect(result).not.toBeNull();
    expect(result!.state).toBe('upcoming');
    expect(result!.progress).toBe(0);
  });

  it('returns active-normal during peak hours on weekday', () => {
    vi.useFakeTimers();
    // Wednesday 10:00 ET — within peak (8-14 ET)
    vi.setSystemTime(new Date('2026-03-18T10:00:00-04:00'));
    const result = getActiveCampaign();
    expect(result).not.toBeNull();
    expect(result!.state).toBe('active-normal');
    expect(result!.progress).toBeGreaterThan(0);
    expect(result!.progress).toBeLessThan(1);
    expect(result!.countdown).toMatch(/\d+h/);
  });

  it('returns active-boosted during off-peak hours on weekday', () => {
    vi.useFakeTimers();
    // Wednesday 20:00 ET — after peak (8-14 ET)
    vi.setSystemTime(new Date('2026-03-18T20:00:00-04:00'));
    const result = getActiveCampaign();
    expect(result).not.toBeNull();
    expect(result!.state).toBe('active-boosted');
    expect(result!.countdown).toBeTruthy();
  });

  it('returns active-boosted before peak hours on weekday', () => {
    vi.useFakeTimers();
    // Wednesday 06:00 ET — before peak (8-14 ET)
    vi.setSystemTime(new Date('2026-03-18T06:00:00-04:00'));
    const result = getActiveCampaign();
    expect(result).not.toBeNull();
    expect(result!.state).toBe('active-boosted');
    expect(result!.countdown).toMatch(/\d+h/);
  });

  it('returns weekend state on Saturday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-21T15:00:00-04:00'));
    const result = getActiveCampaign();
    expect(result).not.toBeNull();
    expect(result!.state).toBe('weekend');
    expect(result!.countdown).toBeTruthy();
  });

  it('returns weekend state on Sunday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22T10:00:00-04:00'));
    const result = getActiveCampaign();
    expect(result).not.toBeNull();
    expect(result!.state).toBe('weekend');
  });

  it('has progress between 0 and 1 for all active states', () => {
    vi.useFakeTimers();
    for (const time of [
      '2026-03-18T10:00:00-04:00', // peak
      '2026-03-18T20:00:00-04:00', // off-peak
      '2026-03-21T15:00:00-04:00', // weekend
    ]) {
      vi.setSystemTime(new Date(time));
      const result = getActiveCampaign();
      if (result) {
        expect(result.progress).toBeGreaterThanOrEqual(0);
        expect(result.progress).toBeLessThanOrEqual(1);
      }
    }
  });

  it('returns consistent results for same timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T10:00:00-04:00'));
    const a = getActiveCampaign();
    const b = getActiveCampaign();
    expect(a?.state).toBe(b?.state);
    expect(a?.progress).toBe(b?.progress);
    expect(a?.countdown).toBe(b?.countdown);
  });

  it('transitions at exact peak start boundary (08:00 ET)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T08:00:00-04:00'));
    const result = getActiveCampaign();
    expect(result).not.toBeNull();
    // 08:00 ET is >= peakStart (8*3600), so should be peak
    expect(result!.state).toBe('active-normal');
    expect(result!.progress).toBe(0);
  });

  it('transitions at exact peak end boundary (14:00 ET)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T14:00:00-04:00'));
    const result = getActiveCampaign();
    expect(result).not.toBeNull();
    // 14:00 ET is NOT < peakEnd (14*3600), so should be off-peak
    expect(result!.state).toBe('active-boosted');
  });

  it('is peak one second before peak end', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T13:59:59-04:00'));
    const result = getActiveCampaign();
    expect(result).not.toBeNull();
    expect(result!.state).toBe('active-normal');
  });

  it('has campaign metadata on all active states', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T10:00:00-04:00'));
    const result = getActiveCampaign();
    expect(result).not.toBeNull();
    expect(result!.campaign).toHaveProperty('id');
    expect(result!.campaign).toHaveProperty('name');
    expect(result!.campaign).toHaveProperty('rules');
  });
});
