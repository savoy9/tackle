import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Session } from '@tackle/shared';
import {
  createClaudeJsonlDetector,
  deriveStateFromEntry,
  type JsonlPathResolver,
} from '../agent/claude-jsonl-detector';
import type { AgentStateEvent } from '../agent/agent-state-detector';

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
  claude_session_id: 'sess-abc',
  agent_state: 'idle',
  prior_claude_session_ids: null,
  started_at: '',
  ended_at: null,
  ...over,
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const SETTLE_MS = 200;

let tmpRoot: string;
let jsonlPath: string;

const resolver: JsonlPathResolver = {
  resolve: () => jsonlPath,
};

const writeJsonl = (lines: object[]) => {
  fs.writeFileSync(jsonlPath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
};

const appendJsonl = (line: object) => {
  fs.appendFileSync(jsonlPath, JSON.stringify(line) + '\n');
};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tackle-jsonl-'));
  jsonlPath = path.join(tmpRoot, 'sess-abc.jsonl');
});

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // ignore — temp cleanup is best-effort
  }
});

describe('ClaudeJsonlDetector', () => {
  it('emits initial idle when the JSONL file does not exist yet', async () => {
    const detector = createClaudeJsonlDetector({ pathResolver: resolver });
    const events: AgentStateEvent[] = [];
    detector.onChange((e) => events.push(e));

    detector.start(baseSession({ id: 7 }));
    await sleep(SETTLE_MS);
    detector.stop(baseSession({ id: 7 }));

    expect(events).toEqual([{ sessionId: 7, state: 'idle' }]);
  });

  it('emits idle → working → idle as JSONL grows through a turn', async () => {
    // Pre-create empty file: detector starts in idle.
    fs.writeFileSync(jsonlPath, '');

    const detector = createClaudeJsonlDetector({ pathResolver: resolver, pollIntervalMs: 50 });
    const events: AgentStateEvent[] = [];
    detector.onChange((e) => events.push(e));

    detector.start(baseSession({ id: 11 }));
    await sleep(SETTLE_MS);

    // User submits a prompt (still mid-turn until assistant ends).
    appendJsonl({ type: 'user', message: { role: 'user', content: 'hi' } });
    await sleep(SETTLE_MS);

    // Assistant streams a tool call (no end_turn yet) — still working.
    appendJsonl({ type: 'assistant', message: { role: 'assistant', stop_reason: 'tool_use' } });
    await sleep(SETTLE_MS);

    // Final assistant turn with end_turn → back to idle.
    appendJsonl({ type: 'assistant', message: { role: 'assistant', stop_reason: 'end_turn' } });
    await sleep(SETTLE_MS);

    detector.stop(baseSession({ id: 11 }));

    const states = events.map((e) => e.state);
    expect(states).toEqual(['idle', 'working', 'idle']);
    for (const e of events) expect(e.sessionId).toBe(11);
  });

  it('handles file created after start() (spawn-before-first-write)', async () => {
    // No file exists yet — Session was just spawned.
    const detector = createClaudeJsonlDetector({ pathResolver: resolver, pollIntervalMs: 50 });
    const events: AgentStateEvent[] = [];
    detector.onChange((e) => events.push(e));

    detector.start(baseSession({ id: 22 }));
    await sleep(SETTLE_MS);
    // Baseline is idle while no file.
    expect(events.map((e) => e.state)).toEqual(['idle']);

    // First entry arrives — agent started working.
    writeJsonl([{ type: 'user', message: { role: 'user', content: 'kickoff' } }]);
    await sleep(SETTLE_MS);

    detector.stop(baseSession({ id: 22 }));

    expect(events.map((e) => e.state)).toEqual(['idle', 'working']);
  });

  it('handles file truncation / rewrite (session-id rotation) without crashing', async () => {
    // Start with a mid-turn file — detector should classify as working.
    writeJsonl([
      { type: 'user', message: { role: 'user', content: 'go' } },
      { type: 'assistant', message: { role: 'assistant', stop_reason: 'tool_use' } },
    ]);

    const detector = createClaudeJsonlDetector({ pathResolver: resolver, pollIntervalMs: 50 });
    const events: AgentStateEvent[] = [];
    detector.onChange((e) => events.push(e));

    detector.start(baseSession({ id: 33 }));
    await sleep(SETTLE_MS);
    expect(events.at(-1)?.state).toBe('working');

    // A brand-new session rotates in: truncate then later write a fresh
    // end_turn. We should see idle (empty) then idle again (end_turn)
    // without an exception — and critically the working→idle transition
    // should emit once we observe the end_turn entry.
    fs.writeFileSync(jsonlPath, '');
    await sleep(SETTLE_MS);
    expect(events.at(-1)?.state).toBe('idle');

    appendJsonl({ type: 'user', message: { role: 'user', content: 'fresh' } });
    await sleep(SETTLE_MS);
    expect(events.at(-1)?.state).toBe('working');

    appendJsonl({ type: 'assistant', message: { role: 'assistant', stop_reason: 'end_turn' } });
    await sleep(SETTLE_MS);
    expect(events.at(-1)?.state).toBe('idle');

    detector.stop(baseSession({ id: 33 }));
  });
});

describe('deriveStateFromEntry (conservative defaults)', () => {
  it('returns working for an unrecognised entry shape', () => {
    expect(deriveStateFromEntry({ type: 'mystery-future-entry' })).toBe('working');
  });
  it('returns working for a malformed (non-object) entry', () => {
    expect(deriveStateFromEntry('not json object')).toBe('working');
    expect(deriveStateFromEntry(null)).toBe('working');
  });
  it('returns working for an assistant entry without stop_reason (still streaming)', () => {
    expect(deriveStateFromEntry({ type: 'assistant', message: { role: 'assistant' } })).toBe(
      'working',
    );
  });
  it('returns idle only on assistant end_turn / stop_sequence', () => {
    expect(
      deriveStateFromEntry({ type: 'assistant', message: { stop_reason: 'end_turn' } }),
    ).toBe('idle');
    expect(
      deriveStateFromEntry({ type: 'assistant', message: { stop_reason: 'stop_sequence' } }),
    ).toBe('idle');
  });
  it('returns working for plain stop_reason:tool_use without an AskUserQuestion call', () => {
    // Conservative: a tool_use that isn't a human-input prompt may be
    // auto-approved, so stay on `working` rather than risk a false ✳️.
    expect(
      deriveStateFromEntry({
        type: 'assistant',
        message: {
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
        },
      }),
    ).toBe('working');
  });
});

describe('deriveStateFromEntry — waiting state (#42)', () => {
  it('returns waiting when the last assistant entry contains an AskUserQuestion tool_use', () => {
    // Human-input pause: Claude emits the AskUserQuestion tool to ask the
    // operator a question and the turn ends awaiting their answer.
    const entry = {
      type: 'assistant',
      message: {
        role: 'assistant',
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'I need to confirm before proceeding.' },
          {
            type: 'tool_use',
            name: 'AskUserQuestion',
            input: { questions: [{ question: 'Proceed?', options: [] }] },
          },
        ],
      },
    };
    expect(deriveStateFromEntry(entry)).toBe('waiting');
  });

  it('returns waiting for an AskUserQuestion tool_use even when stop_reason is end_turn', () => {
    // Some Claude Code versions emit `stop_reason: 'end_turn'` after an
    // AskUserQuestion call (the turn really is over until the user answers).
    const entry = {
      type: 'assistant',
      message: {
        stop_reason: 'end_turn',
        content: [{ type: 'tool_use', name: 'AskUserQuestion', input: {} }],
      },
    };
    expect(deriveStateFromEntry(entry)).toBe('waiting');
  });

  it('returns waiting for a system tool_approval_request entry', () => {
    // Documented assumption: when Claude Code surfaces a tool-approval
    // pause it writes a system entry with a recognisable subtype. If
    // this shape ever changes the detector falls back to `working`.
    expect(
      deriveStateFromEntry({ type: 'system', subtype: 'tool_approval_request' }),
    ).toBe('waiting');
  });

  it('stays working for an assistant entry that has tool_use but no AskUserQuestion', () => {
    expect(
      deriveStateFromEntry({
        type: 'assistant',
        message: {
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: 'reading file' },
            { type: 'tool_use', name: 'Read', input: { path: 'x' } },
          ],
        },
      }),
    ).toBe('working');
  });

  it('stays working for ambiguous system subtypes', () => {
    // Conservative: anything we don't recognise as an explicit pause
    // signal must NOT flip to waiting.
    expect(deriveStateFromEntry({ type: 'system', subtype: 'turn_duration' })).toBe(
      'working',
    );
    expect(deriveStateFromEntry({ type: 'system', subtype: 'away_summary' })).toBe(
      'working',
    );
  });
});

describe('ClaudeJsonlDetector — waiting transitions (#42)', () => {
  it('emits idle → working → waiting → working → idle through an approval pause', async () => {
    fs.writeFileSync(jsonlPath, '');

    const detector = createClaudeJsonlDetector({
      pathResolver: resolver,
      pollIntervalMs: 50,
    });
    const events: AgentStateEvent[] = [];
    detector.onChange((e) => events.push(e));

    detector.start(baseSession({ id: 42 }));
    await sleep(SETTLE_MS);

    // User prompt → working.
    appendJsonl({ type: 'user', message: { role: 'user', content: 'do the thing' } });
    await sleep(SETTLE_MS);

    // Assistant pauses for human input via AskUserQuestion → waiting.
    appendJsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        stop_reason: 'tool_use',
        content: [
          {
            type: 'tool_use',
            name: 'AskUserQuestion',
            input: { questions: [{ question: 'ok?', options: [] }] },
          },
        ],
      },
    });
    await sleep(SETTLE_MS);

    // User answers (tool_result) → working again.
    appendJsonl({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'x', content: 'yes' }],
      },
    });
    await sleep(SETTLE_MS);

    // Assistant ends turn → idle.
    appendJsonl({
      type: 'assistant',
      message: { role: 'assistant', stop_reason: 'end_turn' },
    });
    await sleep(SETTLE_MS);

    detector.stop(baseSession({ id: 42 }));

    expect(events.map((e) => e.state)).toEqual([
      'idle',
      'working',
      'waiting',
      'working',
      'idle',
    ]);
    for (const e of events) expect(e.sessionId).toBe(42);
  });

  it('does not flip to waiting on an ambiguous tool_use entry', async () => {
    fs.writeFileSync(jsonlPath, '');
    const detector = createClaudeJsonlDetector({
      pathResolver: resolver,
      pollIntervalMs: 50,
    });
    const events: AgentStateEvent[] = [];
    detector.onChange((e) => events.push(e));

    detector.start(baseSession({ id: 43 }));
    await sleep(SETTLE_MS);

    // A regular Bash tool_use — could auto-approve. Conservative: working.
    appendJsonl({
      type: 'assistant',
      message: {
        role: 'assistant',
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
      },
    });
    await sleep(SETTLE_MS);

    detector.stop(baseSession({ id: 43 }));

    const states = events.map((e) => e.state);
    expect(states).toEqual(['idle', 'working']);
    expect(states).not.toContain('waiting');
  });
});
