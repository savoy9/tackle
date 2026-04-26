import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { defaultJsonlPathResolver, deriveStateFromEntry } from '../agent/claude-jsonl-detector';
import type { Session } from '@tackle/shared';

const STUB = path.join(__dirname, '..', '..', 'test', 'fixtures', 'bin', 'claude-stub.mjs');

const baseSession = (over: Partial<Session> = {}): Session => ({
  id: 1,
  task_id: 1,
  phase_id: null,
  name: 's',
  kind: 'implement',
  status: 'running',
  psmux_name: 'p',
  tab_label: 't',
  agent: null,
  worktree_path: null,
  sort_order: 0,
  claude_session_id: 'stub-session',
  agent_state: 'idle',
  prior_claude_session_ids: null,
  started_at: '',
  ended_at: null,
  ...over,
});

describe('claude-stub.mjs smoke', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tackle-stub-'));
  });

  afterEach(() => {
    delete process.env.TACKLE_TEST_STUB_SCENARIO;
    delete process.env.TACKLE_TEST_JSONL_DIR;
    delete process.env.TACKLE_TEST_STUB_SESSION_ID;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(scenario: string): { stdout: string; stderr: string; status: number | null } {
    const r = spawnSync(process.execPath, [STUB], {
      env: {
        ...process.env,
        TACKLE_TEST_STUB_SCENARIO: scenario,
        TACKLE_TEST_JSONL_DIR: tmpDir,
        TACKLE_TEST_STUB_SESSION_ID: 'sess-1',
      },
      timeout: 5000,
      encoding: 'utf8',
    });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status };
  }

  function readEntries(): unknown[] {
    const file = path.join(tmpDir, 'sess-1.jsonl');
    const content = fs.readFileSync(file, 'utf8').trim();
    if (!content) return [];
    return content.split('\n').map((l) => JSON.parse(l));
  }

  it('idle scenario: writes a single end_turn entry and exits 0', () => {
    const r = run('idle');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('scenario=idle');
    const entries = readEntries();
    expect(entries).toHaveLength(1);
    expect(deriveStateFromEntry(entries[0])).toBe('idle');
  });

  it('idle-working-idle scenario: writes 4 entries, last is idle, mid is working', () => {
    const r = run('idle-working-idle');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('scenario=idle-working-idle');
    const entries = readEntries();
    expect(entries.length).toBeGreaterThanOrEqual(3);
    // States derived from the trailing prefix should include idle then working
    // and end on idle, mirroring the three-state transition the detector sees.
    expect(deriveStateFromEntry(entries[0])).toBe('idle');
    expect(deriveStateFromEntry(entries[entries.length - 2])).toBe('working');
    expect(deriveStateFromEntry(entries[entries.length - 1])).toBe('idle');
  });

  it('waiting scenario: last entry is a tool_approval_request system event', () => {
    const r = run('waiting');
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('scenario=waiting');
    const entries = readEntries();
    expect(deriveStateFromEntry(entries[entries.length - 1])).toBe('waiting');
  });

  it('emits a jsonl file the production resolver also points at', () => {
    process.env.TACKLE_TEST_JSONL_DIR = tmpDir;
    const r = run('idle');
    expect(r.status).toBe(0);
    const resolver = defaultJsonlPathResolver(() => '/anywhere');
    const expected = resolver.resolve(baseSession({ claude_session_id: 'sess-1' }));
    expect(expected).toBe(path.join(tmpDir, 'sess-1.jsonl'));
    expect(fs.existsSync(expected!)).toBe(true);
  });
});
