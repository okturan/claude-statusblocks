import { basename } from 'path';
import { homedir } from 'os';
import type { Segment } from '../types.js';
import { color, c, visibleLength } from '../colors.js';
import { resolveEffort } from '../effort.js';

function tildeDir(dir: string): string {
  const home = homedir();
  if (dir === home) return '~';
  if (dir.startsWith(home + '/')) return '~' + dir.slice(home.length);
  return dir;
}

const EFFORT_COLORS: Record<string, string> = {
  low: c.dim,
  medium: c.dim,
  high: c.yellow,
  max: c.orange,
};

export const modelSegment: Segment = {
  id: 'model',
  priority: 30,
  enabled: () => true,
  render(data, allocWidth) {
    const name = data.model.display_name;
    // Strip "(1M context)" etc. from display name — keep just the model name
    const shortName = name.replace(/\s*\(.*?\)\s*/g, '').trim();

    // Line 1: model name · directory (tilde-shortened, basename fallback)
    const nameStyled = color(shortName, c.orange, c.bold);
    const sep = color(' · ', c.dim);
    const nameLen = visibleLength(nameStyled) + visibleLength(sep);
    const dirBudget = Math.max(allocWidth - nameLen, 0);
    const tilde = tildeDir(data.workspace.current_dir);
    const dir = tilde.length <= dirBudget ? tilde : basename(data.workspace.current_dir);
    const line1 = `${nameStyled}${sep}${color(dir, c.dim)}`;

    // Line 2: effort · duration · version, spread across line1 width
    const effort = resolveEffort(data.transcript_path);
    const effortStr = effort ? color(effort, EFFORT_COLORS[effort] ?? c.dim) : '';

    let durationStr = '';
    const ms = data.cost?.total_duration_ms ?? 0;
    if (ms > 0) {
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      durationStr = color(h > 0 ? `${h}h${m}m` : `${m}m`, c.dim);
    }
    const versionStr = data.version ? color(`v${data.version}`, c.dim) : '';

    // Layout: effort (left) — duration (center) — version (right), no dots
    const line1Width = visibleLength(line1);
    const parts = [effortStr, durationStr, versionStr].filter(Boolean);
    let line2: string;

    if (parts.length === 3) {
      const dot = color(' · ', c.dim);
      const dotLen = 3;
      const eLen = visibleLength(effortStr);
      const dLen = visibleLength(durationStr);
      const vLen = visibleLength(versionStr);
      const contentWidth = eLen + dLen + vLen;
      const spareWithDots = line1Width - contentWidth - dotLen * 2;
      // Use dots when items are close together (avg gap <= 3 chars), plain spacing otherwise
      if (spareWithDots >= 0 && spareWithDots <= 12) {
        const g = Math.floor(spareWithDots / 4);
        const extra = spareWithDots - g * 4;
        const g1 = g;
        const g2 = g + Math.min(extra, 1);
        const g3 = g + (extra >= 2 ? 1 : 0);
        const g4 = g + (extra >= 3 ? 1 : 0);
        line2 = effortStr + ' '.repeat(g1) + dot + ' '.repeat(g2) + durationStr + ' '.repeat(g3) + dot + ' '.repeat(g4) + versionStr;
      } else {
        const remaining = Math.max(0, line1Width - contentWidth);
        const leftGap = Math.floor(remaining / 2);
        const rightGap = remaining - leftGap;
        line2 = effortStr + ' '.repeat(leftGap) + durationStr + ' '.repeat(rightGap) + versionStr;
      }
    } else if (parts.length === 2) {
      const leftStr = parts[0]!;
      const rightStr = parts[1]!;
      const gap = Math.max(1, line1Width - visibleLength(leftStr) - visibleLength(rightStr));
      line2 = leftStr + ' '.repeat(gap) + rightStr;
    } else {
      line2 = parts[0] ?? '';
    }

    const lines = [line1, line2];
    const width = Math.max(...lines.map(visibleLength));
    return { id: 'model', priority: 2, width, lines };
  },
};
