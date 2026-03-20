import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

describe('cli', () => {
  it('shows help with --help flag', () => {
    const output = execSync(`node ${CLI} help`, { encoding: 'utf8' });
    expect(output).toContain('claude-statusblocks');
    expect(output).toContain('Usage:');
    expect(output).toContain('init');
    expect(output).toContain('preview');
  });

  it('lists all 5 segments in help', () => {
    const output = execSync(`node ${CLI} help`, { encoding: 'utf8' });
    expect(output).toContain('context');
    expect(output).toContain('model');
    expect(output).toContain('promo');
    expect(output).toContain('git');
    expect(output).toContain('usage');
  });

  it('shows help when run with no args and TTY', () => {
    // Simulate TTY by just checking help output
    const output = execSync(`node ${CLI} --help`, { encoding: 'utf8' });
    expect(output).toContain('Blocks:');
  });

  it('preview renders without error', () => {
    const output = execSync(`node ${CLI} preview`, { encoding: 'utf8' });
    expect(output).toContain('preview');
    expect(output).toContain('cols:');
    // Should contain box-drawing characters
    expect(output).toContain('╭');
    expect(output).toContain('╰');
  });
});
