import type { Segment } from '../types.js';
import { color, c, visibleLength, padRight } from '../colors.js';
import { fetchUsage } from '../usage/fetch.js';

function resetCountdown(resetAt: string): string {
  if (!resetAt) return '';
  const ms = new Date(resetAt).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d${h > 0 ? `${h}h` : ''}${m > 0 ? `${m}m` : ''}`;
  if (h > 0) return `${h}h${m > 0 ? `${m}m` : ''}`;
  return `${m}m`;
}

function miniBar(pct: number, width: number): string {
  const barColor = pct >= 90 ? c.red : pct >= 70 ? c.yellow : c.green;
  const filled = Math.round(pct * width / 100);
  const empty = width - filled;
  return color('█'.repeat(filled), barColor) + color('▒'.repeat(empty), c.gray);
}

export const usageSegment: Segment = {
  id: 'usage',
  priority: 15,
  enabled: () => {
    // Check cache only — don't trigger a fetch during layout filtering
    try { return !!fetchUsage(); } catch { return false; }
  },
  render() {
    const data = fetchUsage();
    if (!data) return { id: 'usage', priority: 2, width: 0, lines: [''] };

    const barW = 8;
    const dot = color(' · ', c.dim);

    // Line 1: 5-hour usage
    const s5 = Math.round(data.sessionUsage);
    const s5Color = s5 >= 90 ? c.red : s5 >= 70 ? c.yellow : c.green;
    const s5Reset = resetCountdown(data.sessionResetAt);
    const pct5 = padRight(color(`${s5}%`, s5Color, c.bold), 4);
    const rst5 = padRight(color('↻', c.dim) + s5Reset, 9);
    const line1 = `${miniBar(s5, barW)} ${pct5}${dot}${rst5}${dot}${color('5h', c.dim)}`;

    // Line 2: 7-day usage
    const s7 = Math.round(data.weeklyUsage);
    const s7Color = s7 >= 90 ? c.red : s7 >= 70 ? c.yellow : c.green;
    const s7Reset = resetCountdown(data.weeklyResetAt);
    const pct7 = padRight(color(`${s7}%`, s7Color, c.bold), 4);
    const rst7 = padRight(color('↻', c.dim) + s7Reset, 9);
    const line2 = `${miniBar(s7, barW)} ${pct7}${dot}${rst7}${dot}${color('7d', c.dim)}`;

    const lines = [line1, line2];
    const width = Math.max(...lines.map(visibleLength));
    return { id: 'usage', priority: 2, width, lines };
  },
};
