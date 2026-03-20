import type { Segment } from '../types.js';
import { color, c, visibleLength } from '../colors.js';
import { getActiveCampaign } from '../campaigns/engine.js';

export const campaignSegment: Segment = {
  id: 'promo',
  priority: 20,
  enabled: () => getActiveCampaign() !== null,
  render() {
    const status = getActiveCampaign();
    if (!status) return { id: 'promo', priority: 20, width: 0, lines: [''] };

    const { state, countdown } = status;
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

    const barWidth = Math.max(visibleLength(line1), visibleLength(line2));
    const lines = [
      line1,
      line2 || color('─'.repeat(barWidth), c.gray),
    ];

    const width = Math.max(...lines.map(visibleLength));
    return { id: 'promo', priority: 20, width, lines };
  },
};
