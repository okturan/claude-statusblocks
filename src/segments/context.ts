import type { Segment } from '../types.js';
import { color, c, visibleLength, pctColor } from '../colors.js';

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
}

export const contextSegment: Segment = {
  id: 'context',
  priority: 10,
  enabled: () => true,
  render(data) {
    const pct = Math.floor(data.context_window.used_percentage ?? 0);
    const barColor = pctColor(pct);
    const total = data.context_window.context_window_size;
    const used = Math.round(pct * total / 100);

    // Line 2: percentage · used/total
    const info = `${color(`${pct}%`, barColor, c.bold)}${color(' · ', c.dim)}${color(`${formatTokens(used)}/${formatTokens(total)}`, c.dim)}`;
    const cardWidth = visibleLength(info);

    // Line 1: smooth progress bar
    const filled = Math.round(pct * cardWidth / 100);
    const empty = cardWidth - filled;
    const bar = color('█'.repeat(filled), barColor) + color('▒'.repeat(empty), c.gray);

    const lines = [bar, info];
    return { id: 'context', priority: 10, width: cardWidth, lines };
  },
};
