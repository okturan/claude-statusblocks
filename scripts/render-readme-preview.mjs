#!/usr/bin/env node

import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const SVG_PATH = join(ROOT, 'docs', 'claude-statusblocks-preview.svg');
const PNG_PATH = join(ROOT, 'docs', 'claude-statusblocks-preview.png');
const WIDTH = 1280;
const HEIGHT = 640;
const FIXED_NOW = Date.UTC(2026, 6, 16, 12, 0, 0);
const GENERIC_WORKSPACE = '/workspace/claude-statusblocks';

const originalTmp = tmpdir();
const fixtureTmp = mkdtempSync(join(originalTmp, 'claude-statusblocks-preview-'));
process.env.TMPDIR = fixtureTmp;
process.env.CLAUDE_CONFIG_DIR = fixtureTmp;
process.env.CLAUDE_EFFORT = 'xhigh';
process.env.CLAUDE_STATUSBLOCKS_NO_UPDATE = '1';
Date.now = () => FIXED_NOW;

const { render } = await import('../dist/layout.js');
const { hashKey, writeCache } = await import('../dist/cache.js');
const { visibleLength } = await import('../dist/colors.js');

writeCache(`git-${hashKey(GENERIC_WORKSPACE)}`, {
  branch: 'feature/adaptive-layout',
  staged: 2,
  modified: 1,
  added: 128,
  removed: 17,
});

const fixture = {
  model: { id: 'claude-opus-4-6', display_name: 'Opus 4.6' },
  workspace: { current_dir: GENERIC_WORKSPACE, project_dir: GENERIC_WORKSPACE },
  version: '2.1.133',
  cost: {
    total_cost_usd: 8.42,
    total_duration_ms: 2_700_000,
    total_api_duration_ms: 1_200_000,
    total_lines_added: 245,
    total_lines_removed: 67,
  },
  context_window: {
    context_window_size: 1_000_000,
    used_percentage: 34,
    remaining_percentage: 66,
    total_input_tokens: 340_000,
    total_output_tokens: 28_000,
    current_usage: {
      input_tokens: 8_000,
      output_tokens: 1_200,
      cache_creation_input_tokens: 12_000,
      cache_read_input_tokens: 320_000,
    },
  },
  rate_limits: {
    five_hour: { used_percentage: 12, resets_at: Math.floor(FIXED_NOW / 1000) + 7_200 },
    seven_day: { used_percentage: 70, resets_at: Math.floor(FIXED_NOW / 1000) + 75_600 },
  },
  exceeds_200k_tokens: true,
  session_id: 'readme-preview',
  vim: { mode: 'NORMAL' },
  agent: { name: 'code-architect', type: 'Explore' },
  worktree: {
    name: 'feature-adaptive-layout',
    path: '/workspace/worktrees/feature-adaptive-layout',
    branch: 'feature/adaptive-layout',
    original_cwd: GENERIC_WORKSPACE,
    original_branch: 'main',
  },
};

const config = {
  segments: ['context', 'model', 'git', 'usage', 'vim', 'agent', 'worktree'],
};

const captures = [120, 80, 50].map((columns) => {
  const output = render(fixture, columns, config);
  const lines = output.split('\n');
  const maxLine = Math.max(...lines.map(visibleLength));
  if (maxLine > columns - 4) {
    throw new Error(`${columns}-column capture emitted a ${maxLine}-column line`);
  }
  return { columns, lines, maxLine };
});

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const palette = {
  31: '#ff7b72',
  32: '#3fb950',
  33: '#d29922',
  34: '#58a6ff',
  35: '#d2a8ff',
  36: '#39c5cf',
  37: '#f0f6fc',
  90: '#8b949e',
};

function ansiSpans(line) {
  const spans = [];
  let cursor = 0;
  let fill = '#e6edf3';
  let weight = 400;
  let opacity = 1;
  const ansi = /\x1b\[([0-9;]*)m/g;

  for (let match = ansi.exec(line); match; match = ansi.exec(line)) {
    if (match.index > cursor) {
      spans.push({ text: line.slice(cursor, match.index), fill, weight, opacity });
    }
    const codes = (match[1] || '0').split(';').map(Number);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];
      if (code === 0) {
        fill = '#e6edf3';
        weight = 400;
        opacity = 1;
      } else if (code === 1) {
        weight = 700;
      } else if (code === 2) {
        opacity = 0.68;
      } else if (palette[code]) {
        fill = palette[code];
      } else if (code === 38 && codes[i + 1] === 2) {
        fill = `rgb(${codes[i + 2]},${codes[i + 3]},${codes[i + 4]})`;
        i += 4;
      }
    }
    cursor = ansi.lastIndex;
  }
  if (cursor < line.length) spans.push({ text: line.slice(cursor), fill, weight, opacity });

  return spans.map(({ text, fill: color, weight: fontWeight, opacity: alpha }) =>
    `<tspan fill="${color}" font-weight="${fontWeight}" opacity="${alpha}">${escapeXml(text)}</tspan>`
  ).join('');
}

function terminalPanel(capture, box, options = {}) {
  const chromeHeight = 31;
  const padX = 16;
  const padTop = 13;
  const lineHeight = options.lineHeight;
  const fontSize = options.fontSize;
  const textY = box.y + chromeHeight + padTop + fontSize;
  const lines = capture.lines.map((line, index) =>
    `<text class="mono" xml:space="preserve" x="${box.x + padX}" y="${textY + index * lineHeight}" font-size="${fontSize}">${ansiSpans(line)}</text>`
  ).join('\n');

  return `
    <g>
      <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="13" fill="#0d1117" stroke="#30363d"/>
      <path d="M${box.x} ${box.y + chromeHeight}H${box.x + box.width}" stroke="#21262d"/>
      <circle cx="${box.x + 16}" cy="${box.y + 15.5}" r="4" fill="#ff5f56"/>
      <circle cx="${box.x + 30}" cy="${box.y + 15.5}" r="4" fill="#ffbd2e"/>
      <circle cx="${box.x + 44}" cy="${box.y + 15.5}" r="4" fill="#27c93f"/>
      <text class="sans" x="${box.x + 60}" y="${box.y + 20}" fill="#8b949e" font-size="12" font-weight="600">${capture.columns} columns</text>
      <text class="sans" x="${box.x + box.width - 16}" y="${box.y + 20}" text-anchor="end" fill="#6e7681" font-size="10">${capture.lines.length} lines · max ${capture.maxLine}</text>
      ${lines}
    </g>`;
}

const top = captures[0];
const medium = captures[1];
const narrow = captures[2];
const topBox = { x: 28, y: 89, width: 1224, height: 150 };
const lowerY = 257;
const lowerHeight = 360;
const mediumBox = { x: 28, y: lowerY, width: 728, height: lowerHeight };
const narrowBox = { x: 774, y: lowerY, width: 478, height: lowerHeight };

const mediumLineHeight = Math.min(14, (lowerHeight - 55) / medium.lines.length);
const narrowLineHeight = Math.min(12, (lowerHeight - 55) / narrow.lines.length);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#17111a"/>
      <stop offset="0.48" stop-color="#080b10"/>
      <stop offset="1" stop-color="#071318"/>
    </linearGradient>
  </defs>
  <style>
    .sans { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .mono { font-family: "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace; }
  </style>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <text class="sans" x="28" y="39" fill="#f0f6fc" font-size="26" font-weight="700">One renderer. Every terminal width.</text>
  <text class="sans" x="28" y="67" fill="#8b949e" font-size="14">Actual built layout output · same seven-card fixture · adaptive exhaustive bin-packing at 120, 80, and 50 columns</text>
  <rect x="1082" y="28" width="170" height="35" rx="17.5" fill="#17212b" stroke="#30363d"/>
  <circle cx="1103" cy="45.5" r="5" fill="#39c5cf"/>
  <text class="sans" x="1116" y="50" fill="#c9d1d9" font-size="12" font-weight="600">deterministic fixture</text>
  ${terminalPanel(top, topBox, { lineHeight: 13.7, fontSize: 12 })}
  ${terminalPanel(medium, mediumBox, { lineHeight: mediumLineHeight, fontSize: Math.max(10.5, mediumLineHeight - 1.8) })}
  ${terminalPanel(narrow, narrowBox, { lineHeight: narrowLineHeight, fontSize: Math.max(9.5, narrowLineHeight - 1.5) })}
</svg>
`;

writeFileSync(SVG_PATH, svg);

if (process.argv.includes('--png')) {
  const require = createRequire(import.meta.url);
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    throw new Error('PNG rendering requires sharp on NODE_PATH; the SVG source was generated successfully');
  }
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
    .toFile(PNG_PATH);
}

rmSync(fixtureTmp, { recursive: true, force: true });

console.log(JSON.stringify({
  svg: SVG_PATH,
  png: process.argv.includes('--png') ? PNG_PATH : null,
  width: WIDTH,
  height: HEIGHT,
  captures: captures.map(({ columns, lines, maxLine }) => ({ columns, lines: lines.length, maxLine })),
}, null, 2));
