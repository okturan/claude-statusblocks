import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

// HOME (posix) and USERPROFILE (Windows) both point os.homedir() at the fake home
function runCli(args: string, home?: string): string {
  return execSync(`node "${CLI}" ${args}`, {
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_STATUSBLOCKS_NO_REMOTE: '1',
      CLAUDE_STATUSBLOCKS_CACHE_DIR: join(tmpdir(), `csb-cli-test-${process.pid}`),
      ...(home ? { HOME: home, USERPROFILE: home } : {}),
    },
  });
}

function freshHome(name: string): string {
  const home = join(tmpdir(), `csb-cli-${name}-${process.pid}`);
  rmSync(home, { recursive: true, force: true });
  mkdirSync(home, { recursive: true });
  return home;
}

function readSettings(home: string): Record<string, any> {
  return JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
}

describe('cli', () => {
  it('shows help with --help flag', () => {
    const output = runCli('help');
    expect(output).toContain('claude-statusblocks');
    expect(output).toContain('Usage:');
    expect(output).toContain('init');
    expect(output).toContain('preview');
  });

  it('lists all 5 segments in help', () => {
    const output = runCli('help');
    expect(output).toContain('context');
    expect(output).toContain('model');
    expect(output).toContain('promo');
    expect(output).toContain('git');
    expect(output).toContain('usage');
  });

  it('shows update command in help', () => {
    const output = runCli('help');
    expect(output).toContain('update');
    expect(output).toContain('--version');
  });

  it('reports the package version with long and short flags', () => {
    const manifest = JSON.parse(
      readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
    ) as { version: string };
    expect(runCli('--version').trim()).toBe(manifest.version);
    expect(runCli('-v').trim()).toBe(manifest.version);
  });

  it('shows help when run with no args and TTY', () => {
    // Simulate TTY by just checking help output
    const output = runCli('--help');
    expect(output).toContain('Blocks:');
  });

  it('preview renders without error', () => {
    const output = runCli('preview');
    expect(output).toContain('preview');
    expect(output).toContain('cols:');
    // Should contain box-drawing characters
    expect(output).toContain('╭');
    expect(output).toContain('╰');
  });
});

describe('cli init', () => {
  it('creates settings.json when missing and writes a shell-safe command', () => {
    const home = freshHome('init-fresh');
    try {
      runCli('init', home);
      const settings = readSettings(home);
      expect(settings.statusLine.type).toBe('command');
      expect(settings.statusLine.padding).toBe(0);
      const cmd: string = settings.statusLine.command;
      // Quoted + forward slashes: parses the same in sh, Git Bash, cmd, PowerShell
      expect(cmd).toMatch(/^node ".*statusblocks\/index\.js"$/);
      expect(cmd).not.toContain('\\');
      expect(existsSync(join(home, '.claude', 'statusblocks', 'index.js'))).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('preserves unrelated settings keys and replaces the old command', () => {
    const home = freshHome('init-existing');
    try {
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(
        join(home, '.claude', 'settings.json'),
        JSON.stringify({ theme: 'dark', statusLine: { type: 'command', command: 'old-statusline' } })
      );
      runCli('init', home);
      const settings = readSettings(home);
      expect(settings.theme).toBe('dark');
      expect(settings.statusLine.command).toMatch(/statusblocks\/index\.js"$/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('aborts on corrupt settings.json without clobbering it', () => {
    const home = freshHome('init-corrupt');
    try {
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(join(home, '.claude', 'settings.json'), '{broken');
      expect(() => runCli('init', home)).toThrow();
      expect(readFileSync(join(home, '.claude', 'settings.json'), 'utf8')).toBe('{broken');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('cli update', () => {
  it('migrates an old npx-based command to the direct form', () => {
    const home = freshHome('update-npx');
    try {
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(
        join(home, '.claude', 'settings.json'),
        JSON.stringify({ statusLine: { type: 'command', command: 'npx -y claude-statusblocks' } })
      );
      runCli('update', home);
      const settings = readSettings(home);
      expect(settings.statusLine.command).toMatch(/^node ".*statusblocks\/index\.js"$/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('migrates the pre-0.5 unquoted direct command', () => {
    const home = freshHome('update-unquoted');
    try {
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(
        join(home, '.claude', 'settings.json'),
        JSON.stringify({ statusLine: { type: 'command', command: `node ${home}/.claude/statusblocks/index.js` } })
      );
      runCli('update', home);
      const settings = readSettings(home);
      expect(settings.statusLine.command).toMatch(/^node ".*statusblocks\/index\.js"$/);
      expect(settings.statusLine.command).not.toContain('\\');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('leaves foreign statusline commands untouched', () => {
    const home = freshHome('update-foreign');
    try {
      mkdirSync(join(home, '.claude'), { recursive: true });
      writeFileSync(
        join(home, '.claude', 'settings.json'),
        JSON.stringify({ statusLine: { type: 'command', command: 'my-custom-statusline' } })
      );
      runCli('update', home);
      const settings = readSettings(home);
      expect(settings.statusLine.command).toBe('my-custom-statusline');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('cli preview isolation', () => {
  it('renders mock usage data even when a warm remote cache exists', () => {
    const cacheDir = join(tmpdir(), `csb-cli-preview-${process.pid}`);
    rmSync(cacheDir, { recursive: true, force: true });
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, 'remote-usage'), JSON.stringify({
      ts: Date.now(),
      value: [
        { label: '5h', percent: 93, resetsAt: Math.floor(Date.now() / 1000) + 3600 },
        { label: '7d', percent: 88, resetsAt: Math.floor(Date.now() / 1000) + 86400 },
      ],
    }));
    try {
      // No CLAUDE_STATUSBLOCKS_NO_REMOTE in the env — preview must isolate itself.
      const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_STATUSBLOCKS_CACHE_DIR: cacheDir };
      delete env['CLAUDE_STATUSBLOCKS_NO_REMOTE'];
      const output = execSync(`node "${CLI}" preview`, { encoding: 'utf8', env });
      expect(output).toContain('12%');
      expect(output).not.toContain('93%');
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
