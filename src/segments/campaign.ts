import type { Segment } from '../types.js';
import { color, c, visibleLength } from '../colors.js';
import { getActiveCampaign } from '../campaigns/engine.js';

export const campaignSegment: Segment = {
  id: 'promo',
  priority: 20,
  enabled: () => getActiveCampaign() !== null,
  render() {
    const status = getActiveCampaign();
    if (!status) return { id: 'promo', priority: 4, width: 0, lines: [''] };

    const { state, countdown, progress } = status;
    let line1 = '';
    let line2 = '';

    if (state === 'weekend') {
      line1 = color('2×', c.offpeak, c.bold) + color(' off-peak', c.dim);
      line2 = countdown
        ? color('→ peak ', c.dim) + color(countdown, c.offpeak)
        : color('weekend', c.dim);
    } else if (state === 'active-boosted') {
      line1 = color('2×', c.offpeak, c.bold) + color(' off-peak', c.dim);
      line2 = countdown
        ? color('→ peak ', c.dim) + color(countdown, c.offpeak)
        : color('off-peak', c.dim);
    } else if (state === 'active-normal') {
      line1 = color('1×', c.peak, c.bold) + color(' peak', c.dim);
      line2 = countdown
        ? color('→ 2× ', c.dim) + color(countdown, c.offpeak)
        : '';
    } else if (state === 'upcoming') {
      line1 = color('2× Rates', c.dim);
      line2 = color('upcoming', c.dim);
    }

    // Build progress bar matching line1 width
    const barWidth = Math.max(visibleLength(line1), visibleLength(line2));
    const filled = Math.round(progress * barWidth);
    const empty = barWidth - filled;
    const barColor = state === 'active-normal' ? c.peak : c.offpeak;
    const bar = color('▓'.repeat(filled), barColor) + color('░'.repeat(empty), c.gray);

    const lines = [line1, bar];
    if (line2) lines.push(line2);
    // Ensure exactly 2 lines: combine bar into line2 area
    // Actually keep 2 lines: line1 + line2 with bar info
    // Simpler: line1 = status + bar, line2 = countdown
    const finalLines = [
      line1,
      line2 || color('─'.repeat(barWidth), c.gray),
    ];

    const width = Math.max(...finalLines.map(visibleLength));
    return { id: 'promo', priority: 4, width, lines: finalLines };
  },
};
