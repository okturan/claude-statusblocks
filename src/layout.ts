import type { Segment, Block, StatusLineData, StatusBlocksConfig } from './types.js';
import { padRight, color, c, visibleLength } from './colors.js';

import { contextSegment } from './segments/context.js';
import { modelSegment } from './segments/model.js';
import { gitSegment } from './segments/git.js';
import { promoSegment } from './segments/promo.js';
import { usageSegment } from './segments/usage.js';

const ALL_SEGMENTS: Segment[] = [contextSegment, modelSegment, gitSegment, promoSegment, usageSegment];
const DEFAULT_ORDER = ['context', 'model', 'promo', 'git', 'usage'];
const INK_PADDING = 4;       // Claude Code's outer paddingX: 2 on each side
const ROW1_NOTIF_MARGIN = 5; // Extra right margin on row 1 for Claude Code's notification panel

function getSegmentOrder(config: StatusBlocksConfig): string[] {
  return config.segments ?? DEFAULT_ORDER;
}

const GAP = 1;
const BOX_CHROME = 4;

type RowGroup = { blocks: Block[]; widths: number[] };

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
function renderRow(group: RowGroup): string[] {
  const { blocks, widths } = group;
  const boxes = blocks.map((b, i) => boxify(b.lines, widths[i]!, b.id));
  const boxWidths = widths.map(w => w + BOX_CHROME);

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
      parts.push(padRight(boxes[i]![row]!, boxWidths[i]!));
    }
    rows.push(parts.join(' '.repeat(GAP)).replace(/\s+$/, ''));
  }
  return rows;
}

/**
 * Bin-packing layout optimizer. Assigns n blocks to rows freely
 * (not order-preserving) to minimize row count, then widest row.
 * Rows are sorted by width ascending (pyramid shape).
 * Returns the best assignment as a row-index-per-block array, or null.
 */
function findOptimalAssignment(
  n: number, widths: number[], row1MaxWidth: number, maxRowWidth: number,
): number[] | null {
  let bestAssign: number[] | null = null;
  let bestScore = -Infinity;

  const rowOf = new Array<number>(n);
  const seen = new Array<boolean>(n);
  const rowRW = new Array<number>(n);

  for (let numRows = 1; numRows <= n; numRows++) {
    const total = numRows ** n;
    for (let assign = 0; assign < total; assign++) {
      let v = assign;
      for (let i = 0; i < n; i++) { rowOf[i] = v % numRows; v = Math.floor(v / numRows); }

      seen.fill(false, 0, numRows);
      for (let i = 0; i < n; i++) seen[rowOf[i]!] = true;
      let allUsed = true;
      for (let r = 0; r < numRows; r++) { if (!seen[r]) { allUsed = false; break; } }
      if (!allUsed) continue;

      // Compute row widths inline
      for (let r = 0; r < numRows; r++) rowRW[r] = 0;
      for (let i = 0; i < n; i++) rowRW[rowOf[i]!] += widths[i]! + BOX_CHROME;
      for (let r = 0; r < numRows; r++) {
        let count = 0;
        for (let i = 0; i < n; i++) if (rowOf[i] === r) count++;
        if (count > 1) rowRW[r] += (count - 1) * GAP;
      }

      // Sort rows by width ascending for pyramid validation
      const rowOrder: number[] = [];
      for (let r = 0; r < numRows; r++) rowOrder.push(r);
      rowOrder.sort((a, b) => rowRW[a]! - rowRW[b]!);

      let valid = true;
      for (let i = 0; i < rowOrder.length; i++) {
        if (rowRW[rowOrder[i]!]! > (i === 0 ? row1MaxWidth : maxRowWidth)) { valid = false; break; }
      }
      if (!valid) continue;

      let maxRW = 0;
      for (let r = 0; r < numRows; r++) if (rowRW[r]! > maxRW) maxRW = rowRW[r]!;
      const score = -(numRows * 1e9) - (maxRW * 1e3);

      if (score > bestScore) {
        bestScore = score;
        bestAssign = rowOf.slice(0, n);
      }
    }
    if (bestAssign) break;
  }

  return bestAssign;
}

/** Materialize a block-to-row assignment into sorted RowGroups */
function materializeAssignment(
  bestAssign: number[], blocks: Block[], widths: number[],
): RowGroup[] {
  const n = blocks.length;
  const numRows = Math.max(...bestAssign) + 1;
  const groups: { indices: number[]; rw: number }[] = [];

  for (let r = 0; r < numRows; r++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (bestAssign[i] === r) idx.push(i);
    if (idx.length > 0) {
      let rw = 0;
      for (const i of idx) rw += widths[i]! + BOX_CHROME;
      if (idx.length > 1) rw += (idx.length - 1) * GAP;
      groups.push({ indices: idx, rw });
    }
  }

  groups.sort((a, b) => a.rw - b.rw);
  return groups.map(g => ({
    blocks: g.indices.map(i => blocks[i]!),
    widths: g.indices.map(i => widths[i]!),
  }));
}

export function render(data: StatusLineData, termWidth: number, config: StatusBlocksConfig): string {
  const maxRowWidth = Math.max(40, termWidth - INK_PADDING);

  const order = getSegmentOrder(config);
  const active = order
    .map(id => ALL_SEGMENTS.find(s => s.id === id))
    .filter((s): s is Segment => s !== undefined && s.enabled(data));

  if (active.length === 0) return '';

  const allocWidth = Math.max(20, maxRowWidth - BOX_CHROME);
  const blocks = active.map(s => s.render(data, allocWidth));
  const widths = blocks.map(b => Math.max(...b.lines.map(l => visibleLength(l))));

  // Row 1 gets extra right margin for Claude Code's notification panel
  const row1MaxWidth = maxRowWidth - ROW1_NOTIF_MARGIN;

  const bestAssign = findOptimalAssignment(blocks.length, widths, row1MaxWidth, maxRowWidth);
  const rowGroups = bestAssign
    ? materializeAssignment(bestAssign, blocks, widths)
    : blocks.map((b, i) => ({ blocks: [b], widths: [widths[i]!] }));

  return rowGroups.flatMap(renderRow).join('\n');
}
