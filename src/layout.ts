import type { Segment, Block, StatusLineData, ClaudeckConfig } from './types.js';
import { padRight, color, c, visibleLength } from './colors.js';

import { contextSegment } from './segments/context.js';
import { modelSegment } from './segments/model.js';
import { gitSegment } from './segments/git.js';
import { campaignSegment } from './segments/campaign.js';
import { usageSegment } from './segments/usage.js';

const ALL_SEGMENTS: Segment[] = [contextSegment, modelSegment, gitSegment, campaignSegment, usageSegment];
const DEFAULT_ORDER = ['context', 'model', 'promo', 'git', 'usage'];
const INK_PADDING = 4; // Claude Code's outer paddingX: 2 on each side

function getSegmentOrder(config: ClaudeckConfig): string[] {
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

export function render(data: StatusLineData, termWidth: number, config: ClaudeckConfig): string {
  // Account for Claude Code's notification panel on the right
  const maxRowWidth = Math.max(40, termWidth - INK_PADDING);

  const order = getSegmentOrder(config);
  const active = order
    .map(id => ALL_SEGMENTS.find(s => s.id === id))
    .filter((s): s is Segment => s !== undefined && s.enabled(data));

  if (active.length === 0) return '';

  // Render all segments and measure natural widths
  const blocks = active.map(s => s.render(data, 80));
  const widths = blocks.map(b => Math.max(...b.lines.map(l => visibleLength(l))));

  // Smart 2-row layout: row 1 gets the fewest cards (safe from notification truncation),
  // row 2 carries the bulk. Find the split point where row 1 has the fewest cards
  // while everything still fits in 2 rows.
  function rowWidth(ws: number[]): number {
    if (ws.length === 0) return 0;
    return ws.reduce((sum, w) => sum + w + BOX_CHROME, 0) + (ws.length - 1) * GAP;
  }

  const totalWidth = rowWidth(widths);
  type RowGroup = { blocks: Block[]; widths: number[] };
  let rowGroups: RowGroup[];

  if (totalWidth <= maxRowWidth) {
    // Everything fits on one row
    rowGroups = [{ blocks: [...blocks], widths: [...widths] }];
  } else {
    // Try all 2-row distributions to find best pyramid (row1 < row2, minimize diff)
    const n = blocks.length;
    let bestRow1: number[] = [0];
    let bestScore = -Infinity;

    // Enumerate all subsets for row 1 (at least 1 card, at most n-1)
    for (let mask = 1; mask < (1 << n) - 1; mask++) {
      const r1idx: number[] = [];
      const r2idx: number[] = [];
      for (let b = 0; b < n; b++) {
        if (mask & (1 << b)) r1idx.push(b);
        else r2idx.push(b);
      }
      if (r1idx.length === 0 || r2idx.length === 0) continue;
      const r1w = rowWidth(r1idx.map(i => widths[i]!));
      const r2w = rowWidth(r2idx.map(i => widths[i]!));
      if (r1w > maxRowWidth || r2w > maxRowWidth) continue;
      // Pyramid: row1 should be narrower. Score: prefer r1 < r2 with smallest gap
      if (r1w > r2w) continue; // not a pyramid
      const score = r1w; // maximize row1 width while still < row2
      if (score > bestScore) {
        bestScore = score;
        bestRow1 = r1idx;
      }
    }

    const bestRow2 = Array.from({ length: n }, (_, i) => i).filter(i => !bestRow1.includes(i));
    const r1w = rowWidth(bestRow1.map(i => widths[i]!));
    const r2w = rowWidth(bestRow2.map(i => widths[i]!));
    if (bestScore !== -Infinity && r1w <= maxRowWidth && r2w <= maxRowWidth) {
      rowGroups = [
        { blocks: bestRow1.map(i => blocks[i]!), widths: bestRow1.map(i => widths[i]!) },
        { blocks: bestRow2.map(i => blocks[i]!), widths: bestRow2.map(i => widths[i]!) },
      ];
    } else {
      // Fallback: sequential flow with wrapping
      rowGroups = [];
      let currentRow: RowGroup = { blocks: [], widths: [] };
      let currentW = 0;
      for (let i = 0; i < blocks.length; i++) {
        const needed = (currentRow.blocks.length > 0 ? GAP : 0) + widths[i]! + BOX_CHROME;
        if (currentRow.blocks.length > 0 && currentW + needed > maxRowWidth) {
          rowGroups.push(currentRow);
          currentRow = { blocks: [], widths: [] };
          currentW = 0;
        }
        currentRow.blocks.push(blocks[i]!);
        currentRow.widths.push(widths[i]!);
        currentW += (currentRow.blocks.length > 1 ? GAP : 0) + widths[i]! + BOX_CHROME;
      }
      if (currentRow.blocks.length > 0) rowGroups.push(currentRow);
    }
  }

  // Render each row independently
  const allRows: string[] = [];
  for (const group of rowGroups) {
    allRows.push(...renderRow(group.blocks, group.widths));
  }

  return allRows.join('\n');
}
