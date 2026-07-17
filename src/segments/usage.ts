import type { Segment } from '../types.js';
import { color, c, visibleLength, padRight, pctColor } from '../colors.js';
import { readRemoteLimits, type RemoteLimit } from '../remote-usage.js';

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
  const filled = Math.min(width, Math.round(pct * width / 100));
  const empty = width - filled;
  return color('█'.repeat(filled), barColor) + color('▒'.repeat(empty), c.gray);
}

/**
 * The stdin `rate_limits` field only carries the two generic buckets;
 * model-scoped weekly limits (e.g. Fable) exist only in the remote usage
 * data, so that's preferred when the background refresher has populated
 * the cache. Falls back to stdin buckets whenever remote data is absent.
 *
 * Generic limits always apply; a scoped limit is only the session's
 * concern when it matches the model in use, so others are dropped.
 */
function limitsToRender(data: Parameters<Segment['render']>[0]): RemoteLimit[] {
  const remote = readRemoteLimits();
  if (remote) {
    const modelName = (data.model?.display_name ?? '').toLowerCase();
    return remote.filter(l => !l.scoped || (!!modelName && modelName.includes(l.label.toLowerCase())));
  }

  const rl = data.rate_limits;
  const out: RemoteLimit[] = [];
  if (rl?.five_hour) out.push({ label: '5h', percent: Math.round(rl.five_hour.used_percentage ?? 0), resetsAt: rl.five_hour.resets_at ?? 0 });
  if (rl?.seven_day) out.push({ label: '7d', percent: Math.round(rl.seven_day.used_percentage ?? 0), resetsAt: rl.seven_day.resets_at ?? 0 });
  return out;
}

export const usageSegment: Segment = {
  id: 'usage',
  priority: 15,
  enabled: (data) => !!data.rate_limits || readRemoteLimits() !== undefined,
  render(data) {
    const limits = limitsToRender(data);
    if (limits.length === 0) return { id: 'usage', priority: 15, width: 0, lines: [''] };

    const barW = 8;
    const dot = color(' · ', c.dim);
    const labelW = Math.max(...limits.map(l => l.label.length));

    // Surviving scoped limits belong to the session's model — that's the
    // budget being drawn down, so pop the label like the model name.
    const lines = limits.map(l => {
      const pct = padRight(color(`${l.percent}%`, pctColor(l.percent), c.bold), 4);
      const rst = padRight(color('↻', c.dim) + ' ' + formatResetTime(l.resetsAt), 9);
      const label = padRight(color(l.label, ...(l.scoped ? [c.orange, c.bold] : [c.dim])), labelW);
      return `${miniBar(l.percent, barW)} ${pct}${dot}${rst}${dot}${label}`;
    });

    const width = Math.max(...lines.map(visibleLength));
    return { id: 'usage', priority: 15, width, lines };
  },
};
