import type { Segment } from '../types.js';
import { color, c, visibleLength } from '../colors.js';
import { fetchUsage } from '../usage/fetch.js';

function resetCountdown(resetAt: string): string {
  if (!resetAt) return '';
  const ms = new Date(resetAt).getTime() - Date.now();
  if (ms <= 0) return 'now';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h${m > 0 ? ` ${m}m` : ''}`;
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
  enabled: () => fetchUsage() !== null,
  render() {
    const data = fetchUsage();
    if (!data) return { id: 'usage', priority: 2, width: 0, lines: [''] };

    const barW = 8;

    // Line 1: 5-hour usage
    const s5 = Math.round(data.sessionUsage);
    const s5Color = s5 >= 90 ? c.red : s5 >= 70 ? c.yellow : c.green;
    const s5Reset = resetCountdown(data.sessionResetAt);
    const line1 = `${miniBar(s5, barW)} ${color(`${s5}%`, s5Color, c.bold)}${color(' 5h', c.dim)}${s5Reset ? color(` ↻${s5Reset}`, c.dim) : ''}`;

    // Line 2: 7-day usage
    const s7 = Math.round(data.weeklyUsage);
    const s7Color = s7 >= 90 ? c.red : s7 >= 70 ? c.yellow : c.green;
    const s7Reset = resetCountdown(data.weeklyResetAt);
    const line2 = `${miniBar(s7, barW)} ${color(`${s7}%`, s7Color, c.bold)}${color(' 7d', c.dim)}${s7Reset ? color(` ↻${s7Reset}`, c.dim) : ''}`;

    const lines = [line1, line2];
    const width = Math.max(...lines.map(visibleLength));
    return { id: 'usage', priority: 2, width, lines };
  },
};
