import type { Segment, Block, StatusLineData, StatusBlocksConfig } from './types.js';
import { padRight, color, c, visibleLength } from './colors.js';

import { contextSegment } from './segments/context.js';
import { modelSegment } from './segments/model.js';
import { gitSegment } from './segments/git.js';
import { promoSegment } from './segments/promo.js';
import { usageSegment } from './segments/usage.js';
import { vimSegment } from './segments/vim.js';
import { agentSegment } from './segments/agent.js';
import { worktreeSegment } from './segments/worktree.js';

const ALL_SEGMENTS: Segment[] = [contextSegment, modelSegment, gitSegment, promoSegment, usageSegment, vimSegment, agentSegment, worktreeSegment];
const DEFAULT_ORDER = ['context', 'model', 'promo', 'git', 'usage', 'vim', 'agent', 'worktree'];
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
/** Decode a combo number into per-block row assignments and check all rows are used */
function decodeAssignment(
  combo: number, blockCount: number, targetRows: number,
  blockRow: number[], rowUsed: boolean[],
): boolean {
  let encoded = combo;
  for (let b = 0; b < blockCount; b++) {
    blockRow[b] = encoded % targetRows;
    encoded = Math.floor(encoded / targetRows);
  }
  rowUsed.fill(false, 0, targetRows);
  for (let b = 0; b < blockCount; b++) rowUsed[blockRow[b]!] = true;
  for (let r = 0; r < targetRows; r++) { if (!rowUsed[r]) return false; }
  return true;
}

/** Compute the total rendered width of each row from block assignments */
function computeRowWidths(
  blockRow: number[], blockCount: number, targetRows: number,
  blockWidths: number[], rowWidths: number[],
): void {
  for (let r = 0; r < targetRows; r++) rowWidths[r] = 0;
  for (let b = 0; b < blockCount; b++) rowWidths[blockRow[b]!] += blockWidths[b]! + BOX_CHROME;
  for (let r = 0; r < targetRows; r++) {
    let count = 0;
    for (let b = 0; b < blockCount; b++) { if (blockRow[b] === r) count++; }
    if (count > 1) rowWidths[r] += (count - 1) * GAP;
  }
}

/** Check rows fit within width limits (pyramid order) and return a score, or -Infinity if invalid */
function scoreAssignment(
  targetRows: number, rowWidths: number[], row1MaxWidth: number, maxRowWidth: number,
): number {
  // Sort by width ascending — narrowest row displayed first (pyramid)
  const displayOrder: number[] = [];
  for (let r = 0; r < targetRows; r++) displayOrder.push(r);
  displayOrder.sort((a, b) => rowWidths[a]! - rowWidths[b]!);

  for (let pos = 0; pos < displayOrder.length; pos++) {
    const limit = pos === 0 ? row1MaxWidth : maxRowWidth;
    if (rowWidths[displayOrder[pos]!]! > limit) return -Infinity;
  }

  // Row count dominates (1e9), widest row is tiebreaker (1e3)
  let widest = 0;
  for (let r = 0; r < targetRows; r++) { if (rowWidths[r]! > widest) widest = rowWidths[r]!; }
  return -(targetRows * 1e9) - (widest * 1e3);
}

export function findOptimalAssignment(
  blockCount: number, blockWidths: number[], row1MaxWidth: number, maxRowWidth: number,
): number[] | null {
  let bestAssignment: number[] | null = null;
  let bestScore = -Infinity;

  const blockRow = new Array<number>(blockCount);
  const rowUsed = new Array<boolean>(blockCount);
  const rowWidths = new Array<number>(blockCount);

  for (let targetRows = 1; targetRows <= blockCount; targetRows++) {
    const totalCombinations = targetRows ** blockCount;
    for (let combo = 0; combo < totalCombinations; combo++) {
      if (!decodeAssignment(combo, blockCount, targetRows, blockRow, rowUsed)) continue;
      computeRowWidths(blockRow, blockCount, targetRows, blockWidths, rowWidths);
      const score = scoreAssignment(targetRows, rowWidths, row1MaxWidth, maxRowWidth);
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
