# Security policy

## Supported version

Security fixes target the current npm `latest` release and the current `main` branch. Older package versions, forks, and copied installations under `~/.claude/statusblocks/` do not receive backports. Confirm the installed version with `claude-statusblocks --version` before reporting a problem.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue, discussion, or pull request. Use GitHub's [private vulnerability reporting form](https://github.com/okturan/claude-statusblocks/security/advisories/new).

Include the affected package version and platform, reproduction steps, impact, and any suggested mitigation. Remove personal paths, repository content, Claude Code status-line payloads, transcripts, settings, environment values, and credentials from attachments and logs.

The maintainer will use the private advisory to confirm scope, coordinate a fix, and agree on disclosure. A report may be closed when it cannot be reproduced, concerns an unsupported version or third-party deployment, or describes documented behavior without a new exploit.

## Trust boundary

The renderer accepts Claude Code's status-line JSON on standard input. It may read local Claude Code settings, the optional `~/.claude-statusblocks.json` configuration, Git metadata, and small cache files; `init` and `update` copy the built renderer and update the user's Claude Code settings. Terminal-width detection invokes local system tools where available. The daily update check can launch npm to retrieve the latest package unless `CLAUDE_STATUSBLOCKS_NO_UPDATE=1` is set.

Reports that demonstrate unintended command execution, unsafe settings changes, exposure of status-line or repository data, package-update compromise, or traversal outside the documented files are in scope.
