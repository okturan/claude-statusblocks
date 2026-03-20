import { describe, it, expect } from 'vitest';
import { render } from './layout.js';
import { visibleLength } from './colors.js';
import type { StatusLineData } from './types.js';

function makeData(overrides: Partial<StatusLineData> = {}): StatusLineData {
  return {
    model: { id: 'claude-opus-4-6', display_name: 'Opus 4.6' },
    workspace: { current_dir: '/tmp/test', project_dir: '/tmp/test' },
    version: '1.0.0',
    cost: { total_cost_usd: 0, total_duration_ms: 3600000, total_api_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 },
    context_window: { context_window_size: 1000000, used_percentage: 20, remaining_percentage: 80, total_input_tokens: 200000, total_output_tokens: 0, current_usage: null },
    exceeds_200k_tokens: false,
    session_id: 'test',
    ...overrides,
  };
}

describe('render', () => {
  it('returns empty string when no segments are active', () => {
    const result = render(makeData(), 120, { segments: [] });
    expect(result).toBe('');
  });

  it('renders a single segment', () => {
    const result = render(makeData(), 120, { segments: ['context'] });
    expect(result).toContain('context');
    expect(result.split('\n').length).toBeGreaterThan(0);
  });

  it('renders multiple segments', () => {
    const result = render(makeData(), 120, { segments: ['context', 'model'] });
    expect(result).toContain('context');
    expect(result).toContain('model');
  });

  it('produces lines within maxRowWidth at wide terminal', () => {
    const result = render(makeData(), 200, { segments: ['context', 'model'] });
    for (const line of result.split('\n')) {
      expect(visibleLength(line)).toBeLessThanOrEqual(200);
    }
  });

  it('wraps to multiple rows at narrow width', () => {
    const data = makeData({
      rate_limits: {
        five_hour: { used_percentage: 10, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        seven_day: { used_percentage: 50, resets_at: Math.floor(Date.now() / 1000) + 86400 },
      },
    });
    const wide = render(data, 200, { segments: ['context', 'model', 'usage'] });
    const narrow = render(data, 50, { segments: ['context', 'model', 'usage'] });
    // Narrow should have more lines (more rows)
    expect(narrow.split('\n').length).toBeGreaterThanOrEqual(wide.split('\n').length);
  });

  it('uses pyramid shape (narrowest row first)', () => {
    const data = makeData({
      rate_limits: {
        five_hour: { used_percentage: 10, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        seven_day: { used_percentage: 50, resets_at: Math.floor(Date.now() / 1000) + 86400 },
      },
    });
    const result = render(data, 80, { segments: ['context', 'model', 'usage'] });
    const lines = result.split('\n');
    // Find row boundaries (top borders start with box drawing chars)
    const rowWidths: number[] = [];
    let currentMax = 0;
    for (const line of lines) {
      const w = visibleLength(line);
      currentMax = Math.max(currentMax, w);
      // Bottom borders end rows
      if (line.replace(/\x1b\[[0-9;]*m/g, '').includes('╰')) {
        rowWidths.push(currentMax);
        currentMax = 0;
      }
    }
    // If multiple rows, first should be <= last (pyramid)
    if (rowWidths.length >= 2) {
      expect(rowWidths[0]).toBeLessThanOrEqual(rowWidths[rowWidths.length - 1]!);
    }
  });
});
