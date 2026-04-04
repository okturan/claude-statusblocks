import type { Segment } from '../types.js';
import { color, c, visibleLength } from '../colors.js';

const MODE_COLORS: Record<string, string> = {
  NORMAL: c.cyan,
  INSERT: c.green,
};

export const vimSegment: Segment = {
  id: 'vim',
  priority: 50,
  enabled: (data) => !!data.vim,
  render(data) {
    const mode = data.vim?.mode ?? 'NORMAL';
    const line1 = color(mode, MODE_COLORS[mode] ?? c.dim, c.bold);
    const lines = [line1];
    const width = visibleLength(line1);
    return { id: 'vim', priority: 50, width, lines };
  },
};
