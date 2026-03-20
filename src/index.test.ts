import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';

const INDEX = join(import.meta.dirname, '..', 'dist', 'index.js');

const VALID_JSON = JSON.stringify({
  model: { id: 'test', display_name: 'Test' },
  workspace: { current_dir: '/tmp', project_dir: '/tmp' },
  version: '1.0',
  cost: { total_cost_usd: 0, total_duration_ms: 60000, total_api_duration_ms: 0, total_lines_added: 0, total_lines_removed: 0 },
  context_window: { context_window_size: 1000000, used_percentage: 20, remaining_percentage: 80, total_input_tokens: 200000, total_output_tokens: 0, current_usage: null },
  exceeds_200k_tokens: false,
  session_id: 'test',
});

describe('index (stdin pipeline)', () => {
  it('renders status blocks from valid JSON', () => {
    const output = execSync(`echo '${VALID_JSON}' | node ${INDEX}`, {
      encoding: 'utf8', shell: '/bin/sh',
    });
    expect(output).toContain('╭');
    expect(output).toContain('context');
    expect(output).toContain('model');
  });

  it('outputs blank line for invalid JSON', () => {
    const output = execSync(`echo 'not json' | node ${INDEX}`, {
      encoding: 'utf8', shell: '/bin/sh',
    });
    expect(output.trim()).toBe('');
  });

  it('outputs blank line for empty input', () => {
    const output = execSync(`echo '' | node ${INDEX}`, {
      encoding: 'utf8', shell: '/bin/sh',
    });
    expect(output.trim()).toBe('');
  });

  it('outputs blank line for JSON array (not object)', () => {
    const output = execSync(`echo '[1,2,3]' | node ${INDEX}`, {
      encoding: 'utf8', shell: '/bin/sh',
    });
    expect(output.trim()).toBe('');
  });

  it('outputs blank line for JSON missing required fields', () => {
    const output = execSync(`echo '{"foo":"bar"}' | node ${INDEX}`, {
      encoding: 'utf8', shell: '/bin/sh',
    });
    expect(output.trim()).toBe('');
  });

  it('includes rate_limits usage card when provided', () => {
    const data = {
      ...JSON.parse(VALID_JSON),
      rate_limits: {
        five_hour: { used_percentage: 50, resets_at: Math.floor(Date.now() / 1000) + 3600 },
        seven_day: { used_percentage: 70, resets_at: Math.floor(Date.now() / 1000) + 86400 },
      },
    };
    const output = execSync(`echo '${JSON.stringify(data)}' | node ${INDEX}`, {
      encoding: 'utf8', shell: '/bin/sh',
    });
    expect(output).toContain('usage');
    expect(output).toContain('5h');
    expect(output).toContain('7d');
  });
});
