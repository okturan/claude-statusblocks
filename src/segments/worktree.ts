import type { Segment } from '../types.js';
import { color, c, visibleLength } from '../colors.js';

export const worktreeSegment: Segment = {
  id: 'worktree',
  priority: 45,
  enabled: (data) => !!data.worktree,
  render(data) {
    const wt = data.worktree!;
    const line1 = color(wt.branch ?? wt.name, c.cyan, c.bold);
    const line2 = wt.original_branch
      ? color('← ', c.dim) + color(wt.original_branch, c.dim)
      : '';
    const lines = line2 ? [line1, line2] : [line1];
    const width = Math.max(...lines.map(visibleLength));
    return { id: 'worktree', priority: 45, width, lines };
  },
};
