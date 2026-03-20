import { describe, it, expect } from 'vitest';
import { color, c, visibleLength, padRight, pctColor } from './colors.js';

describe('color', () => {
  it('wraps text with ANSI codes and reset', () => {
    const result = color('hello', c.red);
    expect(result).toContain('hello');
    expect(result).toContain(c.reset);
    expect(result.startsWith(c.red)).toBe(true);
  });

  it('applies multiple codes', () => {
    const result = color('bold red', c.red, c.bold);
    expect(result.startsWith(c.red + c.bold)).toBe(true);
  });
});

describe('visibleLength', () => {
  it('returns length of plain text', () => {
    expect(visibleLength('hello')).toBe(5);
  });

  it('strips ANSI SGR codes', () => {
    expect(visibleLength(color('abc', c.red))).toBe(3);
    expect(visibleLength(color('test', c.orange, c.bold))).toBe(4);
  });

  it('handles empty string', () => {
    expect(visibleLength('')).toBe(0);
  });

  it('handles string with only ANSI codes', () => {
    expect(visibleLength(c.red + c.reset)).toBe(0);
  });

  it('handles nested color calls', () => {
    const nested = color(color('inner', c.green), c.dim);
    expect(visibleLength(nested)).toBe(5);
  });
});

describe('padRight', () => {
  it('pads plain text to target width', () => {
    const result = padRight('hi', 5);
    expect(visibleLength(result)).toBe(5);
  });

  it('pads ANSI-styled text correctly', () => {
    const styled = color('hi', c.red);
    const result = padRight(styled, 10);
    expect(visibleLength(result)).toBe(10);
  });

  it('truncates when text exceeds width', () => {
    const result = padRight('hello world', 5);
    expect(visibleLength(result)).toBe(5);
  });

  it('truncates ANSI-styled text to exact visible width', () => {
    const styled = color('hello world', c.red, c.bold);
    const result = padRight(styled, 5);
    expect(visibleLength(result)).toBe(5);
    // Should preserve content up to the cut point
    expect(result.replace(/\x1b\[[0-9;]*m/g, '')).toBe('hello');
  });

  it('truncates at ANSI boundary without breaking sequences', () => {
    // "ab" styled red + "cd" styled green — truncate to 3 chars
    const input = color('ab', c.red) + color('cd', c.green);
    const result = padRight(input, 3);
    expect(visibleLength(result)).toBe(3);
    // Should contain 'abc' (2 from first + 1 from second)
    expect(result.replace(/\x1b\[[0-9;]*m/g, '')).toBe('abc');
  });

  it('truncates to 1 character', () => {
    const result = padRight(color('hello', c.red), 1);
    expect(visibleLength(result)).toBe(1);
    expect(result.replace(/\x1b\[[0-9;]*m/g, '')).toBe('h');
  });

  it('returns empty string for zero width', () => {
    expect(padRight('hello', 0)).toBe('');
  });

  it('handles exact width (no-op)', () => {
    const result = padRight('exact', 5);
    expect(visibleLength(result)).toBe(5);
    expect(result).toContain('exact');
  });
});

describe('pctColor', () => {
  it('returns red for >= 90%', () => {
    expect(pctColor(90)).toBe(c.red);
    expect(pctColor(100)).toBe(c.red);
  });

  it('returns yellow for >= 70%', () => {
    expect(pctColor(70)).toBe(c.yellow);
    expect(pctColor(89)).toBe(c.yellow);
  });

  it('returns green for < 70%', () => {
    expect(pctColor(0)).toBe(c.green);
    expect(pctColor(69)).toBe(c.green);
  });
});
