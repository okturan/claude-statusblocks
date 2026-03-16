import { execSync } from 'child_process';
import type { Segment } from '../types.js';
import { color, c, visibleLength } from '../colors.js';

let gitCache: { branch: string; staged: number; modified: number; added: number; removed: number; ts: number } | null = null;

function getGitInfo(cwd: string): typeof gitCache {
  const now = Date.now();
  if (gitCache && now - gitCache.ts < 5000) return gitCache;
  try {
    execSync('git rev-parse --git-dir', { cwd, stdio: 'ignore' });
    const branch = execSync('git branch --show-current', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const stagedOut = execSync('git diff --cached --numstat', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const modifiedOut = execSync('git diff --numstat', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const staged = stagedOut ? stagedOut.split('\n').length : 0;
    const modified = modifiedOut ? modifiedOut.split('\n').length : 0;
    // Count total added/removed lines from both staged and unstaged
    let added = 0, removed = 0;
    for (const line of [...(stagedOut ? stagedOut.split('\n') : []), ...(modifiedOut ? modifiedOut.split('\n') : [])]) {
      const [a, r] = line.split('\t');
      if (a && a !== '-') added += parseInt(a, 10) || 0;
      if (r && r !== '-') removed += parseInt(r, 10) || 0;
    }
    gitCache = { branch, staged, modified, added, removed, ts: now };
    return gitCache;
  } catch { return null; }
}

export const gitSegment: Segment = {
  id: 'git',
  priority: 40,
  enabled: (data) => {
    const info = getGitInfo(data.workspace.current_dir);
    return info !== null && info.branch !== '';
  },
  render(data) {
    const info = getGitInfo(data.workspace.current_dir)!;
    // Line 1: branch name
    const line1 = color(info.branch, c.cyan);
    // Line 2: file counts + line counts
    const parts: string[] = [];
    if (info.staged > 0) parts.push(color(`${info.staged} staged`, c.green));
    if (info.modified > 0) parts.push(color(`${info.modified} modified`, c.yellow));
    if (parts.length === 0) parts.push(color('clean', c.dim));
    if (info.added > 0 || info.removed > 0) {
      parts.push(`${color(`+${info.added}`, c.green)} ${color(`-${info.removed}`, c.red)}`);
    }
    const line2 = parts.join(color(' · ', c.dim));
    const lines = [line1, line2];
    const width = Math.max(...lines.map(visibleLength));
    return { id: 'git', priority: 40, width, lines };
  },
};
