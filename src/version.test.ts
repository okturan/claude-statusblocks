import { describe, it, expect } from 'vitest';
import { isValidVersion, isNewerVersion } from './version.js';

describe('isValidVersion', () => {
  it('accepts plain and prerelease semver', () => {
    expect(isValidVersion('0.6.4')).toBe(true);
    expect(isValidVersion('10.20.30')).toBe(true);
    expect(isValidVersion('1.0.0-beta.1')).toBe(true);
    expect(isValidVersion('1.0.0+build.5')).toBe(true);
  });

  it('rejects anything unsafe to interpolate into a shell command', () => {
    expect(isValidVersion('')).toBe(false);
    expect(isValidVersion('1.0')).toBe(false);
    expect(isValidVersion('latest')).toBe(false);
    expect(isValidVersion('1.0.0; rm -rf ~')).toBe(false);
    expect(isValidVersion('1.0.0 && echo pwned')).toBe(false);
    expect(isValidVersion('$(whoami).0.0')).toBe(false);
  });
});

describe('isNewerVersion', () => {
  it('compares major, minor, patch numerically', () => {
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.10.0', '0.9.0')).toBe(true);
    expect(isNewerVersion('0.6.4', '0.6.3')).toBe(true);
    expect(isNewerVersion('0.6.3', '0.6.4')).toBe(false);
    expect(isNewerVersion('0.6.3', '0.6.3')).toBe(false);
  });

  it('ignores prerelease tags — equal core versions are never newer', () => {
    expect(isNewerVersion('1.0.0-beta', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0-beta')).toBe(false);
  });

  it('never reports invalid input as newer', () => {
    expect(isNewerVersion('abc', '0.0.1')).toBe(false);
    expect(isNewerVersion('99.0.0', 'abc')).toBe(false);
    expect(isNewerVersion('', '')).toBe(false);
  });
});
