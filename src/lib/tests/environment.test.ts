import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertServerContext, isClient, isServer } from '../environment';

describe('isServer', () => {
  it('returns true in Node.js (Vitest) environment where window is undefined', () => {
    expect(isServer()).toBe(true);
  });

  it('returns false when window is defined (simulated browser)', () => {
    vi.stubGlobal('window', {});
    expect(isServer()).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('isClient', () => {
  it('returns false in Node.js (Vitest) environment', () => {
    expect(isClient()).toBe(false);
  });

  it('returns true when window is defined (simulated browser)', () => {
    vi.stubGlobal('window', {});
    expect(isClient()).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe('assertServerContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not throw in a server context (no window)', () => {
    expect(() => assertServerContext('TestModule')).not.toThrow();
  });

  it('throws when called in a simulated browser context', () => {
    vi.stubGlobal('window', {});
    expect(() => assertServerContext('TestModule')).toThrow(
      '[TestModule] This module must only run in a server context.',
    );
  });

  it('includes the module name in the error message', () => {
    vi.stubGlobal('window', {});
    expect(() => assertServerContext('CompetitorRepository')).toThrow('CompetitorRepository');
  });
});
