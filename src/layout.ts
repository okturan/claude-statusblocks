import type { Segment, Block, StatusLineData, StatusBlocksConfig } from './types.js';
import { padRight, color, c, visibleLength } from './colors.js';

import { contextSegment } from './segments/context.js';
import { modelSegment } from './segments/model.js';
import { gitSegment } from './segments/git.js';
import { campaignSegment } from './segments/campaign.js';
import { usageSegment } from './segments/usage.js';

const ALL_SEGMENTS: Segment[] = [contextSegment, modelSegment, gitSegment, campaignSegment, usageSegment];
const DEFAULT_ORDER = ['context', 'model', 'promo', 'git', 'usage'];
const INK_PADDING = 4; // Claude Code's outer paddingX: 2 on each side

function getSegmentOrder(config: StatusBlocksConfig): string[] {
  return config.segments ?? DEFAULT_ORDER;
}

const GAP = 1;
const BOX_CHROME = 4;

function boxify(lines: string[], innerW: number, title?: string): string[] {
  let top: string;
  if (title) {
    const label = ` ${title} `;
    const remaining = Math.max(0, innerW + 2 - label.length - 1);
    top = color('╭─', c.gray) + color(label, c.dim) + color('─'.repeat(remaining) + '╮', c.gray);
  } else {
    top = color('╭' + '─'.repeat(innerW + 2) + '╮', c.gray);
  }
  const bot = color('╰' + '─'.repeat(innerW + 2) + '╯', c.gray);
  const boxed = [top];
  for (const line of lines) {
    boxed.push(color('│', c.gray) + ' ' + padRight(line, innerW) + ' ' + color('│', c.gray));
  }
  boxed.push(bot);
  return boxed;
}

/** Render a group of boxes side by side, height-padded */
function renderRow(blocks: Block[], widths: number[]): string[] {
  const boxes = blocks.map((b, i) => boxify(b.lines, widths[i]!, b.id));
  const boxWidths = widths.map(w => w + BOX_CHROME);

  // Pad boxes to same height within this row
  const maxHeight = Math.max(...boxes.map(b => b.length));
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]!;
    while (box.length < maxHeight) {
      const blankRow = color('│', c.gray) + ' '.repeat(widths[i]! + 2) + color('│', c.gray);
      box.splice(box.length - 1, 0, blankRow);
    }
  }

  const rows: string[] = [];
  for (let row = 0; row < maxHeight; row++) {
    const parts: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      const padded = padRight(boxes[i]![row]!, boxWidths[i]!);
      parts.push(padded);
    }
    rows.push(parts.join(' '.repeat(GAP)).replace(/\s+$/, ''));
  }
  return rows;
}

export function render(data: StatusLineData, termWidth: number, config: StatusBlocksConfig): string {
  // Account for Claude Code's notification panel on the right
  const maxRowWidth = Math.max(40, termWidth - INK_PADDING);

  const order = getSegmentOrder(config);
  const active = order
    .map(id => ALL_SEGMENTS.find(s => s.id === id))
    .filter((s): s is Segment => s !== undefined && s.enabled(data));

  if (active.length === 0) return '';

  // Render all segments and measure natural widths
  const allocWidth = Math.max(20, maxRowWidth - BOX_CHROME);
  const blocks = active.map(s => s.render(data, allocWidth));
  const widths = blocks.map(b => Math.max(...b.lines.map(l => visibleLength(l))));

  // Row width helper for layout calculations
  function rowWidth(ws: number[]): number {
    if (ws.length === 0) return 0;
    return ws.reduce((sum, w) => sum + w + BOX_CHROME, 0) + (ws.length - 1) * GAP;
  }

  type RowGroup = { blocks: Block[]; widths: number[] };

  // Row 1 gets extra right margin for Claude Code's notification panel
  const ROW1_NOTIF_RESERVE = 5;
  const row1MaxWidth = maxRowWidth - ROW1_NOTIF_RESERVE;

  // Optimal layout: assign blocks to rows freely (not order-preserving).
  // Within each row, blocks keep their original segment order.
  // Rows are ordered by their earliest segment. For ≤5 blocks this
  // tries at most ~4400 assignments — instant.
  const n = blocks.length;
  let bestGroups: RowGroup[] | null = null;
  let bestScore = -Infinity;

  for (let numRows = 1; numRows <= n; numRows++) {
    const total = numRows ** n;
    for (let assign = 0; assign < total; assign++) {
      // Decode: which row each block goes to
      const rowOf: number[] = [];
      let v = assign;
      for (let i = 0; i < n; i++) { rowOf.push(v % numRows); v = Math.floor(v / numRows); }
      // Skip if any row is empty
      if (new Set(rowOf).size !== numRows) continue;

      // Build groups; blocks within each row stay in original order
      const groups: { indices: number[]; rw: number }[] = [];
      for (let r = 0; r < numRows; r++) {
        const idx: number[] = [];
        for (let i = 0; i < n; i++) if (rowOf[i] === r) idx.push(i);
        groups.push({ indices: idx, rw: rowWidth(idx.map(i => widths[i]!)) });
      }
      // Order rows by earliest segment index
      groups.sort((a, b) => a.indices[0]! - b.indices[0]!);

      // Validate: row 1 uses tighter width, others use maxRowWidth
      let valid = true;
      for (let r = 0; r < groups.length; r++) {
        if (groups[r]!.rw > (r === 0 ? row1MaxWidth : maxRowWidth)) { valid = false; break; }
      }
      if (!valid) continue;

      const rws = groups.map(g => g.rw);
      const maxRW = Math.max(...rws);
      const pyramid = numRows < 2 || rws[0]! <= rws[1]!;
      const score = -(numRows * 1e9) - (maxRW * 1e3) + (pyramid ? 500 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestGroups = groups.map(g => ({
          blocks: g.indices.map(i => blocks[i]!),
          widths: g.indices.map(i => widths[i]!),
        }));
      }
    }
    if (bestGroups) break; // found valid layout at this row count, no need for more rows
  }

  // Fallback: each block on its own row
  const rowGroups: RowGroup[] = bestGroups ?? blocks.map((b, i) => ({ blocks: [b], widths: [widths[i]!] }));

  // Render each row independently
  const allRows: string[] = [];
  for (const group of rowGroups) {
    allRows.push(...renderRow(group.blocks, group.widths));
  }

  return allRows.join('\n');
}
