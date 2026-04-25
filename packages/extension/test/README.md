# Tackle extension test surfaces

This package has four test surfaces, each with its own runner and lifecycle.
The split exists because some tests can run as plain Node modules (vitest,
bench overhead-only), others need the real VS Code extension host
(`@vscode/test-electron`), and others need real psmux / a real workspace on
disk.

ADR-0012 ("CI and test strategy") is the source of truth for *which* surface
catches *what*. This file is a how-to.

| Surface     | Runner                  | Where it runs                       | CI gate     |
|-------------|-------------------------|-------------------------------------|-------------|
| Unit        | `bun --bun vitest run`  | Bun (no VS Code)                    | required    |
| Integration | `bun run test:integration` | Real VS Code via `@vscode/test-electron` (Windows) | advisory |
| Bench       | `bun run test:bench`    | Real VS Code, real psmux, hot path  | manual / PR |
| Visual      | `bun run test:visual`   | Real VS Code, screenshot diff       | required    |
| Perf        | `bun run test:perf`     | Real VS Code, real workload         | advisory    |

## Unit (`src/__tests__/**/*.test.ts`)

- Driven by vitest, runs under Bun.
- Uses the in-memory mocks in `src/__tests__/vscode-mock.ts`.
- Fast (~16s for ~377 tests). Run in CI on every PR (`unit` job, required).
- Anything that does not need a real `vscode` API or a real psmux binary
  belongs here.

```
cd packages/extension
bun --bun vitest run
bun --bun vitest        # watch mode
```

## Integration (`test/integration/**/*.test.ts`)

Driven by Mocha (TDD UI) inside a real VS Code launched by
`@vscode/test-electron`. Five flows today (issue #66):

1. **Activate** — `tackle.activate` → seeded fixture task is visible to the
   sidebar.
2. **Task Select** — `tackle.activateTask` for two tasks in sequence
   resolves the active-task pointer.
3. **New Session** — `tackle.newSession` + the QuickPick chain produces a
   running Session row backed by the stub Agent (no real Claude binary).
4. **Mark as Done** — `tackle.markSessionDone` flips status to `completed`
   and kills the underlying psmux session.
5. **Restart Recovery** — `tackle.deactivate` followed by `tackle.activate`
   leaves the psmux session alive (ADR-0003 contract) and the Session row
   still `running`.

CI: `integration` job, **advisory** (`continue-on-error: true`). Real VS
Code + real psmux is flaky enough that we don't gate merges on it. The job
uploads `integration.log` as an artifact for triage.

```
cd packages/extension
bun run test:integration
# or, if you've already compiled:
node out-test/runner/run-integration.js
```

### Stub Agent + env vars (#65)

The integration suite sets `tackle.defaultAgent = 'stub'` in the fixture
workspace's `.vscode/settings.json`. The stub adapter (registered in
`src/agent/agent-registry.ts`) launches `node test/fixtures/bin/claude-stub.mjs`
which writes a deterministic Claude-shaped jsonl file the production
`ClaudeJsonlDetector` consumes unchanged.

The stub and the production code paths read these env vars (set by
`run-integration.ts`):

| Var                          | Consumer                                           | Purpose |
|------------------------------|----------------------------------------------------|---------|
| `TACKLE_TEST_WORKSPACE`      | `src/guards/workspace-guard.ts`                    | Forces the workspace root to the test fixture. |
| `TACKLE_TEST_DB`             | `src/mode/mode-manager.ts`                         | Overrides the SQLite path so each test owns its DB. |
| `TACKLE_TEST_PSMUX_PREFIX`   | `packages/shared/src/psmux/psmux-bridge.ts`        | Prefixes every psmux session name so `${prefix}*` cleanup is safe. |
| `TACKLE_TEST_JSONL_DIR`      | `src/agent/claude-jsonl-detector.ts` + the stub    | Redirects the detector to the stub's synthetic jsonl dir. |
| `TACKLE_TEST_STUB_SCENARIO`  | `test/fixtures/bin/claude-stub.mjs`                | One of `idle`, `idle-working-idle`, `waiting`. Default `idle-working-idle`. |
| `TACKLE_TEST_STUB_SESSION_ID`| `test/fixtures/bin/claude-stub.mjs`                | Names the synthetic jsonl file. Default `stub-session`. |
| `TACKLE_MOCHA_REPORTER`      | `test/suite/integration-index.ts`                  | Mocha reporter override (e.g. `mocha-junit-reporter` for CI). |
| `TACKLE_MOCHA_JUNIT_OUT`     | `test/suite/integration-index.ts`                  | Junit XML output path when using the junit reporter. |

### Writing a new integration test

1. Drop a file under `test/integration/<name>.test.ts`.
2. At the top, call `setupIntegrationSuite()` from
   `./suite-setup` — this wires per-suite Mocha hooks (`suiteSetup` /
   `setup` / `teardown` / `suiteTeardown`) for fresh `.tackle/` per test
   and prefix-scoped psmux cleanup.
3. Inside each `test()`, drive the flow via `vscode.commands.executeCommand`
   and assert the post-conditions. Use `getContext()` to reach
   `workspaceDir` / `dbPath` / `psmuxPrefix`. Use `waitFor()` for any
   bounded poll (default 5 s deadline).
4. Add the new file to `compile:tests` in `package.json` so the bundle is
   built ahead of the runner.

The harness opens VS Code with **one** workspace shared across the whole
suite (the runner pre-creates it because mid-process folder transitions
require a relaunch, which would tear down the test host). Per-test
isolation is provided by wiping `.tackle/` and the synthetic jsonl dir in
`setup()`.

### Tips

- `tackle.newSession` is interactive (two QuickPicks). The integration
  helpers fire `workbench.action.acceptSelectedQuickOpenItem` after a
  short delay to accept the highlighted defaults. If you need a specific
  kind, add a way to override (or call into the registered command flow
  another way) — don't rely on whichever item happens to be first.
- Drive-letter case differs between the `TACKLE_TEST_WORKSPACE` env value
  and `vscode.workspace.workspaceFolders[0].uri.fsPath`; compare with
  `.toLowerCase()` on Windows.
- The runner makes the workspace a real git repo with one commit on
  `main` so `WorktreeProvisioner` (ADR-0010) can `git worktree add`
  without a remote.

## Bench (`test/bench/**/*.test.ts`)

Driven by Mocha inside real VS Code, but runs end-to-end terminal
benchmarks (psmux input → terminal-data-write event). Asserts hard
regression gates against tail latencies. Run on demand on the same
windows-latest runner shape.

```
cd packages/extension
bun run test:bench
```

## Visual (`test/visual/**/*.test.ts`)

- Driven by Mocha + `@vscode/test-electron`. Renders sidebar/quickpick
  fixtures into HTML, normalizes via `node-html-parser`, and asserts
  byte-equal against snapshots in `test/visual/snapshots/`.
- Required CI check (`visual` job, Windows). On mismatch, the runner
  writes side-by-side diffs to `out-test/visual-diffs/` and the workflow
  uploads them as an artifact + posts a sticky PR comment.
- Update snapshots locally with `UPDATE_SNAPSHOTS=1 bun run test:visual`
  (or `UPDATE_SNAPSHOT_NAME=<name>` for a single snapshot) and commit.

```
cd packages/extension
bun run compile && bun run compile:visual
bun run test:visual
```

## Perf (`test/perf/**/*.test.ts`)

- Driven by Mocha + `@vscode/test-electron`. Runs three task-switch
  scenarios (baseline, heavy-fanout, cold-start) ~6× each via the timing
  harness in `test/perf/timing.ts`; writes results to
  `perf-results.json`.
- Advisory CI check (`perf` job, Windows, `continue-on-error: true`).
  On every PR the workflow posts a sticky comment summarizing per-
  scenario min/max/mean for `t_responsive` and `t_visible`.
- Currently a known-broken follow-up to #68: scenarios depend on
  `tackle._perfSeedTask` / `_perfSpawnSession` shims that aren't yet
  registered. The suite probes for them and writes sentinel results
  when missing — distinguishes "perf regressed" from "perf never ran".

```
cd packages/extension
bun run compile && bun run compile:perf
bun run test:perf
```

## See also

- [`docs/adr/0012-ci-and-test-strategy.md`](../../../docs/adr/0012-ci-and-test-strategy.md)
- `docs/adr/0003-session-survives-vscode-restart.md` (informs flow #5)
- `docs/adr/0010-claude-jsonl-detector.md` (informs flow #3 + #5)
