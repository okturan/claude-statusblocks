import { basename } from 'path';
import { homedir } from 'os';
import type { Segment } from '../types.js';
import { color, c, visibleLength } from '../colors.js';
import { resolveEffort } from '../effort.js';

const MS_PER_SEC = 1000;
const SECS_PER_HOUR = 3600;
const SECS_PER_MIN = 60;

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

/** Spread styled parts evenly across a target width, with optional dot separators */
function spreadLine(parts: string[], targetWidth: number): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;

  const widths = parts.map(visibleLength);
  const contentWidth = widths.reduce((a, b) => a + b, 0);
  const totalGap = Math.max(0, targetWidth - contentWidth);

  if (parts.length === 2) {
    return parts[0]! + ' '.repeat(Math.max(1, totalGap)) + parts[1]!;
  }

  // 3 parts: try dot separators first, fall back to even spacing
  const dot = color(' · ', c.dim);
  const dotWidth = 3;
  const spareAfterDots = totalGap - dotWidth * (parts.length - 1);

  if (spareAfterDots <= 12 && spareAfterDots >= 0) {
    // Compact: distribute spare space evenly around dots
    const gaps = parts.length * 2 - 2; // gaps on each side of each dot
    const base = Math.floor(Math.max(0, spareAfterDots) / gaps);
    const remainder = Math.max(0, spareAfterDots) % gaps;
    const result: string[] = [parts[0]!];
    for (let i = 1; i < parts.length; i++) {
      const leftPad = base + (((i - 1) * 2) < remainder ? 1 : 0);
      const rightPad = base + (((i - 1) * 2 + 1) < remainder ? 1 : 0);
      result.push(' '.repeat(leftPad), dot, ' '.repeat(rightPad), parts[i]!);
    }
    return result.join('');
  }

  // Wide: spread evenly without dots
  const gapCount = parts.length - 1;
  const baseGap = Math.floor(totalGap / gapCount);
  const extraGap = totalGap % gapCount;
  const result: string[] = [parts[0]!];
  for (let i = 1; i < parts.length; i++) {
    result.push(' '.repeat(baseGap + (i <= extraGap ? 1 : 0)), parts[i]!);
  }
  return result.join('');
}

export const modelSegment: Segment = {
  id: 'model',
  priority: 30,
  enabled: () => true,
  render(data, allocWidth) {
    const name = data.model.display_name;
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
      const totalSec = Math.floor(ms / MS_PER_SEC);
      const h = Math.floor(totalSec / SECS_PER_HOUR);
      const m = Math.floor((totalSec % SECS_PER_HOUR) / SECS_PER_MIN);
      durationStr = color(h > 0 ? `${h}h${m}m` : `${m}m`, c.dim);
    }
    const versionStr = data.version ? color(`v${data.version}`, c.dim) : '';

    const line2 = spreadLine(
      [effortStr, durationStr, versionStr].filter(Boolean),
      visibleLength(line1),
    );

    const lines = [line1, line2];
    const width = Math.max(...lines.map(visibleLength));
    return { id: 'model', priority: 30, width, lines };
  },
};
