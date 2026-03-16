import type { Campaign } from '../types.js';

/**
 * Active and upcoming campaigns.
 * Update this file and publish a new version when Anthropic announces promotions.
 */
export const campaigns: Campaign[] = [
  {
    id: 'double-rates-march-2026',
    name: '2× Rates',
    start: '2026-03-13T00:00:00-04:00', // EDT (DST started Mar 8)
    end: '2026-03-27T23:59:00-07:00',   // PDT
    rules: {
      peakHours: { start: 8, end: 14, tz: 'America/New_York' },
      weekdaysOnly: true,
      multiplier: 2,
    },
    display: {
      active: { text: '2×', color: 'offpeak' },
      inactive: { text: '1×', color: 'peak' },
    },
  },
];
