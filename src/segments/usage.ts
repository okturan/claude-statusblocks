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
 *
 * BOTH weekly buckets gate a Fable session: a user was locked out
 * ("weekly limit · resets 7pm", the all-models reset) while the Fable
 * bucket sat at 3%. So neither weekly figure may be hidden — but the card
 * stays two lines (the user's call). Buckets sharing a reset window are
 * paired onto ONE line: the one closer to its cap is the primary (bar,
 * percent, label), the other trails as a dim "label pct" annotation.
 * (A session briefly running past 100% of the all-models bucket is Claude
 * Code's usage-limit grace zone, not evidence the buckets are independent.)
 */
function limitsToRender(data: StatusLineData): RemoteLimit[] {
  const remote = readRemoteLimits();
  if (remote) {
    const now = Date.now() / 1000;
    const visible = remote
      .filter(l => !l.scope || matchesModel(l, data))
      // A cached window whose reset has passed has rolled over: nothing is
      // used in the new one yet. (Keep resetsAt so same-window pairing holds.)
      .map(l => (l.resetsAt > 0 && l.resetsAt <= now ? { ...l, percent: 0 } : l));
    if (visible.length > 0) return visible;
  }
  return stdinLimits(data);
}

/** A rendered line: the binding limit plus, optionally, a same-window companion. */
interface Row { primary: RemoteLimit; secondary?: RemoteLimit }

/** Same refill instant (within tolerance) means the same rate-limit window. */
function sameWindow(a: RemoteLimit, b: RemoteLimit): boolean {
  return a.resetsAt > 0 && b.resetsAt > 0 && Math.abs(a.resetsAt - b.resetsAt) <= 120;
}

/**
 * Pair limits that reset together onto one line. The higher percentage
 * is the one that locks first, so it leads; on a tie the model-scoped one
 * is the more specific answer to "what stops this session". The other
 * stays visible as the line's annotation — never dropped.
 */
function pairSameWindow(limits: RemoteLimit[]): Row[] {
  const rows: Row[] = [];
  for (const l of limits) {
    const row = rows.find(r => !r.secondary && sameWindow(r.primary, l));
    if (!row) { rows.push({ primary: l }); continue; }
    const p = row.primary;
    const lLeads = l.percent > p.percent || (l.percent === p.percent && l.scope === 'model' && p.scope !== 'model');
    if (lLeads) { row.primary = l; row.secondary = p; } else { row.secondary = l; }
  }
  return rows;
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

    const rows = pairSameWindow(limits);
    const barW = 8;
    const dot = color(' · ', c.dim);
    const labelW = Math.max(...rows.map(r => r.primary.label.length));
    // Scoped limits belong to the session's model — that's the budget
    // being drawn down, so pop the label like the model name.
    const labelColors = (l: RemoteLimit) => l.scope === 'model' ? [c.orange, c.bold] : [c.dim];

    const lines = rows.map(({ primary: l, secondary: s }) => {
      const pct = padRight(color(`${l.percent}%`, pctColor(l.percent), c.bold), 4);
      // Width 10 fits '↻ ' plus the longest weekly countdown ('6d23h59m').
      const rst = padRight(color('↻', c.dim) + ' ' + formatResetTime(l.resetsAt), 10);
      const label = padRight(color(l.label, ...labelColors(l)), labelW);
      const line = `${renderBar(l.percent, barW)} ${pct}${dot}${rst}${dot}${label}`;
      if (!s) return line;
      // Same-window companion: label in its own colour, percent in the
      // usual severity colour, both dimmed so the primary stays the headline.
      return `${line}${dot}${color(s.label, ...labelColors(s), c.dim)} ${color(`${s.percent}%`, pctColor(s.percent), c.dim)}`;
    });

    const width = Math.max(...lines.map(visibleLength));
    return { id: 'usage', priority: 15, width, lines };
  },
};
