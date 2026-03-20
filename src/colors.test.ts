import { describe, it, expect } from 'vitest';
import { color, c, visibleLength, padRight } from './colors.js';

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

  it('returns empty string for zero width', () => {
    expect(padRight('hello', 0)).toBe('');
  });

  it('handles exact width (no-op)', () => {
    const result = padRight('exact', 5);
    expect(visibleLength(result)).toBe(5);
    expect(result).toContain('exact');
  });
});
