#!/usr/bin/env node
// Tackle test-mode stub Agent.
//
// Mimics enough of Claude Code's behavior for integration / visual / perf
// suites to drive the real Tackle code paths without requiring a real
// Claude binary. Reads two env vars:
//
//   TACKLE_TEST_STUB_SCENARIO   one of: idle | idle-working-idle | waiting
//                               (default: idle-working-idle)
//   TACKLE_TEST_JSONL_DIR       directory to drop the synthetic jsonl in
//                               (must be set; matches the production
//                               override read by ClaudeJsonlDetector)
//   TACKLE_TEST_STUB_SESSION_ID claude_session_id to use for the jsonl
//                               filename (default: stub-session)
//
// Each scenario prints a small banner to stdout, writes a deterministic
// sequence of jsonl entries (shape compatible with ClaudeJsonlDetector
// from PR #50: top-level `type` of user|assistant|system, with assistant
// nesting `message.stop_reason` and `message.content` arrays), and exits
// 0 within ~2 seconds so test runners don't time out.

import * as fs from 'node:fs';
import * as path from 'node:path';

const scenario = process.env.TACKLE_TEST_STUB_SCENARIO ?? 'idle-working-idle';
const jsonlDir = process.env.TACKLE_TEST_JSONL_DIR;
const sessionId = process.env.TACKLE_TEST_STUB_SESSION_ID ?? 'stub-session';

if (!jsonlDir) {
  process.stderr.write('claude-stub: TACKLE_TEST_JSONL_DIR must be set\n');
  process.exit(2);
}

fs.mkdirSync(jsonlDir, { recursive: true });
const jsonlPath = path.join(jsonlDir, `${sessionId}.jsonl`);

// Truncate any previous run so each scenario writes a clean file.
fs.writeFileSync(jsonlPath, '');

const append = (entry) => {
  fs.appendFileSync(jsonlPath, JSON.stringify(entry) + '\n');
};

// Tiny non-blocking delay so the detector's fs.watch + poll loop has a
// chance to see distinct file-size deltas between transitions. 50ms is
// well under the 2s budget but well above the 25ms watcher debounce.
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const userPrompt = () => ({
  type: 'user',
  message: { role: 'user', content: [{ type: 'text', text: 'hi' }] },
});

const assistantWorking = () => ({
  type: 'assistant',
  message: {
    role: 'assistant',
    stop_reason: 'tool_use',
    content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }],
  },
});

const assistantIdle = () => ({
  type: 'assistant',
  message: {
    role: 'assistant',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: 'done' }],
  },
});

const toolApprovalPause = () => ({
  type: 'system',
  subtype: 'tool_approval_request',
});

async function runIdle() {
  process.stdout.write(`stub-agent scenario=idle session=${sessionId}\n`);
  append(assistantIdle());
}

async function runIdleWorkingIdle() {
  process.stdout.write(`stub-agent scenario=idle-working-idle session=${sessionId}\n`);
  append(assistantIdle());
  await delay(50);
  append(userPrompt());
  await delay(50);
  append(assistantWorking());
  await delay(50);
  append(assistantIdle());
}

async function runWaiting() {
  process.stdout.write(`stub-agent scenario=waiting session=${sessionId}\n`);
  append(userPrompt());
  await delay(50);
  append(toolApprovalPause());
}

const SCENARIOS = {
  idle: runIdle,
  'idle-working-idle': runIdleWorkingIdle,
  waiting: runWaiting,
};

const fn = SCENARIOS[scenario];
if (!fn) {
  process.stderr.write(`claude-stub: unknown scenario '${scenario}'\n`);
  process.exit(2);
}

fn().then(() => process.exit(0)).catch((err) => {
  process.stderr.write(`claude-stub: ${err?.stack ?? err}\n`);
  process.exit(1);
});
