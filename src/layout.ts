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

  type RowGroup = { blocks: Block[]; widths: number[] };

  // Row 1 gets extra right margin for Claude Code's notification panel
  const row1MaxWidth = maxRowWidth - 5;

  // Optimal layout: assign blocks to rows freely (not order-preserving).
  // Within each row, blocks keep their original segment order.
  // Rows are ordered by their earliest segment. For ≤5 blocks this
  // tries at most ~4400 assignments — instant.
  const n = blocks.length;
  let bestAssign: number[] | null = null;
  let bestScore = -Infinity;

  // Reusable buffers to avoid per-iteration allocations
  const rowOf = new Array<number>(n);
  const seen = new Array<boolean>(n);     // max possible rows = n
  const rowRW = new Array<number>(n);
  const minIdx = new Array<number>(n);

  for (let numRows = 1; numRows <= n; numRows++) {
    const total = numRows ** n;
    for (let assign = 0; assign < total; assign++) {
      // Decode: which row each block goes to
      let v = assign;
      for (let i = 0; i < n; i++) { rowOf[i] = v % numRows; v = Math.floor(v / numRows); }

      // Skip if any row is empty (without allocating a Set)
      seen.fill(false, 0, numRows);
      for (let i = 0; i < n; i++) seen[rowOf[i]!] = true;
      let allUsed = true;
      for (let r = 0; r < numRows; r++) { if (!seen[r]) { allUsed = false; break; } }
      if (!allUsed) continue;

      // Compute row widths and min segment index per row inline
      for (let r = 0; r < numRows; r++) { rowRW[r] = 0; minIdx[r] = n; }
      for (let i = 0; i < n; i++) {
        const r = rowOf[i]!;
        rowRW[r] += widths[i]! + BOX_CHROME;
        if (i < minIdx[r]!) minIdx[r] = i;
      }
      for (let r = 0; r < numRows; r++) {
        // Count blocks in this row for gap calculation
        let count = 0;
        for (let i = 0; i < n; i++) if (rowOf[i] === r) count++;
        if (count > 1) rowRW[r] += (count - 1) * GAP;
      }

      // Sort rows by earliest segment index (build order mapping)
      const rowOrder: number[] = [];
      for (let r = 0; r < numRows; r++) rowOrder.push(r);
      rowOrder.sort((a, b) => minIdx[a]! - minIdx[b]!);

      // Validate: row 1 uses tighter width, others use maxRowWidth
      let valid = true;
      for (let i = 0; i < rowOrder.length; i++) {
        const limit = i === 0 ? row1MaxWidth : maxRowWidth;
        if (rowRW[rowOrder[i]!]! > limit) { valid = false; break; }
      }
      if (!valid) continue;

      // Score: fewer rows > smaller widest row > pyramid shape
      let maxRW = 0;
      for (let r = 0; r < numRows; r++) if (rowRW[r]! > maxRW) maxRW = rowRW[r]!;
      const pyramid = numRows < 2 || rowRW[rowOrder[0]!]! <= rowRW[rowOrder[1]!]!;
      const score = -(numRows * 1e9) - (maxRW * 1e3) + (pyramid ? 500 : 0);

      if (score > bestScore) {
        bestScore = score;
        bestAssign = rowOf.slice(0, n);
      }
    }
    if (bestAssign) break;
  }

  // Materialize best assignment into RowGroups
  let bestGroups: RowGroup[] | null = null;
  if (bestAssign) {
    const numRows = Math.max(...bestAssign) + 1;
    const groups: { indices: number[]; rw: number }[] = [];
    for (let r = 0; r < numRows; r++) {
      const idx: number[] = [];
      for (let i = 0; i < n; i++) if (bestAssign[i] === r) idx.push(i);
      if (idx.length > 0) groups.push({ indices: idx, rw: 0 });
    }
    groups.sort((a, b) => a.indices[0]! - b.indices[0]!);
    bestGroups = groups.map(g => ({
      blocks: g.indices.map(i => blocks[i]!),
      widths: g.indices.map(i => widths[i]!),
    }));
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
