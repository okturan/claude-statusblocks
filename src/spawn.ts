import { spawn } from 'child_process';

/**
 * Fire-and-forget background child. Sole owner of the detached-spawn
 * contract: detached + ignored stdio + windowsHide (detached children get
 * their own console window on Windows otherwise) + unref so the parent
 * render process can exit immediately.
 */
export function spawnDetached(command: string, args?: string[], extra?: { shell?: boolean }): void {
  const child = spawn(command, args ?? [], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    ...extra,
  });
  child.unref();
}
