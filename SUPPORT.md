# Support policy

## Supported environment

The maintained surface is the current npm `latest` release on Node.js 20 or newer, used with a current Claude Code installation on macOS, Linux, or Windows. Older package versions, forks, custom builds, and modified installed copies are best-effort only.

Before opening an issue:

1. Confirm the version with `claude-statusblocks --version`.
2. Re-run `npx claude-statusblocks@latest init` if the installation predates `0.5.0` or the configured command is stale.
3. Reproduce with custom segments and themes disabled when possible.
4. Check that the issue also occurs on a supported Node.js version.

Use [GitHub Issues](https://github.com/okturan/claude-statusblocks/issues) for reproducible bugs and focused feature requests. Include the package version, operating system, Node.js version, terminal width, expected behavior, and a minimal sanitized reproduction. Do not post transcripts, credentials, private repository content, personal paths, or full Claude Code settings.

This project is maintained without a response-time or resolution-time guarantee. Security-sensitive reports belong in the private channel described by [SECURITY.md](SECURITY.md), not in public issues.
