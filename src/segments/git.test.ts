import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { visibleLength, stripAnsi } from '../colors.js';
import { gitSegment } from './git.js';
import type { StatusLineData } from '../types.js';

function makeData(cwd: string): StatusLineData {
  return {
    model: { id: 'test', display_name: 'Test' },
    workspace: { current_dir: cwd, project_dir: cwd },
    version: '1.0',
    cost: { total_cost_usd: 0, total_duration_ms: 0, total_api_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 },
    context_window: { context_window_size: 1000000, used_percentage: 0, remaining_percentage: 100, total_input_tokens: 0, total_output_tokens: 0, current_usage: null },
    exceeds_200k_tokens: false,
    session_id: 'test',
  };
}

// -c identity flags: CI runners have git but no configured user.name/email
function git(cwd: string, cmd: string): void {
  execSync(`git -c user.email=test@example.com -c user.name=test ${cmd}`, { cwd, stdio: 'ignore' });
}

describe('gitSegment', () => {
  it('is disabled in non-git directory', () => {
    const dir = join(tmpdir(), `csb-git-nongit-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      expect(gitSegment.enabled(makeData(dir))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renders branch, modified count, and line changes in a git repo', () => {
    // Use a unique dir so git cache doesn't interfere
    const dir = join(tmpdir(), `csb-git-full-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      git(dir, 'init -q');
      git(dir, 'checkout -q -b test-branch');
      writeFileSync(join(dir, 'file.txt'), 'hello\nworld\n');
      git(dir, 'add .');
      git(dir, 'commit -q -m init');
      // Modify file to create unstaged changes
      writeFileSync(join(dir, 'file.txt'), 'changed\nworld\nnew line\n');

      expect(gitSegment.enabled(makeData(dir))).toBe(true);
      const block = gitSegment.render(makeData(dir), 80);
      expect(block.id).toBe('git');
      expect(block.priority).toBe(40);
      expect(block.lines).toHaveLength(2);

      const stripped = block.lines.map(l => stripAnsi(l));
      expect(stripped[0]).toBe('test-branch');
      expect(stripped[1]).toContain('modified');
      expect(stripped[1]).toContain('+');
      expect(stripped[1]).toContain('-');

      const maxLineWidth = Math.max(...block.lines.map(visibleLength));
      expect(block.width).toBe(maxLineWidth);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('shows the short commit hash on detached HEAD', () => {
    const dir = join(tmpdir(), `csb-git-detached-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    try {
      git(dir, 'init -q');
      git(dir, 'checkout -q -b main');
      writeFileSync(join(dir, 'file.txt'), 'hello\n');
      git(dir, 'add .');
      git(dir, 'commit -q -m init');
      git(dir, 'checkout -q --detach');

      expect(gitSegment.enabled(makeData(dir))).toBe(true);
      const block = gitSegment.render(makeData(dir), 80);
      const branchLine = stripAnsi(block.lines[0]!);
      expect(branchLine).toMatch(/^@[0-9a-f]{4,}$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
