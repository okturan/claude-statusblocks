// Auto-update ~/.claude/statusblocks/ on npm install/update (if already installed via init)
const { cpSync, existsSync } = require('fs');
const { join } = require('path');
const { homedir } = require('os');

try {
  const dest = join(homedir(), '.claude', 'statusblocks');
  if (existsSync(dest)) {
    cpSync(join(__dirname, 'dist'), dest, { recursive: true, force: true });
  }
} catch {
  // Best-effort — don't fail the install
}
