```
╭─ context ──────╮ ╭─ model ────────────────────╮ ╭─ vim ───╮
│ ████▒▒▒▒▒▒▒▒▒▒ │ │ Opus 4.6 · ~/my-proj       │ │ NORMAL  │
│ 24% · 245K/1.0M│ │ high · 2h15m · v2.1.91     │ ╰─────────╯
╰────────────────╯ ╰────────────────────────────╯
╭─ promo ───────╮ ╭─ git ──────────────╮ ╭─ usage ─────────────────╮
│ 2× off-peak   │ │ main               │ │ ████▒▒▒▒ 42% · ↻3h · 5h │
│ → peak 3h 12m │ │ 2 staged · +47 -12 │ │ ██▒▒▒▒▒▒ 18% · ↻4d · 7d │
╰───────────────╯ ╰────────────────────╯ ╰─────────────────────────╯
```

# claude-statusblocks

[![npm version](https://img.shields.io/npm/v/claude-statusblocks)](https://www.npmjs.com/package/claude-statusblocks)
[![license](https://img.shields.io/npm/l/claude-statusblocks)](https://github.com/okturan/claude-statusblocks/blob/main/LICENSE)

Adaptive, block-based status line for [Claude Code](https://claude.ai/code). Cards reflow into a pyramid layout based on available terminal width using an exhaustive bin-packing algorithm.

**Zero runtime dependencies.** Pure Node.js built-ins only.

## Install

```sh
npx claude-statusblocks init
```

This writes `statusLine.command` into `~/.claude/settings.json`. Restart Claude Code to activate.

### Update

```sh
npx claude-statusblocks update
```

After v0.4.1, updates happen automatically — the statusline checks for new versions daily in the background. The `postinstall` hook also auto-updates when you run `npm update -g claude-statusblocks`.

## Cards

| Card | Shows |
|------|-------|
| **context** | Context window fill bar, percentage, used/total token count |
| **model** | Model name, tilde-shortened directory, effort level, session duration, version |
| **promo** | 2x off-peak / peak status with countdown to next transition |
| **git** | Branch, staged/modified counts, lines added/removed |
| **usage** | 5-hour and 7-day rate limit utilization with reset countdowns |
| **vim** | Vim mode indicator (NORMAL/INSERT) |
| **agent** | Active agent name and type when running with `--agent` |
| **worktree** | Worktree branch and original branch when in a `--worktree` session |

Cards appear based on context: `git` only in repos, `promo` only during active rate promotions, `usage` when rate limit data is available (Claude Code ≥2.1.80), `vim`/`agent`/`worktree` only when those features are active.

## Layout

Cards are bin-packed into rows for optimal fit — blocks can be freely reordered across rows. Rows are sorted narrowest-on-top (pyramid shape). The algorithm tries every possible row assignment and picks the layout with fewest rows and most balanced widths.

Row 1 gets extra right margin to avoid overlapping Claude Code's notification panel. On narrow/split-pane terminals, the layout degrades gracefully to stacked single-block rows.

## Configure

`~/.claude-statusblocks.json`:

```json
{
  "segments": ["context", "model", "usage"]
}
```

Or via environment:

```sh
CLAUDE_STATUSBLOCKS_SEGMENTS=context,model,usage
CLAUDE_STATUSBLOCKS_THEME=minimal
```

## Usage data

The `usage` card reads rate limit data directly from Claude Code's `rate_limits` field in the statusline JSON (available since v2.1.80). No external API calls, OAuth tokens, or caching needed.

## Width detection

Claude Code doesn't pass terminal width to status line commands ([#22115](https://github.com/anthropics/claude-code/issues/22115)). We walk up the process tree to find the parent's TTY via `ps`, then query its width with `stty`. Falls back to `tput cols`, then 120.

## Preview

```sh
npx claude-statusblocks preview
```

## Development

```sh
npm run build       # compile TypeScript
npm run dev         # watch mode
npm test            # run vitest suite
npm run preview     # render with mock data
```

Tests are co-located with source files (`*.test.ts`). The project uses vitest with fake timers for deterministic campaign engine testing.

## License

MIT
