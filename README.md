```
╭─ context ──────╮ ╭─ model ────────────────────╮
│ ████▒▒▒▒▒▒▒▒▒▒ │ │ Opus 4.6 · ~/my-proj       │
│ 24% · 245K/1.0M│ │ high · 2h15m · v2.1.76     │
╰────────────────╯ ╰────────────────────────────╯
╭─ promo ───────╮ ╭─ git ──────────────╮ ╭─ usage ─────────────────╮
│ 2× off-peak   │ │ main               │ │ ████▒▒▒▒ 42% · ↻3h · 5h │
│ → peak 3h 12m │ │ 2 staged · +47 -12 │ │ ██▒▒▒▒▒▒ 18% · ↻4d · 7d │
╰───────────────╯ ╰────────────────────╯ ╰─────────────────────────╯
```

# claude-statusblocks

Adaptive, block-based status line for [Claude Code](https://claude.ai/code). Cards reflow into a pyramid layout based on available terminal width.

## Install

```sh
npx claude-statusblocks init
```

This writes `statusLine.command` into `~/.claude/settings.json`. Restart Claude Code to activate.

## Cards

| Card | Shows |
|------|-------|
| **context** | Context window fill bar, percentage, used/total token count |
| **model** | Model name, tilde-shortened directory, effort level, session duration, version |
| **promo** | 2x off-peak status, countdown to next transition |
| **git** | Branch, staged/modified counts, lines added/removed |
| **usage** | 5-hour and 7-day API utilization with reset countdowns |

Cards show up based on context: `git` only in repos, `promo` only during active promotions, `usage` when rate limit data is available (Claude Code ≥2.1.80).

## Layout

Cards are bin-packed into rows for optimal fit — blocks can be freely reordered across rows. Rows are sorted narrowest-on-top (pyramid shape). The algorithm tries every possible assignment and picks the layout with fewest rows and most balanced widths.

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
```

## Width detection

Claude Code doesn't pass terminal width to status line commands ([#22115](https://github.com/anthropics/claude-code/issues/22115)). We walk up the process tree to find the parent's TTY via `ps`, then query its width with `stty`. Falls back to `tput cols`, then 120.

## Usage data

The `usage` card reads rate limit data directly from Claude Code's `rate_limits` field in the statusline JSON (available since v2.1.80). No external API calls, OAuth tokens, or caching needed.

## Preview

```sh
npx claude-statusblocks preview
```
