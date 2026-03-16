import type { Segment, Block, StatusLineData, ClaudelineConfig } from './types.js';
import { padRight, color, c, visibleLength } from './colors.js';

import { contextSegment } from './segments/context.js';
import { modelSegment } from './segments/model.js';
import { gitSegment } from './segments/git.js';
import { campaignSegment } from './segments/campaign.js';
import { usageSegment } from './segments/usage.js';

const ALL_SEGMENTS: Segment[] = [contextSegment, modelSegment, gitSegment, campaignSegment, usageSegment];
const DEFAULT_ORDER = ['context', 'model', 'promo', 'git', 'usage'];
const NOTIFICATION_RESERVE = 44; // space for Claude Code's right-side notification panel

function getSegmentOrder(config: ClaudelineConfig): string[] {
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

export function render(data: StatusLineData, termWidth: number, config: ClaudelineConfig): string {
  // Account for Claude Code's notification panel on the right
  const maxRowWidth = Math.max(40, termWidth - NOTIFICATION_RESERVE);

  const order = getSegmentOrder(config);
  const active = order
    .map(id => ALL_SEGMENTS.find(s => s.id === id))
    .filter((s): s is Segment => s !== undefined && s.enabled(data));

  if (active.length === 0) return '';

  // Render all segments and measure natural widths
  const blocks = active.map(s => s.render(data, 80));
  const widths = blocks.map(b => Math.max(...b.lines.map(l => visibleLength(l))));

  // Flow blocks into rows — like flexbox wrap
  const rowGroups: { blocks: Block[]; widths: number[] }[] = [];
  let currentRow: { blocks: Block[]; widths: number[] } = { blocks: [], widths: [] };
  let currentRowWidth = 0;

  for (let i = 0; i < blocks.length; i++) {
    const boxedWidth = widths[i]! + BOX_CHROME;
    const gapWidth = currentRow.blocks.length > 0 ? GAP : 0;
    const needed = gapWidth + boxedWidth;

    if (currentRow.blocks.length > 0 && currentRowWidth + needed > maxRowWidth) {
      // Doesn't fit — start new row
      rowGroups.push(currentRow);
      currentRow = { blocks: [], widths: [] };
      currentRowWidth = 0;
    }

    currentRow.blocks.push(blocks[i]!);
    currentRow.widths.push(widths[i]!);
    currentRowWidth += (currentRow.blocks.length > 1 ? GAP : 0) + boxedWidth;
  }
  if (currentRow.blocks.length > 0) {
    rowGroups.push(currentRow);
  }

  // Merge single-card rows that could fit together
  for (let i = 0; i < rowGroups.length; i++) {
    if (rowGroups[i]!.blocks.length !== 1) continue;
    const iWidth = rowGroups[i]!.widths[0]! + BOX_CHROME;
    for (let j = i + 1; j < rowGroups.length; j++) {
      if (rowGroups[j]!.blocks.length !== 1) continue;
      const jWidth = rowGroups[j]!.widths[0]! + BOX_CHROME;
      if (iWidth + GAP + jWidth <= maxRowWidth) {
        // Merge j into i
        rowGroups[i]!.blocks.push(rowGroups[j]!.blocks[0]!);
        rowGroups[i]!.widths.push(rowGroups[j]!.widths[0]!);
        rowGroups.splice(j, 1);
        break; // only merge one pair per source row
      }
    }
  }

  // Render each row independently
  const allRows: string[] = [];
  for (const group of rowGroups) {
    allRows.push(...renderRow(group.blocks, group.widths));
  }

  return allRows.join('\n');
}
