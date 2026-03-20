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
// Row 1 needs extra margin because Claude Code's Ink notification panel
// (e.g. "auto mode temporarily unavail…") overlaps from the right.
// Only row 1 height is affected; subsequent rows sit below the panel.
const ROW1_NOTIF_MARGIN = 12;

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
export function findOptimalAssignment(
  blockCount: number, blockWidths: number[], row1MaxWidth: number, maxRowWidth: number,
): number[] | null {
  let bestAssignment: number[] | null = null;
  let bestScore = -Infinity;

  // Reusable buffers to avoid per-iteration allocations
  const blockRow = new Array<number>(blockCount);
  const rowUsed = new Array<boolean>(blockCount);
  const rowWidths = new Array<number>(blockCount);

  for (let targetRows = 1; targetRows <= blockCount; targetRows++) {
    const totalCombinations = targetRows ** blockCount;

    for (let combo = 0; combo < totalCombinations; combo++) {
      // Decode combo into per-block row assignments (base-targetRows digits)
      let encoded = combo;
      for (let block = 0; block < blockCount; block++) {
        blockRow[block] = encoded % targetRows;
        encoded = Math.floor(encoded / targetRows);
      }

      // Verify all target rows are occupied
      rowUsed.fill(false, 0, targetRows);
      for (let block = 0; block < blockCount; block++) rowUsed[blockRow[block]!] = true;
      let allRowsOccupied = true;
      for (let row = 0; row < targetRows; row++) {
        if (!rowUsed[row]) { allRowsOccupied = false; break; }
      }
      if (!allRowsOccupied) continue;

      // Compute total width per row (block widths + chrome + gaps)
      for (let row = 0; row < targetRows; row++) rowWidths[row] = 0;
      for (let block = 0; block < blockCount; block++) {
        rowWidths[blockRow[block]!] += blockWidths[block]! + BOX_CHROME;
      }
      for (let row = 0; row < targetRows; row++) {
        let blocksInRow = 0;
        for (let block = 0; block < blockCount; block++) {
          if (blockRow[block] === row) blocksInRow++;
        }
        if (blocksInRow > 1) rowWidths[row] += (blocksInRow - 1) * GAP;
      }

      // Sort rows by width ascending (pyramid: narrowest on top)
      const displayOrder: number[] = [];
      for (let row = 0; row < targetRows; row++) displayOrder.push(row);
      displayOrder.sort((a, b) => rowWidths[a]! - rowWidths[b]!);

      // Validate: narrowest row (displayed first) uses tighter width limit
      let valid = true;
      for (let pos = 0; pos < displayOrder.length; pos++) {
        const widthLimit = pos === 0 ? row1MaxWidth : maxRowWidth;
        if (rowWidths[displayOrder[pos]!]! > widthLimit) { valid = false; break; }
      }
      if (!valid) continue;

      // Score: row count dominates (1e9 weight), widest row is tiebreaker (1e3).
      // Higher score = better layout. Both terms are negative so fewer rows
      // and smaller widest row both increase the score.
      let widestRow = 0;
      for (let row = 0; row < targetRows; row++) {
        if (rowWidths[row]! > widestRow) widestRow = rowWidths[row]!;
      }
      const score = -(targetRows * 1e9) - (widestRow * 1e3);

      if (score > bestScore) {
        bestScore = score;
        bestAssignment = blockRow.slice(0, blockCount);
      }
    }
    if (bestAssignment) break;
  }

  return bestAssignment;
}

/** Materialize a block-to-row assignment into sorted RowGroups */
export function materializeAssignment(
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
