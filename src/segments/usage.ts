import type { Segment } from '../types.js';
import { color, c, visibleLength, padRight, pctColor } from '../colors.js';

const MS_PER_DAY = 86400000;
const MS_PER_HOUR = 3600000;
const MS_PER_MIN = 60000;

function formatResetTime(epochSec: number): string {
  if (!epochSec) return '';
  const ms = epochSec * 1000 - Date.now();
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / MS_PER_DAY);
  const h = Math.floor((ms % MS_PER_DAY) / MS_PER_HOUR);
  const m = Math.floor((ms % MS_PER_HOUR) / MS_PER_MIN);
  if (d > 0) return `${d}d${h > 0 ? `${h}h` : ''}${m > 0 ? `${m}m` : ''}`;
  if (h > 0) return `${h}h${m > 0 ? `${m}m` : ''}`;
  return `${m}m`;
}

function miniBar(pct: number, width: number): string {
  const barColor = pctColor(pct);
  const filled = Math.round(pct * width / 100);
  const empty = width - filled;
  return color('█'.repeat(filled), barColor) + color('▒'.repeat(empty), c.gray);
}

export const usageSegment: Segment = {
  id: 'usage',
  priority: 15,
  enabled: (data) => !!data.rate_limits,
  render(data) {
    const rl = data.rate_limits;
    if (!rl) return { id: 'usage', priority: 15, width: 0, lines: [''] };

    const barW = 8;
    const dot = color(' · ', c.dim);

    // Line 1: 5-hour usage
    const s5 = Math.round(rl.five_hour?.used_percentage ?? 0);
    const s5Color = pctColor(s5);
    const s5Reset = formatResetTime(rl.five_hour?.resets_at ?? 0);
    const pct5 = padRight(color(`${s5}%`, s5Color, c.bold), 4);
    const rst5 = padRight(color('↻', c.dim) + ' ' + s5Reset, 9);
    const line1 = `${miniBar(s5, barW)} ${pct5}${dot}${rst5}${dot}${color('5h', c.dim)}`;

    // Line 2: 7-day usage
    const s7 = Math.round(rl.seven_day?.used_percentage ?? 0);
    const s7Color = pctColor(s7);
    const s7Reset = formatResetTime(rl.seven_day?.resets_at ?? 0);
    const pct7 = padRight(color(`${s7}%`, s7Color, c.bold), 4);
    const rst7 = padRight(color('↻', c.dim) + ' ' + s7Reset, 9);
    const line2 = `${miniBar(s7, barW)} ${pct7}${dot}${rst7}${dot}${color('7d', c.dim)}`;

    const lines = [line1, line2];
    const width = Math.max(...lines.map(visibleLength));
    return { id: 'usage', priority: 15, width, lines };
  },
};
