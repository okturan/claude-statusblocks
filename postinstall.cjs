// Auto-update ~/.claude/statusblocks/ on npm install/update (if already installed via init)
const { existsSync } = require('fs');
const { execFileSync } = require('child_process');
const { join } = require('path');
const { homedir } = require('os');

try {
  const dest = join(homedir(), '.claude', 'statusblocks');
  if (existsSync(dest)) {
    // Delegate to the CLI's guarded update: version-stamped, downgrade-safe,
    // and sweeps stale files. A bare cpSync here could clobber a newer install
    // (any `npm install` of an old cached copy would run this hook).
    execFileSync(process.execPath, [join(__dirname, 'dist', 'cli.js'), 'update'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  }
} catch {
  // Best-effort — don't fail the install
}
