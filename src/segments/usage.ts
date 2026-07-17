import type { Segment, StatusLineData } from '../types.js';
import { color, c, visibleLength, padRight, pctColor, renderBar } from '../colors.js';
import { readRemoteLimits, KIND_LABELS, type RemoteLimit } from '../remote-usage.js';

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

/**
 * Is a model-scoped limit the session's own? Prefer id equality when the
 * server populates ids; otherwise a bidirectional substring test on the
 * FULL scope name (not the truncated display label), so 'Claude Fable 5'
 * vs a stdin 'Fable 5' still matches. Surface-scoped limits never match —
 * the statusline is not that surface.
 */
function matchesModel(l: RemoteLimit, data: StatusLineData): boolean {
  if (l.scope !== 'model') return false;
  const id = (data.model?.id ?? '').toLowerCase();
  if (l.id && id && l.id.toLowerCase() === id) return true;
  const name = (data.model?.display_name ?? '').toLowerCase();
  const key = l.match ?? l.label.toLowerCase();
  return !!name && !!key && (name.includes(key) || key.includes(name));
}

function clampPercent(v: number | undefined): number {
  return Math.min(999, Math.max(0, Math.round(v ?? 0)));
}

function stdinLimits(data: StatusLineData): RemoteLimit[] {
  const rl = data.rate_limits;
  const out: RemoteLimit[] = [];
  if (rl?.five_hour) out.push({ label: KIND_LABELS['session']!, percent: clampPercent(rl.five_hour.used_percentage), resetsAt: rl.five_hour.resets_at ?? 0 });
  if (rl?.seven_day) out.push({ label: KIND_LABELS['weekly_all']!, percent: clampPercent(rl.seven_day.used_percentage), resetsAt: rl.seven_day.resets_at ?? 0 });
  return out;
}

/**
 * The stdin `rate_limits` field only carries the two generic buckets;
 * model-scoped weekly limits (e.g. Fable) exist only in the remote usage
 * data, so that's preferred when the background refresher has populated
 * the cache. Generic limits always apply; scoped limits render only for
 * the model in use. Whenever remote data yields nothing visible — absent,
 * expired, or entirely filtered out — fall back to the stdin buckets so
 * valid 5h/7d data is never discarded.
 */
function limitsToRender(data: StatusLineData): RemoteLimit[] {
  const remote = readRemoteLimits();
  if (remote) {
    const visible = remote.filter(l => !l.scope || matchesModel(l, data));
    if (visible.length > 0) return visible;
  }
  return stdinLimits(data);
}

export const usageSegment: Segment = {
  id: 'usage',
  priority: 15,
  // Mirrors render() exactly: enabled only when at least one limit will
  // draw, so the layout never boxes an empty width-0 usage card.
  enabled: (data) => limitsToRender(data).length > 0,
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
      // Width 10 fits '↻ ' plus the longest weekly countdown ('6d23h59m').
      const rst = padRight(color('↻', c.dim) + ' ' + formatResetTime(l.resetsAt), 10);
      const label = padRight(color(l.label, ...(l.scope === 'model' ? [c.orange, c.bold] : [c.dim])), labelW);
      return `${renderBar(l.percent, barW)} ${pct}${dot}${rst}${dot}${label}`;
    });

    const width = Math.max(...lines.map(visibleLength));
    return { id: 'usage', priority: 15, width, lines };
  },
};
