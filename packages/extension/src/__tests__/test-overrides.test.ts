import { describe, it, expect, afterEach } from 'vitest';
import { TestOverride } from '../test-overrides';

/**
 * TestOverride uses live getters — each access re-reads `process.env`
 * so unit tests that mutate env between assertions see the latest value
 * without re-importing the module. These tests pin that contract.
 */
describe('TestOverride', () => {
  const ORIGINAL = {
    workspace: process.env.TACKLE_TEST_WORKSPACE,
    db: process.env.TACKLE_TEST_DB,
    psmuxPrefix: process.env.TACKLE_TEST_PSMUX_PREFIX,
    jsonlDir: process.env.TACKLE_TEST_JSONL_DIR,
  };

  afterEach(() => {
    if (ORIGINAL.workspace === undefined) delete process.env.TACKLE_TEST_WORKSPACE;
    else process.env.TACKLE_TEST_WORKSPACE = ORIGINAL.workspace;
    if (ORIGINAL.db === undefined) delete process.env.TACKLE_TEST_DB;
    else process.env.TACKLE_TEST_DB = ORIGINAL.db;
    if (ORIGINAL.psmuxPrefix === undefined) delete process.env.TACKLE_TEST_PSMUX_PREFIX;
    else process.env.TACKLE_TEST_PSMUX_PREFIX = ORIGINAL.psmuxPrefix;
    if (ORIGINAL.jsonlDir === undefined) delete process.env.TACKLE_TEST_JSONL_DIR;
    else process.env.TACKLE_TEST_JSONL_DIR = ORIGINAL.jsonlDir;
  });

  it('reads each override live from process.env, not at module-init', () => {
    delete process.env.TACKLE_TEST_WORKSPACE;
    expect(TestOverride.workspace).toBeUndefined();
    process.env.TACKLE_TEST_WORKSPACE = '/tmp/ws-1';
    expect(TestOverride.workspace).toBe('/tmp/ws-1');
    process.env.TACKLE_TEST_WORKSPACE = '/tmp/ws-2';
    expect(TestOverride.workspace).toBe('/tmp/ws-2');
  });

  it('exposes db, psmuxPrefix, and jsonlDir as live env reads', () => {
    process.env.TACKLE_TEST_DB = '/tmp/db.sqlite';
    process.env.TACKLE_TEST_PSMUX_PREFIX = 'tackletest-';
    process.env.TACKLE_TEST_JSONL_DIR = '/tmp/jsonl';
    expect(TestOverride.db).toBe('/tmp/db.sqlite');
    expect(TestOverride.psmuxPrefix).toBe('tackletest-');
    expect(TestOverride.jsonlDir).toBe('/tmp/jsonl');
  });
});
