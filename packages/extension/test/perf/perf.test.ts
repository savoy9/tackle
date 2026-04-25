/**
 * Perf suite — runs each scenario 5–8 times via the timing harness and
 * writes results as JSON to `packages/extension/perf-results.json`.
 *
 * Executed inside the VS Code extension host by `run-perf.ts`. Mocha
 * carries the orchestration; the assertions are loose (perf is
 * advisory, never gates merge — see ADR-0012).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { measureScenario } from '../perf/timing';
import { createVSCodeProvider } from '../perf/vscode-provider';
import { ALL_SCENARIOS, type ScenarioFactory } from '../perf/scenarios';

interface RunStats {
  count: number;
  min: number;
  max: number;
  mean: number;
}

interface ScenarioResult {
  scenario: string;
  runs: number;
  t_responsive: RunStats;
  t_visible: RunStats;
  raw: { t_responsive: number; t_visible: number }[];
}

interface PerfResultsFile {
  generatedAt: string;
  iterations: number;
  goalLineMs: 1000;
  goalLineNote: string;
  scenarios: ScenarioResult[];
}

const RUNS_PER_SCENARIO = 6; // within the 5–8 band per spec

function statsOf(values: number[]): RunStats {
  if (values.length === 0) return { count: 0, min: 0, max: 0, mean: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { count: values.length, min, max, mean: sum / values.length };
}

async function runScenario(s: ScenarioFactory, runs: number): Promise<ScenarioResult> {
  const provider = createVSCodeProvider();
  const raw: { t_responsive: number; t_visible: number }[] = [];
  for (let i = 0; i < runs; i++) {
    const handles = await s.setup();
    const m = await measureScenario({
      provider,
      setup: async () => {
        await vscode.commands.executeCommand('tackle.activateTask', handles.taskBId);
      },
      quiesceMs: 100,
      timeoutMs: 30_000,
    });
    raw.push(m);
  }
  return {
    scenario: s.name,
    runs,
    t_responsive: statsOf(raw.map((r) => r.t_responsive)),
    t_visible: statsOf(raw.map((r) => r.t_visible)),
    raw,
  };
}

suite('perf', () => {
  test('measures three scenarios and writes perf-results.json', async function () {
    this.timeout(20 * 60_000);

    // KNOWN-BROKEN follow-up: scenarios depend on `tackle._perfSeedTask`
    // and `tackle._perfSpawnSession` shims that aren't yet registered
    // (tracked as a follow-up to #68). Probe the command list and bail
    // with a sentinel results file if they're missing — distinguishes
    // "perf regressed" from "perf never ran" in the artifact + PR comment.
    const cmds = new Set(await vscode.commands.getCommands(true));
    const missing = ['tackle._perfSeedTask', 'tackle._perfSpawnSession'].filter(
      (c) => !cmds.has(c),
    );

    const results: ScenarioResult[] = [];
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[perf] skipping all scenarios: missing commands: ${missing.join(', ')}`);
      for (const s of ALL_SCENARIOS) {
        results.push({
          scenario: s.name,
          runs: 0,
          t_responsive: { count: 0, min: 0, max: 0, mean: 0 },
          t_visible: { count: 0, min: 0, max: 0, mean: 0 },
          raw: [],
        });
      }
    } else {
      for (const s of ALL_SCENARIOS) {
      try {
        const r = await runScenario(s, RUNS_PER_SCENARIO);
        for (const summary of [r.t_responsive, r.t_visible]) {
          assert.ok(summary.count === RUNS_PER_SCENARIO, `expected ${RUNS_PER_SCENARIO} runs`);
        }
        results.push(r);
        // eslint-disable-next-line no-console
        console.log(
          `[perf] ${s.name}: t_responsive mean=${r.t_responsive.mean.toFixed(0)}ms ` +
            `(min=${r.t_responsive.min.toFixed(0)}, max=${r.t_responsive.max.toFixed(0)}); ` +
            `t_visible mean=${r.t_visible.mean.toFixed(0)}ms`,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line no-console
        console.warn(`[perf] scenario ${s.name} failed: ${msg}`);
        // Per ADR-0012 perf is advisory, so we don't fail the build —
        // but we DO record a sentinel so the comment publisher shows
        // the scenario was attempted.
        results.push({
          scenario: s.name,
          runs: 0,
          t_responsive: { count: 0, min: 0, max: 0, mean: 0 },
          t_visible: { count: 0, min: 0, max: 0, mean: 0 },
          raw: [],
        });
      }
      }
    }

    const out: PerfResultsFile = {
      generatedAt: new Date().toISOString(),
      iterations: RUNS_PER_SCENARIO,
      goalLineMs: 1000,
      goalLineNote:
        '1000 ms t_responsive is an INFORMATIONAL goal line (see ADR-0012). ' +
        'It is not a pass/fail criterion; perf is advisory and never gates merge.',
      scenarios: results,
    };

    // Resolve output path: <extension>/perf-results.json. The runner
    // sets TACKLE_PERF_OUTPUT for us; fall back to cwd if missing.
    const outPath = process.env.TACKLE_PERF_OUTPUT
      ?? path.resolve(process.cwd(), 'perf-results.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
    // eslint-disable-next-line no-console
    console.log(`[perf] wrote ${outPath}`);
  });
});
