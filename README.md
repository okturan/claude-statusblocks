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

Cards show up based on context: `git` only in repos, `promo` only during active promotions, `usage` only when OAuth credentials exist.

## Layout

Cards flow into rows with a pyramid shape: row 1 is narrower than row 2. When cards don't fit on a single row, it tries every possible assignment and picks the tightest pyramid.

On narrow terminals, lower-priority cards are dropped entirely rather than wrapping badly.

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

## Usage API

The `usage` card fetches utilization data from `api.anthropic.com/api/oauth/usage` using your Claude Code OAuth token (read from macOS Keychain or `~/.claude/.credentials.json`). Results are cached for 3 minutes. No data is sent anywhere except Anthropic's API.

## Preview

```sh
npx claude-statusblocks preview
```
