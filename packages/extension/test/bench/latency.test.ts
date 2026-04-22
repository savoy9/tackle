import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { PsmuxBridge } from '@tackle/shared';
import { runLatencyBenchmark, BenchMethod, BenchSummary } from '../../src/bench';

suite('Terminal latency', () => {
  test('Tackle terminal input latency is within threshold', async function () {
    this.timeout(300_000);

    const psmux = new PsmuxBridge();
    if (!psmux.binary) {
      console.warn('No psmux/tmux binary available; skipping benchmark.');
      this.skip();
      return;
    }

    const result = await runLatencyBenchmark(psmux, 8);
    const byMethod = new Map<BenchMethod, BenchSummary>();
    for (const s of result.summary) byMethod.set(s.method, s);

    const pick = (m: BenchMethod): BenchSummary => {
      const s = byMethod.get(m);
      assert.ok(s, `missing summary for ${m}`);
      return s;
    };

    const directLine = pick('psmux-direct-line');
    const directKey = pick('psmux-direct-key');
    const plainLine = pick('plain-shell-line');
    const plainKey = pick('plain-shell-key');
    const plainBurstFirst = pick('plain-shell-burst-first');
    const plainBurstLast = pick('plain-shell-burst-last');
    const plainBurstGap = pick('plain-shell-burst-gap');
    const tackleLine = pick('tackle-terminal-line');
    const tackleKey = pick('tackle-terminal-key');
    const tackleBurstFirst = pick('tackle-terminal-burst-first');
    const tackleBurstLast = pick('tackle-terminal-burst-last');
    const tackleBurstGap = pick('tackle-terminal-burst-gap');

    for (const s of result.summary) {
      console.log(`[bench] ${s.method.padEnd(28)} ${JSON.stringify(s)}`);
    }

    // Print the comparison the user actually cares about: how much does psmux+tackle add on top
    // of a plain VS Code terminal?
    const keyOverheadMs = tackleKey.mean - plainKey.mean;
    const lineOverheadMs = tackleLine.mean - plainLine.mean;
    const burstLastOverheadMs = tackleBurstLast.mean - plainBurstLast.mean;
    const burstGapOverheadMs = tackleBurstGap.mean - plainBurstGap.mean;
    console.log(`[bench] key         overhead vs plain shell: +${keyOverheadMs.toFixed(0)}ms mean`);
    console.log(`[bench] line        overhead vs plain shell: +${lineOverheadMs.toFixed(0)}ms mean`);
    console.log(`[bench] burst-last  overhead vs plain shell: +${burstLastOverheadMs.toFixed(0)}ms mean`);
    console.log(`[bench] burst-gap   overhead vs plain shell: +${burstGapOverheadMs.toFixed(0)}ms mean`);

    // Regression gates — loose while we investigate.
    const TACKLE_LINE_P50_MAX_MS = 800;
    const TACKLE_LINE_P95_MAX_MS = 1200;
    const TACKLE_KEY_P50_MAX_MS = 300;
    const TACKLE_KEY_P95_MAX_MS = 600;
    // Burst: the DX-critical signal. `gap` is the worst stall between chars during a 20-char burst.
    // A healthy terminal should render every char within a frame (~16ms) of the previous one.
    const TACKLE_BURST_GAP_P50_MAX_MS = 200;
    const TACKLE_BURST_GAP_P95_MAX_MS = 500;
    const TACKLE_BURST_LAST_P50_MAX_MS = 800;
    const KEY_OVERHEAD_MS_MAX = 250;
    const LINE_OVERHEAD_MS_MAX = 500;

    assert.ok(
      tackleLine.p50 <= TACKLE_LINE_P50_MAX_MS,
      `tackle-line p50=${tackleLine.p50.toFixed(0)}ms exceeds ${TACKLE_LINE_P50_MAX_MS}ms`,
    );
    assert.ok(
      tackleLine.p95 <= TACKLE_LINE_P95_MAX_MS,
      `tackle-line p95=${tackleLine.p95.toFixed(0)}ms exceeds ${TACKLE_LINE_P95_MAX_MS}ms`,
    );
    assert.ok(
      tackleKey.p50 <= TACKLE_KEY_P50_MAX_MS,
      `tackle-key p50=${tackleKey.p50.toFixed(0)}ms exceeds ${TACKLE_KEY_P50_MAX_MS}ms`,
    );
    assert.ok(
      tackleKey.p95 <= TACKLE_KEY_P95_MAX_MS,
      `tackle-key p95=${tackleKey.p95.toFixed(0)}ms exceeds ${TACKLE_KEY_P95_MAX_MS}ms`,
    );
    assert.ok(
      tackleBurstGap.p50 <= TACKLE_BURST_GAP_P50_MAX_MS,
      `tackle-burst-gap p50=${tackleBurstGap.p50.toFixed(0)}ms exceeds ${TACKLE_BURST_GAP_P50_MAX_MS}ms`,
    );
    assert.ok(
      tackleBurstGap.p95 <= TACKLE_BURST_GAP_P95_MAX_MS,
      `tackle-burst-gap p95=${tackleBurstGap.p95.toFixed(0)}ms exceeds ${TACKLE_BURST_GAP_P95_MAX_MS}ms`,
    );
    assert.ok(
      tackleBurstLast.p50 <= TACKLE_BURST_LAST_P50_MAX_MS,
      `tackle-burst-last p50=${tackleBurstLast.p50.toFixed(0)}ms exceeds ${TACKLE_BURST_LAST_P50_MAX_MS}ms`,
    );
    assert.ok(
      keyOverheadMs <= KEY_OVERHEAD_MS_MAX,
      `tackle key adds +${keyOverheadMs.toFixed(0)}ms vs plain shell (max ${KEY_OVERHEAD_MS_MAX}ms)`,
    );
    assert.ok(
      lineOverheadMs <= LINE_OVERHEAD_MS_MAX,
      `tackle line adds +${lineOverheadMs.toFixed(0)}ms vs plain shell (max ${LINE_OVERHEAD_MS_MAX}ms)`,
    );

    void directLine; void directKey; void plainBurstFirst; void tackleBurstFirst;
  });

  test('VS Code is reachable', () => {
    assert.ok(vscode.window, 'vscode.window missing');
  });
});
