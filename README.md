<p align="center">
  <img src="docs/claude-statusblocks-preview.png" alt="Deterministic claude-statusblocks renderer output showing the same seven cards bin-packed at 120, 80, and 50 terminal columns" width="100%">
</p>

<p align="center"><em>Actual built renderer output from a neutral, deterministic fixture at 120, 80, and 50 columns. The checked-in SVG source is regenerated with <code>npm run preview:asset</code>.</em></p>

# claude-statusblocks

[![npm version](https://img.shields.io/npm/v/claude-statusblocks)](https://www.npmjs.com/package/claude-statusblocks)
[![license](https://img.shields.io/npm/l/claude-statusblocks)](package.json)

Adaptive, block-based status line for [Claude Code](https://claude.ai/code). Cards reflow into a pyramid layout based on available terminal width using an exhaustive bin-packing algorithm.

**Zero runtime dependencies.** Pure Node.js built-ins only.

## Install

Requires Node.js ≥ 20. Works on macOS, Linux, and Windows.

```sh
npx claude-statusblocks init
```

This copies the renderer to `~/.claude/statusblocks/` and writes `statusLine.command` into `~/.claude/settings.json` (creating it if needed). Restart Claude Code to activate.

### Update

```sh
npx claude-statusblocks@latest update
```

After v0.4.1, updates happen automatically — the statusline checks for new versions daily in the background. The `postinstall` hook also auto-updates when you run `npm update -g claude-statusblocks`. Set `CLAUDE_STATUSBLOCKS_NO_UPDATE=1` to disable the background check.

### Windows notes

- If `npx` fails in PowerShell with "running scripts is disabled", run the command from **cmd.exe** instead (or use `npx.cmd`). This is npm's PowerShell shim colliding with the default execution policy, not a statusblocks issue.
- Installed with a version before 0.5.0 and the statusline shows nothing? Re-run `npx claude-statusblocks@latest init` — older versions wrote a `statusLine.command` that broke on Windows shells (unquoted backslash paths).

## Cards

| Card | Shows |
|------|-------|
| **context** | Context window fill bar, percentage, used/total token count |
| **model** | Model name, tilde-shortened directory, effort level, session duration, version |
| **promo** | 2x off-peak / peak status with countdown to next transition |
| **git** | Branch, staged/modified counts, lines added/removed |
| **usage** | Rate limit utilization with reset countdowns: one line per limit window. Limits sharing a window (e.g. the all-models 7d and a model-scoped Fable bucket, which reset together) collapse to whichever is closer to its cap — the label flips when the other becomes binding |
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
```

## Usage data

The `usage` card has two data sources:

1. **Remote usage limits** (preferred): the same data the claude.ai Usage page and Claude Code's `/usage` screen show, including **model-scoped weekly limits** (e.g. a separate Fable bucket) that Claude Code does not include in the statusline JSON. Fetched from the OAuth usage endpoint by a detached background process — renders never block on the network. Results are cached for up to 5 minutes and refreshed at most once per minute. The limits are rendered generically from the server's response, so if Anthropic changes a model's allocation or adds new scoped limits, they appear without a code change. Model-scoped limits count only while the session runs that model (highlighted in the model color). Limits that share a reset instant refill together, so the one with the higher percentage strictly locks first — the card renders one line per window (session + weekly), showing each window's binding limit. When the all-models bucket overtakes the scoped one mid-week, the weekly label flips (e.g. `Fable` → `7d`), so an approaching account-wide lockout is always visible. Requires your Claude Code OAuth credentials (read from `~/.claude/.credentials.json`, or the Keychain on macOS); the endpoint is undocumented, so this tier may silently stop working if Anthropic changes it — which is exactly why there's a fallback.
2. **Statusline JSON** (fallback): the `five_hour`/`seven_day` buckets from Claude Code's `rate_limits` field (available since v2.1.80). Used whenever remote data is unavailable for any reason — no credentials, no network, locked-down machine.

To disable the remote fetch entirely (statusline JSON only), set `"remoteUsage": false` in `~/.claude-statusblocks.json` or export `CLAUDE_STATUSBLOCKS_NO_REMOTE=1`.

## Width detection

Claude Code doesn't pass terminal width to status line commands ([#22115](https://github.com/anthropics/claude-code/issues/22115)). Detection cascade: std stream columns → `COLUMNS` env var → cached value → (macOS/Linux only) walk up the process tree to find the parent's TTY via `ps`, query its width with `stty`, fall back to `tput cols` → 120. The spawn-based result is cached per session for 15s so renders don't pay two subprocesses each. On Windows there is no reliable way to query the parent console from a piped child, so it uses `COLUMNS` or the 120 fallback.

## Preview

```sh
npx claude-statusblocks preview
```

Check the installed package version with `claude-statusblocks --version` (or `-v`).

## Development

```sh
npm run build       # compile TypeScript
npm run dev         # watch mode
npm test            # run vitest suite
npm run preview     # render with mock data
npm run preview:asset # regenerate the deterministic README preview SVG
```

Tests are co-located with source files (`*.test.ts`). The project uses vitest with fake timers for deterministic campaign engine testing.

## Support and security

Use the [support policy](SUPPORT.md) for compatibility and issue-reporting guidance. Report suspected vulnerabilities privately through the [security policy](SECURITY.md), without posting status-line payloads, transcripts, paths, or settings publicly.

## License

MIT
