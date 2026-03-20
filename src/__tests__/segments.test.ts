import { describe, it, expect } from 'vitest';
import { visibleLength } from '../colors.js';
import { contextSegment } from '../segments/context.js';
import { modelSegment } from '../segments/model.js';
import { usageSegment } from '../segments/usage.js';
import type { StatusLineData } from '../types.js';

function makeData(overrides: Partial<StatusLineData> = {}): StatusLineData {
  return {
    model: { id: 'claude-opus-4-6', display_name: 'Opus 4.6' },
    workspace: { current_dir: '/tmp/test', project_dir: '/tmp/test' },
    version: '1.0.0',
    cost: { total_cost_usd: 0, total_duration_ms: 3600000, total_api_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 },
    context_window: { context_window_size: 1000000, used_percentage: 50, remaining_percentage: 50, total_input_tokens: 500000, total_output_tokens: 0, current_usage: null },
    exceeds_200k_tokens: false,
    session_id: 'test',
    ...overrides,
  };
}

describe('contextSegment', () => {
  it('is always enabled', () => {
    expect(contextSegment.enabled(makeData())).toBe(true);
  });

  it('returns correct id and priority', () => {
    const block = contextSegment.render(makeData(), 80);
    expect(block.id).toBe('context');
    expect(block.priority).toBe(contextSegment.priority);
  });

  it('renders 2 lines (bar + info)', () => {
    const block = contextSegment.render(makeData(), 80);
    expect(block.lines).toHaveLength(2);
  });

  it('width matches max visible line length', () => {
    const block = contextSegment.render(makeData(), 80);
    const maxLineWidth = Math.max(...block.lines.map(visibleLength));
    expect(block.width).toBe(maxLineWidth);
  });
});

describe('modelSegment', () => {
  it('is always enabled', () => {
    expect(modelSegment.enabled(makeData())).toBe(true);
  });

  it('returns correct id and priority', () => {
    const block = modelSegment.render(makeData(), 80);
    expect(block.id).toBe('model');
    expect(block.priority).toBe(modelSegment.priority);
  });

  it('renders 2 lines', () => {
    const block = modelSegment.render(makeData(), 80);
    expect(block.lines).toHaveLength(2);
  });

  it('shortens long directory paths', () => {
    const data = makeData({ workspace: { current_dir: '/very/long/path/to/project', project_dir: '/very/long/path/to/project' } });
    const narrow = modelSegment.render(data, 20);
    // Should use basename when full path is too long
    expect(narrow.lines[0]).toBeDefined();
  });

  it('width matches max visible line length', () => {
    const block = modelSegment.render(makeData(), 80);
    const maxLineWidth = Math.max(...block.lines.map(visibleLength));
    expect(block.width).toBe(maxLineWidth);
  });
});

describe('usageSegment', () => {
  it('is disabled without rate_limits', () => {
    expect(usageSegment.enabled(makeData())).toBe(false);
  });

  it('is enabled with rate_limits', () => {
    const data = makeData({
      rate_limits: {
        five_hour: { used_percentage: 10, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        seven_day: { used_percentage: 50, resets_at: Math.floor(Date.now() / 1000) + 86400 },
      },
    });
    expect(usageSegment.enabled(data)).toBe(true);
  });

  it('returns correct id and priority', () => {
    const data = makeData({
      rate_limits: {
        five_hour: { used_percentage: 10, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        seven_day: { used_percentage: 50, resets_at: Math.floor(Date.now() / 1000) + 86400 },
      },
    });
    const block = usageSegment.render(data, 80);
    expect(block.id).toBe('usage');
    expect(block.priority).toBe(usageSegment.priority);
  });

  it('renders 2 lines (5h + 7d)', () => {
    const data = makeData({
      rate_limits: {
        five_hour: { used_percentage: 10, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        seven_day: { used_percentage: 50, resets_at: Math.floor(Date.now() / 1000) + 86400 },
      },
    });
    const block = usageSegment.render(data, 80);
    expect(block.lines).toHaveLength(2);
  });

  it('width matches max visible line length', () => {
    const data = makeData({
      rate_limits: {
        five_hour: { used_percentage: 10, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        seven_day: { used_percentage: 50, resets_at: Math.floor(Date.now() / 1000) + 86400 },
      },
    });
    const block = usageSegment.render(data, 80);
    const maxLineWidth = Math.max(...block.lines.map(visibleLength));
    expect(block.width).toBe(maxLineWidth);
  });
});
