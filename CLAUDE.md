# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Claudeline is an opinionated, block-based status line for Claude Code. It reads JSON session data from stdin (piped by Claude Code's `statusLine.command` setting) and renders a multi-block terminal output with ANSI colors and box-drawing characters.

## Commands

- `npm run build` — compile TypeScript (`tsc`) to `dist/`
- `npm run dev` — watch mode (`tsc --watch`)
- `npm run preview` — render with mock JSON data piped to the built output
- `claudeline init` — writes `statusLine` config into `~/.claude/settings.json`
- `claudeline preview` — renders at 120/80/50 column widths with mock data

There are no tests or linters configured.

## Architecture

**Data flow:** Claude Code pipes JSON (`StatusLineData`) to stdin → `src/index.ts` parses it, loads config, detects terminal width → `src/layout.ts` renders segments into boxified blocks arranged horizontally → stdout.

**Segments** (`src/segments/`) are the core rendering units. Each implements the `Segment` interface (`id`, `priority`, `enabled()`, `render()`). Available segments:
- `context` (priority 1) — context window usage bar with token counts
- `model` (priority 2) — model name, directory, cost, duration, lines changed
- `git` (priority 3) — branch name + staged/modified file counts (shells out to `git`)
- `campaign` (priority 4) — Anthropic rate promotion status with peak/off-peak tracking

**Layout** (`src/layout.ts`) renders all enabled segments, then drops lowest-priority segments (highest priority number) one at a time until everything fits within terminal width. Each segment is wrapped in a Unicode box (`╭╮╰╯│`).

**Campaigns** (`src/campaigns/`) track Anthropic promotional rate periods. `data.ts` holds campaign definitions (dates, peak hours, multipliers). `engine.ts` evaluates current time against campaigns to determine state (`active-boosted`, `active-normal`, `weekend`, `upcoming`).

**Config** (`src/config.ts`) loads from `~/.claudeline.json` with env var overrides (`CLAUDELINE_SEGMENTS`, `CLAUDELINE_THEME`). Controls segment order and theme.

**CLI** (`src/cli.ts`) handles subcommands (`init`, `preview`, `help`). When no TTY is detected (piped input), delegates to `src/index.ts`.

## Key Patterns

- All ANSI color handling goes through `src/colors.ts` — use `color()`, `c.*` constants, `visibleLength()`, `padRight()`, and `truncate()` for ANSI-aware string operations.
- Segments return raw lines (no box chrome); boxing is applied by `layout.ts`.
- The `Block` type's `width` is the visible (ANSI-stripped) width, not byte length.
- The git segment caches results for 5 seconds to avoid repeated subprocess calls.
- ESM-only (`"type": "module"` in package.json) — all local imports use `.js` extensions.
