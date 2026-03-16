import { basename } from 'path';
import { homedir } from 'os';
import type { Segment } from '../types.js';
import { color, c, visibleLength } from '../colors.js';

function tildeDir(dir: string): string {
  const home = homedir();
  if (dir === home) return '~';
  if (dir.startsWith(home + '/')) return '~' + dir.slice(home.length);
  return dir;
}

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

    // Line 2: duration (left) · version (right), spread across line1 width
    let durationStr = '';
    const ms = data.cost?.total_duration_ms ?? 0;
    if (ms > 0) {
      const totalSec = Math.floor(ms / 1000);
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      durationStr = color(h > 0 ? `${h}h${m}m` : `${m}m`, c.dim);
    }
    const versionStr = data.version ? color(`v${data.version}`, c.dim) : '';

    const line1Width = visibleLength(line1);
    const leftLen = visibleLength(durationStr);
    const rightLen = visibleLength(versionStr);
    // Spread: duration         version
    const gap = Math.max(1, line1Width - leftLen - rightLen);
    const line2 = durationStr + ' '.repeat(gap) + versionStr;

    const lines = [line1, line2];
    const width = Math.max(...lines.map(visibleLength));
    return { id: 'model', priority: 2, width, lines };
  },
};
