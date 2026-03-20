import { describe, it, expect } from 'vitest';
import { render, findOptimalAssignment, materializeAssignment } from './layout.js';
import { visibleLength } from './colors.js';
import type { StatusLineData, Block } from './types.js';

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

describe('findOptimalAssignment', () => {
  it('assigns a single block to row 0', () => {
    expect(findOptimalAssignment(1, [20], 100, 100)).toEqual([0]);
  });

  it('puts two small blocks on one row when they fit', () => {
    const result = findOptimalAssignment(2, [10, 10], 100, 100);
    expect(result).not.toBeNull();
    expect(result![0]).toBe(result![1]);
  });

  it('splits blocks across rows when they exceed maxRowWidth', () => {
    // 40+4 + 40+4 + 1gap = 89 > 50
    const result = findOptimalAssignment(2, [40, 40], 50, 50);
    expect(result).not.toBeNull();
    expect(result![0]).not.toBe(result![1]);
  });

  it('returns null when no valid assignment exists', () => {
    // 100 + 4 chrome = 104 > 50
    expect(findOptimalAssignment(1, [100], 50, 50)).toBeNull();
  });

  it('minimizes number of rows', () => {
    // 3 blocks of width 10: one row = 10+4 + 10+4 + 10+4 + 2gaps = 44 > 40, needs 2 rows
    const result = findOptimalAssignment(3, [10, 10, 10], 40, 40);
    expect(result).not.toBeNull();
    expect(new Set(result!).size).toBe(2);
  });

  it('returns null when single block exceeds row1MaxWidth', () => {
    // 15+4 = 19 > 18 (row1MaxWidth)
    expect(findOptimalAssignment(1, [15], 18, 50)).toBeNull();
  });
});

describe('materializeAssignment', () => {
  it('sorts rows by width ascending (pyramid)', () => {
    const blocks: Block[] = [
      { id: 'narrow', priority: 1, width: 10, lines: ['aaaaaaaaaa'] },
      { id: 'wide', priority: 2, width: 30, lines: ['b'.repeat(30)] },
    ];
    const groups = materializeAssignment([0, 1], blocks, [10, 30]);
    expect(groups[0]!.blocks[0]!.id).toBe('narrow');
    expect(groups[1]!.blocks[0]!.id).toBe('wide');
  });

  it('preserves block order within a row', () => {
    const blocks: Block[] = [
      { id: 'a', priority: 1, width: 5, lines: ['aaaaa'] },
      { id: 'b', priority: 2, width: 5, lines: ['bbbbb'] },
      { id: 'c', priority: 3, width: 5, lines: ['ccccc'] },
    ];
    // All on same row
    const groups = materializeAssignment([0, 0, 0], blocks, [5, 5, 5]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.blocks.map(b => b.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('render', () => {
  it('returns empty string when no segments are active', () => {
    expect(render(makeData(), 120, { segments: [] })).toBe('');
  });

  it('renders a single segment', () => {
    const result = render(makeData(), 120, { segments: ['context'] });
    expect(result).toContain('context');
  });

  it('renders multiple segments', () => {
    const result = render(makeData(), 120, { segments: ['context', 'model'] });
    expect(result).toContain('context');
    expect(result).toContain('model');
  });

  it('produces lines within terminal width', () => {
    const result = render(makeData(), 200, { segments: ['context', 'model'] });
    for (const line of result.split('\n')) {
      expect(visibleLength(line)).toBeLessThanOrEqual(200);
    }
  });

  it('wraps to more rows at narrow width', () => {
    const data = makeData({
      rate_limits: {
        five_hour: { used_percentage: 10, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        seven_day: { used_percentage: 50, resets_at: Math.floor(Date.now() / 1000) + 86400 },
      },
    });
    const wide = render(data, 200, { segments: ['context', 'model', 'usage'] });
    const narrow = render(data, 50, { segments: ['context', 'model', 'usage'] });
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
    const rowWidths: number[] = [];
    let currentMax = 0;
    for (const line of lines) {
      currentMax = Math.max(currentMax, visibleLength(line));
      if (line.replace(/\x1b\[[0-9;]*m/g, '').includes('╰')) {
        rowWidths.push(currentMax);
        currentMax = 0;
      }
    }
    if (rowWidths.length >= 2) {
      expect(rowWidths[0]).toBeLessThanOrEqual(rowWidths[rowWidths.length - 1]!);
    }
  });
});
