# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Claude-statusblocks is an opinionated, block-based status line for Claude Code. It reads JSON session data from stdin (piped by Claude Code's `statusLine.command` setting) and renders multi-block terminal output with ANSI colors, box-drawing characters, and adaptive row wrapping.

## Commands

- `npm run build` — compile TypeScript (`tsc`) to `dist/`
- `npm run dev` — watch mode (`tsc --watch`)
- `npm run preview` — render mock data at multiple widths (`node dist/cli.js preview`)
- `claude-statusblocks init` — writes `statusLine` config into `~/.claude/settings.json`
- `claude-statusblocks preview` — renders at 120/80/50 column widths with mock data

- `npm test` — run vitest test suite (co-located `.test.ts` files)

## Architecture

**Data flow:** Claude Code pipes JSON (`StatusLineData`) to stdin → `src/index.ts` parses it, loads config, detects terminal width → `src/layout.ts` renders segments into boxified blocks with flexbox-like row wrapping → stdout.

**Terminal width detection** (`src/index.ts`): Claude Code doesn't pass terminal width to status line commands (known issue #22115). Detection cascade: `process.stderr.columns` → `COLUMNS` env var → per-session file cache → (non-Windows only) walk parent process tree via `ps` to find TTY, then `stty size` on that TTY → `tput cols` → fallback 120. The spawn-based result is cached (15s TTL, keyed by session_id) via `src/cache.ts` so repeated renders don't each pay two subprocess spawns. On Windows the Unix commands are skipped entirely. The detected width has a 44-char reserve subtracted for Claude Code's Ink notification panel on the right side.

**Cross-process caching** (`src/cache.ts`): every render is a fresh node process, so module-level caches don't survive between renders. Short-TTL JSON files in a per-user tmp dir (`$TMPDIR/claude-statusblocks-<uid>/`) do. Used by width detection and the git segment. All cache operations are best-effort; values loaded from cache are re-validated/sanitized before use.

**Segments** (`src/segments/`) are the core rendering units. Each implements the `Segment` interface (`id`, `priority`, `enabled()`, `render()`). Available segments:
- `context` (priority 10) — context window usage bar with token counts
- `usage` (priority 15) — rate limit utilization: remote usage limits when the background-fetched cache is warm, falling back to the `rate_limits` field in statusline JSON (requires Claude Code ≥2.1.80). Model-scoped weekly buckets (e.g. Fable) render highlighted and only while the session's model matches; generic 5h/7d always render.
- `promo` (priority 20) — rate promotion status with peak/off-peak countdown
- `model` (priority 30) — model name, tilde-shortened directory, duration, version
- `git` (priority 40) — branch name, staged/modified counts, lines added/removed

**Layout** (`src/layout.ts`): Uses exhaustive bin-packing to assign blocks to rows optimally. Blocks can be freely reordered across rows (not order-preserving) — within each row, blocks keep their original segment order. Rows are sorted by width ascending (pyramid: narrowest on top, widest on bottom). Row 1 gets 5 extra chars of right margin for Claude Code's notification panel. The algorithm tries all possible assignments (at most ~4400 for 5 blocks) and picks: fewest rows first, then smallest widest row. Within each row, shorter boxes are height-padded with blank bordered rows (required because Claude Code's Ink renderer strips leading whitespace, breaking alignment when boxes have different heights). Priority numbers are only used as a last resort for dropping segments that don't fit even alone.

**Campaigns** (`src/campaigns/`) track Anthropic promotional rate periods. `data.ts` holds campaign definitions (dates, peak hours, multipliers). `engine.ts` evaluates current time against campaigns using `Intl.DateTimeFormat` with `formatToParts` for precise timezone-aware peak detection. Returns state (`active-boosted`, `active-normal`, `weekend`, `upcoming`) with countdown and progress.

**Usage data** (`src/remote-usage.ts`, `src/remote-usage-fetch.ts`, `src/credentials.ts`): two tiers. Preferred: remote usage limits from the undocumented OAuth usage endpoint (`api.anthropic.com/api/oauth/usage`) — the same source as claude.ai's Usage page and Claude Code's `/usage` screen. This is the only source that carries **model-scoped weekly limits** (e.g. a separate Fable bucket); the statusline JSON does not include them. `normalizeLimits()` accepts ONLY the raw server shape and is kind-guarded: known generic kinds (`session`→5h, `weekly_all`→7d via the shared `KIND_LABELS`) can never be relabeled or flipped scoped by future server fields; model scopes keep a full-name lowercase `match` key (and server `id` when populated) separate from the 12-char display label; surface scopes are marked but never rendered (the statusline is not that surface). Cache reads go through a separate `validateLimits()` for the normalized shape — the two shapes are never sniffed apart by field presence. The render path NEVER touches the network and reads the cache file at most once per process (memoized; `resetRemoteUsageMemo()` is the test hook). `maybeRefreshRemoteUsage()` (called from `index.ts` after output, and only when the `usage` segment is in the active segment list) spawns a detached child running `remote-usage-fetch.js`, throttled by an atomic O_EXCL marker (`acquireMarker` in `src/cache.ts`) so concurrent renders can't double-spawn. The child resolves the OAuth token from `$CLAUDE_CONFIG_DIR/.credentials.json` (or `~/.claude`), then the macOS Keychain via `security`; every failure is silent. Fallback: the `rate_limits` field (5-hour and 7-day buckets, clamped) from the statusline JSON (Claude Code ≥2.1.80) — also used whenever the model-scope filter leaves nothing visible, so valid 5h/7d data is never discarded, and `enabled()` mirrors `render()` so a width-0 usage box can never be drawn. Kill switches are equivalent: `"remoteUsage": false` in config is bridged onto `CLAUDE_STATUSBLOCKS_NO_REMOTE` at process start, and both stop refreshes AND cache reads (tests set the env var for subprocess runs; `preview` sets it internally so mock data can't be replaced by the user's real cache). `writeCache` is atomic (temp file + rename) since the remote-usage file has an independent writer and per-render readers. `CLAUDE_STATUSBLOCKS_CACHE_DIR` overrides the cache dir so tests never touch (or read!) the developer's real cache.

**Config** (`src/config.ts`) loads segment order from `~/.claude-statusblocks.json`, with `CLAUDE_STATUSBLOCKS_SEGMENTS` as an environment override.

**CLI** (`src/cli.ts`) handles subcommands (`init`, `update`, `preview`, `help`). When no TTY is detected (piped input), delegates to `src/index.ts`. The `init` command copies dist files to `~/.claude/statusblocks/` and sets the statusLine command to `node "<home>/.claude/statusblocks/index.js"` for fast direct invocation (bypasses npx overhead). The command string MUST stay quoted with forward slashes — it has to parse identically in sh, Git Bash, cmd, and PowerShell (Windows homes contain backslashes and often spaces). `init` creates `~/.claude/settings.json` if missing but aborts on unparseable JSON. The `update` command refreshes the installed files and migrates any stale command form (old npx invocation or pre-0.5 unquoted paths).

## Key Patterns

- All ANSI color handling goes through `src/colors.ts` — use `color()`, `c.*` constants, `visibleLength()`, `padRight()`, and `truncate()` for ANSI-aware string operations.
- Segments return raw lines (no box chrome); boxing is applied by `layout.ts`.
- Box titles are rendered in the top border: `╭─ title ──────╮`.
- The `Block` type's `width` is the visible (ANSI-stripped) width, not byte length.
- The git segment caches results for 5 seconds via the cross-process file cache in `src/cache.ts` (a module-level cache alone would never hit — each render is a new process). Detached HEAD renders as `@<short-sha>`.
- The daily background self-update (`maybeAutoUpdate` in `src/index.ts`) is disabled by `CLAUDE_STATUSBLOCKS_NO_UPDATE=1` — tests set this so runs never mutate the developer's real `~/.claude/statusblocks/`.
- Code must stay Windows-safe: no Unix-only subprocesses outside `process.platform !== 'win32'` guards, no unquoted paths in generated commands, and all detached spawns go through `spawnDetached()` in `src/spawn.ts` (sole owner of the detached/`windowsHide`/unref contract). CI runs the suite on ubuntu/macos/windows.
- ESM-only (`"type": "module"` in package.json) — all local imports use `.js` extensions. Do NOT use `require()` — it will crash silently in production.
- Claude Code's Ink renderer uses `wrap="truncate"` (hardcoded). Lines exceeding available width get truncated with `…`. Design all output to fit within `termWidth - 44` chars.
