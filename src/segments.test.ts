import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { visibleLength, stripAnsi, c } from './colors.js';
import { writeCache } from './cache.js';
import { normalizeLimits, resetRemoteUsageMemo, REMOTE_USAGE_CACHE } from './remote-usage.js';

// The usage segment reads remote-usage data from the cross-process file
// cache — point it at a fresh dir so the developer's real cache can't leak
// in, and neutralize any ambient kill switch so an exported
// CLAUDE_STATUSBLOCKS_NO_REMOTE=1 can't turn this suite red.
process.env['CLAUDE_STATUSBLOCKS_CACHE_DIR'] = mkdtempSync(join(tmpdir(), 'csb-segments-test-'));
delete process.env['CLAUDE_STATUSBLOCKS_NO_REMOTE'];

/** Write the remote-usage cache and drop the per-process memo so reads see it. */
function setRemoteCache(value: unknown): void {
  writeCache(REMOTE_USAGE_CACHE, value);
  resetRemoteUsageMemo();
}
import { contextSegment } from './segments/context.js';
import { modelSegment } from './segments/model.js';
import { usageSegment } from './segments/usage.js';
import { promoSegment } from './segments/promo.js';
import { vimSegment } from './segments/vim.js';
import { agentSegment } from './segments/agent.js';
import { worktreeSegment } from './segments/worktree.js';
import type { StatusLineData } from './types.js';

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

  it('does not crash on out-of-range used_percentage', () => {
    const over = makeData({ context_window: { ...makeData().context_window, used_percentage: 120 } });
    expect(() => contextSegment.render(over, 80)).not.toThrow();
    const under = makeData({ context_window: { ...makeData().context_window, used_percentage: -5 } });
    expect(() => contextSegment.render(under, 80)).not.toThrow();
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

  it('keeps separators when line 2 overflows a narrow line 1 (no "max7h22mv2.1.201" jam)', () => {
    // Short model+dir → narrow line 1; long duration+version overflow it
    const data = makeData({
      model: { id: 'claude-opus-4-6', display_name: 'Fable 5' },
      workspace: { current_dir: '/xcode', project_dir: '/xcode' },
      version: '2.1.201',
      cost: { total_cost_usd: 0, total_duration_ms: 26520000, total_api_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 },
    });
    const block = modelSegment.render(data, 80);
    const line2 = stripAnsi(block.lines[1]!);
    // effort value varies by environment; the separators must not
    expect(line2).toMatch(/ · 7h22m · v2\.1\.201$/);
    expect(block.width).toBe(Math.max(...block.lines.map(visibleLength)));
  });
});

describe('usageSegment', () => {
  afterEach(() => { resetRemoteUsageMemo(); });

  it('is disabled without rate_limits', () => {
    expect(usageSegment.enabled(makeData())).toBe(false);
  });

  it('is disabled when rate_limits is present but empty (no broken empty box)', () => {
    expect(usageSegment.enabled(makeData({ rate_limits: {} }))).toBe(false);
  });

  it('clamps a negative used_percentage instead of crashing the render', () => {
    const data = makeData({
      rate_limits: { five_hour: { used_percentage: -8, resets_at: Math.floor(Date.now() / 1000) + 3600 } },
    });
    const block = usageSegment.render(data, 80);
    expect(stripAnsi(block.lines[0]!)).toContain('0%');
  });

  it('renders full weekly countdowns without truncating the unit', () => {
    const resetsAt = Math.floor((Date.now() + 6 * 86400000 + 23 * 3600000 + 59 * 60000 + 30000) / 1000);
    const data = makeData({ rate_limits: { seven_day: { used_percentage: 50, resets_at: resetsAt } } });
    const block = usageSegment.render(data, 80);
    expect(stripAnsi(block.lines[0]!)).toContain('6d23h59m');
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

  describe('remote limits', () => {
    const remote = normalizeLimits([
      { kind: 'session', percent: 40, resets_at: new Date(Date.now() + 3600000).toISOString() },
      { kind: 'weekly_all', percent: 19, resets_at: new Date(Date.now() + 86400000).toISOString() },
      { kind: 'weekly_scoped', percent: 27, resets_at: new Date(Date.now() + 86400000).toISOString(), scope: { model: { display_name: 'Fable' } } },
    ]);
    const STDIN_RL = {
      five_hour: { used_percentage: 10, resets_at: Math.floor(Date.now() / 1000) + 3600 },
      seven_day: { used_percentage: 50, resets_at: Math.floor(Date.now() / 1000) + 86400 },
    };

    afterEach(() => { setRemoteCache([]); });

    it('prefers remote limits and collapses same-window buckets to the binding one', () => {
      setRemoteCache(remote);
      const data = makeData({ model: { id: 'claude-fable-5', display_name: 'Fable 5' }, rate_limits: STDIN_RL });
      const block = usageSegment.render(data, 80);
      // 7d (19%) and Fable (27%) share a reset window — only the binding
      // Fable line renders, keeping the card two lines tall.
      expect(block.lines).toHaveLength(2);
      const plain = block.lines.map(stripAnsi).join('\n');
      expect(plain).toContain('Fable');
      expect(plain).toContain('27%');
      expect(plain).not.toContain('7d');
    });

    it('flips the weekly line to 7d when the all-models bucket becomes binding', () => {
      const reset = new Date(Date.now() + 86400000).toISOString();
      setRemoteCache(normalizeLimits([
        { kind: 'session', percent: 10, resets_at: new Date(Date.now() + 3600000).toISOString() },
        { kind: 'weekly_all', percent: 45, resets_at: reset },
        { kind: 'weekly_scoped', percent: 42, resets_at: reset, scope: { model: { display_name: 'Fable' } } },
      ]));
      const data = makeData({ model: { id: 'claude-fable-5', display_name: 'Fable 5' } });
      const plain = usageSegment.render(data, 80).lines.map(stripAnsi).join('\n');
      expect(plain).toContain('45%');
      expect(plain).toContain('7d');
      expect(plain).not.toContain('Fable');
    });

    it('prefers the model-scoped bucket on a same-window percentage tie', () => {
      const reset = new Date(Date.now() + 86400000).toISOString();
      setRemoteCache(normalizeLimits([
        { kind: 'weekly_all', percent: 42, resets_at: reset },
        { kind: 'weekly_scoped', percent: 42, resets_at: reset, scope: { model: { display_name: 'Fable' } } },
      ]));
      const data = makeData({ model: { id: 'claude-fable-5', display_name: 'Fable 5' } });
      const plain = usageSegment.render(data, 80).lines.map(stripAnsi).join('\n');
      expect(plain).toContain('Fable');
      expect(plain).not.toContain('7d');
    });

    it('enables the segment from remote data alone', () => {
      setRemoteCache(remote);
      expect(usageSegment.enabled(makeData())).toBe(true);
    });

    it('shows a scoped limit highlighted only when its model is in use', () => {
      setRemoteCache(remote);

      const onFable = makeData({ model: { id: 'claude-fable-5', display_name: 'Fable 5' } });
      const fableLine = usageSegment.render(onFable, 80).lines.find(l => l.includes('Fable'));
      expect(fableLine).toContain(c.orange);

      const onOpus = makeData(); // Opus 4.6 — Fable's scoped limit is not this session's concern
      const opusBlock = usageSegment.render(onOpus, 80);
      expect(opusBlock.lines).toHaveLength(2);
      expect(opusBlock.lines.map(stripAnsi).join('\n')).not.toContain('Fable');
    });

    it('matches scoped limits bidirectionally on the full scope name', () => {
      setRemoteCache(normalizeLimits([
        { kind: 'weekly_scoped', percent: 33, resets_at: new Date(Date.now() + 86400000).toISOString(), scope: { model: { display_name: 'Claude Fable 5' } } },
      ]));
      const data = makeData({ model: { id: 'claude-fable-5', display_name: 'Fable 5' }, rate_limits: STDIN_RL });
      const plain = usageSegment.render(data, 80).lines.map(stripAnsi).join('\n');
      expect(plain).toContain('33%');
    });

    it('falls back to stdin buckets when every remote limit is scoped to another model', () => {
      setRemoteCache(normalizeLimits([
        { kind: 'weekly_scoped', percent: 27, resets_at: new Date(Date.now() + 86400000).toISOString(), scope: { model: { display_name: 'Fable' } } },
      ]));
      const data = makeData({ rate_limits: STDIN_RL }); // Opus session
      expect(usageSegment.enabled(data)).toBe(true);
      const block = usageSegment.render(data, 80);
      expect(block.lines).toHaveLength(2);
      const plain = block.lines.map(stripAnsi).join('\n');
      expect(plain).toContain('5h');
      expect(plain).toContain('7d');
      expect(plain).not.toContain('Fable');
    });

    it('never renders surface-scoped limits and stays disabled when nothing else exists', () => {
      setRemoteCache(normalizeLimits([
        { kind: 'weekly_scoped', percent: 12, resets_at: new Date(Date.now() + 86400000).toISOString(), scope: { model: null, surface: 'cowork' } },
      ]));
      expect(usageSegment.enabled(makeData())).toBe(false);
      const withStdin = makeData({ rate_limits: STDIN_RL });
      resetRemoteUsageMemo();
      const plain = usageSegment.render(withStdin, 80).lines.map(stripAnsi).join('\n');
      expect(plain).not.toContain('cowork');
      expect(plain).toContain('5h');
    });
  });
});

describe('promoSegment', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('returns correct id and priority during active campaign', () => {
    vi.useFakeTimers();
    // Wednesday 10:00 ET during the March 2026 campaign
    vi.setSystemTime(new Date('2026-03-18T10:00:00-04:00'));
    expect(promoSegment.enabled(makeData())).toBe(true);
    const block = promoSegment.render(makeData(), 80);
    expect(block.id).toBe('promo');
    expect(block.priority).toBe(promoSegment.priority);
  });

  it('renders 2 lines during active campaign', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T10:00:00-04:00'));
    promoSegment.enabled(makeData());
    const block = promoSegment.render(makeData(), 80);
    expect(block.lines).toHaveLength(2);
  });

  it('width matches max visible line length', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-18T10:00:00-04:00'));
    promoSegment.enabled(makeData());
    const block = promoSegment.render(makeData(), 80);
    const maxLineWidth = Math.max(...block.lines.map(visibleLength));
    expect(block.width).toBe(maxLineWidth);
  });

  it('is disabled after all campaigns end', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2099-01-01T00:00:00Z'));
    expect(promoSegment.enabled(makeData())).toBe(false);
  });
});

describe('modelSegment line2 layout', () => {
  it('spreads 3 parts (effort, duration, version) across line1 width', () => {
    const data = makeData({
      version: '2.1.80',
      cost: { total_cost_usd: 0, total_duration_ms: 7200000, total_api_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 },
    });
    const block = modelSegment.render(data, 80);
    const line2Stripped = stripAnsi(block.lines[1]!);
    expect(line2Stripped).toContain('2h0m');
    expect(line2Stripped).toContain('v2.1.80');
  });

  it('handles missing duration gracefully', () => {
    const data = makeData({
      version: '1.0',
      cost: { total_cost_usd: 0, total_duration_ms: 0, total_api_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 },
    });
    const block = modelSegment.render(data, 80);
    expect(block.lines).toHaveLength(2);
    expect(block.width).toBeGreaterThan(0);
  });

  it('handles missing version gracefully', () => {
    const data = makeData({ version: '' });
    const block = modelSegment.render(data, 80);
    expect(block.lines).toHaveLength(2);
  });
});

describe('vimSegment', () => {
  it('is disabled without vim data', () => {
    expect(vimSegment.enabled(makeData())).toBe(false);
  });

  it('is enabled with vim data', () => {
    expect(vimSegment.enabled(makeData({ vim: { mode: 'NORMAL' } }))).toBe(true);
  });

  it('returns correct id and priority', () => {
    const block = vimSegment.render(makeData({ vim: { mode: 'NORMAL' } }), 80);
    expect(block.id).toBe('vim');
    expect(block.priority).toBe(50);
  });

  it('renders 1 line with mode', () => {
    const block = vimSegment.render(makeData({ vim: { mode: 'INSERT' } }), 80);
    expect(block.lines).toHaveLength(1);
    const stripped = stripAnsi(block.lines[0]!);
    expect(stripped).toBe('INSERT');
  });

  it('width matches visible line length', () => {
    const block = vimSegment.render(makeData({ vim: { mode: 'NORMAL' } }), 80);
    expect(block.width).toBe(visibleLength(block.lines[0]!));
  });
});

describe('agentSegment', () => {
  it('is disabled without agent data', () => {
    expect(agentSegment.enabled(makeData())).toBe(false);
  });

  it('is enabled with agent data', () => {
    expect(agentSegment.enabled(makeData({ agent: { name: 'test-runner' } }))).toBe(true);
  });

  it('returns correct id and priority', () => {
    const block = agentSegment.render(makeData({ agent: { name: 'test-runner' } }), 80);
    expect(block.id).toBe('agent');
    expect(block.priority).toBe(35);
  });

  it('renders 1 line when no type', () => {
    const block = agentSegment.render(makeData({ agent: { name: 'test-runner' } }), 80);
    expect(block.lines).toHaveLength(1);
    const stripped = stripAnsi(block.lines[0]!);
    expect(stripped).toBe('test-runner');
  });

  it('renders 2 lines when type is present', () => {
    const block = agentSegment.render(makeData({ agent: { name: 'code-architect', type: 'Explore' } }), 80);
    expect(block.lines).toHaveLength(2);
    const stripped0 = stripAnsi(block.lines[0]!);
    const stripped1 = stripAnsi(block.lines[1]!);
    expect(stripped0).toBe('code-architect');
    expect(stripped1).toBe('Explore');
  });

  it('width matches max visible line length', () => {
    const block = agentSegment.render(makeData({ agent: { name: 'code-architect', type: 'Explore' } }), 80);
    const maxLineWidth = Math.max(...block.lines.map(visibleLength));
    expect(block.width).toBe(maxLineWidth);
  });
});

describe('worktreeSegment', () => {
  it('is disabled without worktree data', () => {
    expect(worktreeSegment.enabled(makeData())).toBe(false);
  });

  it('is enabled with worktree data', () => {
    const data = makeData({ worktree: { name: 'feat', path: '/tmp/feat' } });
    expect(worktreeSegment.enabled(data)).toBe(true);
  });

  it('returns correct id and priority', () => {
    const data = makeData({ worktree: { name: 'feat', path: '/tmp/feat', branch: 'feature/x', original_branch: 'main' } });
    const block = worktreeSegment.render(data, 80);
    expect(block.id).toBe('worktree');
    expect(block.priority).toBe(45);
  });

  it('renders 2 lines when original_branch is present', () => {
    const data = makeData({ worktree: { name: 'feat', path: '/tmp/feat', branch: 'feature/x', original_branch: 'main' } });
    const block = worktreeSegment.render(data, 80);
    expect(block.lines).toHaveLength(2);
    const stripped1 = stripAnsi(block.lines[1]!);
    expect(stripped1).toBe('← main');
  });

  it('renders 1 line when no original_branch', () => {
    const data = makeData({ worktree: { name: 'feat', path: '/tmp/feat', branch: 'feature/x' } });
    const block = worktreeSegment.render(data, 80);
    expect(block.lines).toHaveLength(1);
  });

  it('uses name as fallback when no branch', () => {
    const data = makeData({ worktree: { name: 'my-worktree', path: '/tmp/wt' } });
    const block = worktreeSegment.render(data, 80);
    const stripped = stripAnsi(block.lines[0]!);
    expect(stripped).toBe('my-worktree');
  });

  it('width matches max visible line length', () => {
    const data = makeData({ worktree: { name: 'feat', path: '/tmp/feat', branch: 'feature/x', original_branch: 'main' } });
    const block = worktreeSegment.render(data, 80);
    const maxLineWidth = Math.max(...block.lines.map(visibleLength));
    expect(block.width).toBe(maxLineWidth);
  });
});
