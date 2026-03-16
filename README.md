```
╭─ context ──╮ ╭─ model ────────────────╮
│ ████▒▒▒▒▒▒ │ │ Opus 4.6 · ~/my-proj   │
│ 24% · 1.0M │ │ 2h15m          v2.1.76 │
╰────────────╯ ╰────────────────────────╯
╭─ promo ───────╮ ╭─ git ──────────────╮ ╭─ usage ──────────────╮
│ 2× off-peak   │ │ main               │ │ ████▒▒▒▒ 42% 5h ↻3h │
│ → peak 3h 12m │ │ 2 staged · +47 -12 │ │ ██▒▒▒▒▒▒ 18% 7d ↻4d │
╰───────────────╯ ╰────────────────────╯ ╰──────────────────────╯
```

# claudeline

Adaptive, block-based status line for [Claude Code](https://claude.ai/code). Cards reflow into a pyramid layout based on available terminal width.

## Install

```sh
npx claudeline init
```

This writes `statusLine.command` into `~/.claude/settings.json`. Restart Claude Code to activate.

## Cards

| Card | Shows |
|------|-------|
| **context** | Context window fill — progress bar, percentage, token count |
| **model** | Model name, working directory (tilde-shortened), session duration, Claude Code version |
| **promo** | Active rate promotions — 2× off-peak status with countdown to next transition |
| **git** | Branch, staged/modified file counts, lines added/removed |
| **usage** | 5-hour and 7-day API utilization with reset countdowns (fetched from Anthropic's OAuth API) |

Cards appear and disappear based on context — `git` only shows in repos, `promo` only during active promotions, `usage` only when OAuth credentials are available.

## Layout

Cards flow into rows with a pyramid shape — row 1 is narrower than row 2. When all cards don't fit on a single row, claudeline tries every possible card-to-row assignment and picks the tightest pyramid.

On narrow terminals, lower-priority cards are dropped entirely rather than wrapping badly.

## Configure

`~/.claudeline.json`:

```json
{
  "segments": ["context", "model", "usage"]
}
```

Or via environment:

```sh
CLAUDELINE_SEGMENTS=context,model,usage
```

## Width detection

Claude Code doesn't pass terminal width to status line commands ([#22115](https://github.com/anthropics/claude-code/issues/22115)). Claudeline walks up the process tree to find the parent's TTY via `ps`, then queries its width with `stty`. Falls back to `tput cols`, then 120.

## Usage API

The `usage` card fetches utilization data from `api.anthropic.com/api/oauth/usage` using your Claude Code OAuth token (read from macOS Keychain or `~/.claude/.credentials.json`). Results are cached for 3 minutes. No data is sent anywhere except Anthropic's API.

## Preview

```sh
npx claudeline preview
```
