# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Claude-statusblocks is an opinionated, block-based status line for Claude Code. It reads JSON session data from stdin (piped by Claude Code's `statusLine.command` setting) and renders multi-block terminal output with ANSI colors, box-drawing characters, and adaptive row wrapping.

## Commands

- `npm run build` — compile TypeScript (`tsc`) to `dist/`
- `npm run dev` — watch mode (`tsc --watch`)
- `npm run preview` — render with mock JSON data piped to the built output
- `claude-statusblocks init` — writes `statusLine` config into `~/.claude/settings.json`
- `claude-statusblocks preview` — renders at 120/80/50 column widths with mock data

There are no tests or linters configured.

## Architecture

**Data flow:** Claude Code pipes JSON (`StatusLineData`) to stdin → `src/index.ts` parses it, loads config, detects terminal width → `src/layout.ts` renders segments into boxified blocks with flexbox-like row wrapping → stdout.

**Terminal width detection** (`src/index.ts`): Claude Code doesn't pass terminal width to status line commands (known issue #22115). Detection cascade: `process.stderr.columns` → walk parent process tree via `ps` to find TTY, then `stty size` on that TTY → `tput cols` → fallback 120. The detected width has a 44-char reserve subtracted for Claude Code's Ink notification panel on the right side.

**Segments** (`src/segments/`) are the core rendering units. Each implements the `Segment` interface (`id`, `priority`, `enabled()`, `render()`). Available segments:
- `context` (priority 10) — context window usage bar with token counts
- `usage` (priority 15) — 5-hour and 7-day rate limit utilization from `rate_limits` field in statusline JSON (requires Claude Code ≥2.1.80)
- `promo` (priority 20) — rate promotion status with peak/off-peak countdown
- `model` (priority 30) — model name, tilde-shortened directory, duration, version
- `git` (priority 40) — branch name, staged/modified counts, lines added/removed

**Layout** (`src/layout.ts`): Flows segments into rows using flexbox-like wrapping. Cards are placed left-to-right; when the next card would exceed `maxRowWidth`, a new row starts. Multi-block rows are expanded to fill `maxRowWidth` by distributing extra space evenly across blocks, ensuring consistent row alignment. Within each row, shorter boxes are height-padded with blank bordered rows (required because Claude Code's Ink renderer strips leading whitespace, breaking alignment when boxes have different heights). Priority numbers are only used as a last resort for dropping segments that don't fit even alone.

**Campaigns** (`src/campaigns/`) track Anthropic promotional rate periods. `data.ts` holds campaign definitions (dates, peak hours, multipliers). `engine.ts` evaluates current time against campaigns using `Intl.DateTimeFormat` with `formatToParts` for precise timezone-aware peak detection. Returns state (`active-boosted`, `active-normal`, `weekend`, `upcoming`) with countdown and progress.

**Usage data**: Since Claude Code ≥2.1.80, rate limit data (5-hour and 7-day windows) is provided directly in the `rate_limits` field of the statusline JSON. No external API calls or OAuth tokens needed.

**Config** (`src/config.ts`) loads from `~/.claude-statusblocks.json` with env var overrides (`CLAUDE_STATUSBLOCKS_SEGMENTS`, `CLAUDE_STATUSBLOCKS_THEME`). Controls segment order and theme.

**CLI** (`src/cli.ts`) handles subcommands (`init`, `preview`, `help`). When no TTY is detected (piped input), delegates to `src/index.ts`.

## Key Patterns

- All ANSI color handling goes through `src/colors.ts` — use `color()`, `c.*` constants, `visibleLength()`, `padRight()`, and `truncate()` for ANSI-aware string operations.
- Segments return raw lines (no box chrome); boxing is applied by `layout.ts`.
- Box titles are rendered in the top border: `╭─ title ──────╮`.
- The `Block` type's `width` is the visible (ANSI-stripped) width, not byte length.
- The git segment caches results for 5 seconds to avoid repeated subprocess calls.
- ESM-only (`"type": "module"` in package.json) — all local imports use `.js` extensions. Do NOT use `require()` — it will crash silently in production.
- Claude Code's Ink renderer uses `wrap="truncate"` (hardcoded). Lines exceeding available width get truncated with `…`. Design all output to fit within `termWidth - 44` chars.
