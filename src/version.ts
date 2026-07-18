/**
 * Version validation and comparison, shared by the CLI's downgrade guard and
 * the background update check. Strict charset because validated versions get
 * interpolated into shell commands (`npx -y claude-statusblocks@<v>`).
 */
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function isValidVersion(v: string): boolean {
  return VERSION_RE.test(v);
}

/**
 * Is `a` strictly newer than `b`? Numeric major.minor.patch comparison;
 * prerelease/build tags are ignored, so "1.0.0-beta" and "1.0.0" compare
 * equal — conservative in both call sites (guard doesn't block, check
 * doesn't update). Invalid input is never "newer".
 */
export function isNewerVersion(a: string, b: string): boolean {
  if (!isValidVersion(a) || !isValidVersion(b)) return false;
  const pa = a.split(/[-+]/)[0]!.split('.').map(Number);
  const pb = b.split(/[-+]/)[0]!.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i]! !== pb[i]!) return pa[i]! > pb[i]!;
  }
  return false;
}
