import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { resolveOutTestRoot } from '../launch';

/**
 * `resolveOutTestRoot` strips bun's variable runner suffix so the
 * launcher can locate `out-test/` regardless of which sibling files
 * happen to be bundled together. Only the path-shape logic is unit-
 * tested here; the runTests integration is exercised end-to-end in CI.
 */
describe('resolveOutTestRoot', () => {
  it('strips a trailing /runner suffix', () => {
    expect(resolveOutTestRoot('/repo/out-test/runner')).toBe('/repo/out-test');
  });

  it('strips a trailing /test/runner suffix (bun common-prefix nesting)', () => {
    expect(resolveOutTestRoot('/repo/out-test/test/runner')).toBe('/repo/out-test');
  });

  it('handles Windows-style separators', () => {
    expect(resolveOutTestRoot('C:\\repo\\out-test\\runner')).toBe('C:\\repo\\out-test');
    expect(resolveOutTestRoot('C:\\repo\\out-test\\test\\runner')).toBe('C:\\repo\\out-test');
  });

  it('returns the input unchanged when the suffix does not match', () => {
    expect(resolveOutTestRoot('/repo/out-test')).toBe('/repo/out-test');
    expect(resolveOutTestRoot('/repo/out-test/runner-extra')).toBe('/repo/out-test/runner-extra');
  });

  it('joins cleanly with relative suite paths', () => {
    const root = resolveOutTestRoot('/repo/out-test/test/runner');
    expect(path.posix.resolve(root, 'suite/integration-index.js')).toBe(
      '/repo/out-test/suite/integration-index.js',
    );
  });
});
