import * as vscode from 'vscode';
import { execSync } from 'node:child_process';
import { PsmuxBridge } from '@tackle/shared';

// Proposed API augmentation. Requires:
//   - "enabledApiProposals": ["terminalDataWriteEvent"] in package.json
//   - launching the extension host with --enable-proposed-api=<publisher>.<name>
declare module 'vscode' {
  export interface TerminalDataWriteEvent {
    readonly terminal: Terminal;
    readonly data: string;
  }
  export namespace window {
    export const onDidWriteTerminalData: Event<TerminalDataWriteEvent>;
  }
}

export type BenchMethod =
  // Input-side only (capture-pane on the psmux server): baseline for psmux itself.
  | 'psmux-direct-line'
  | 'psmux-direct-key'
  // Full round trip (sendText → onDidWriteTerminalData): what the user actually feels.
  | 'tackle-terminal-line'
  | 'tackle-terminal-key'
  | 'tackle-terminal-burst-first'
  | 'tackle-terminal-burst-last'
  | 'tackle-terminal-burst-gap'
  // Full round trip in a plain shell (no psmux): VS Code + ConPTY floor.
  | 'plain-shell-line'
  | 'plain-shell-key'
  | 'plain-shell-burst-first'
  | 'plain-shell-burst-last'
  | 'plain-shell-burst-gap';

export interface BenchSample {
  iteration: number;
  method: BenchMethod;
  latencyMs: number;
}

export interface BenchSummary {
  method: BenchMethod;
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
}

export interface BenchResult {
  samples: BenchSample[];
  summary: BenchSummary[];
}

/**
 * Measures end-to-end keystroke latency.
 *
 * For tackle-terminal and plain-shell: uses the proposed `onDidWriteTerminalData` API to observe
 * bytes as they arrive at VS Code's renderer. This is the full round trip
 * (send → ConPTY in → shell/psmux → ConPTY out → renderer) — i.e. what the user sees.
 *
 * For psmux-direct: uses `capture-pane` against the psmux server. This is input-side only
 * (no VS Code in the loop) and serves as a floor for psmux's own processing.
 *
 * Modes:
 *   - `line`: whole line + Enter at once (agent output / scrollback bursts).
 *   - `key`:  one char at a time (interactive typing — the DX-critical number).
 */
export async function runLatencyBenchmark(
  psmux: PsmuxBridge,
  iterations = 10,
): Promise<BenchResult> {
  if (!psmux.binary) throw new Error('No psmux/tmux binary found.');

  const sessionName = `tackle-bench-${Date.now()}`;
  psmux.createSession(sessionName);
  await sleep(300);

  const samples: BenchSample[] = [];

  try {
    // -------- psmux-direct (input-side floor) --------
    for (let i = 0; i < iterations; i++) {
      const lineSentinel = `BD${i}L${randomId()}`;
      const tLine = performance.now();
      execSync(`${psmux.binary} send-keys -t "${sessionName}" "${lineSentinel}" Enter`, { timeout: 5000 });
      samples.push({
        iteration: i,
        method: 'psmux-direct-line',
        latencyMs: await waitForSentinelInPane(psmux, sessionName, lineSentinel, tLine),
      });
      execSync(`${psmux.binary} send-keys -t "${sessionName}" "clear" Enter`, { timeout: 5000 });
      await sleep(30);

      const keySentinel = `bd${i}${randomId().toLowerCase()}`;
      for (let c = 0; c < keySentinel.length; c++) {
        const prefix = keySentinel.slice(0, c + 1);
        const t = performance.now();
        execSync(`${psmux.binary} send-keys -l -t "${sessionName}" "${keySentinel[c]}"`, { timeout: 5000 });
        samples.push({
          iteration: i,
          method: 'psmux-direct-key',
          latencyMs: await waitForSentinelInPane(psmux, sessionName, prefix, t),
        });
      }
      execSync(`${psmux.binary} send-keys -t "${sessionName}" C-u`, { timeout: 5000 });
      await sleep(30);
    }

    // -------- tackle-terminal (psmux attach, full round trip) --------
    await measureTerminalRoundTrip({
      terminalOptions: {
        name: `bench-tackle-${sessionName}`,
        location: vscode.TerminalLocation.Editor,
        shellPath: psmux.binary,
        shellArgs: ['attach', '-t', sessionName],
      },
      methods: {
        line: 'tackle-terminal-line',
        key: 'tackle-terminal-key',
        burstFirst: 'tackle-terminal-burst-first',
        burstLast: 'tackle-terminal-burst-last',
        burstGap: 'tackle-terminal-burst-gap',
      },
      iterations,
      samples,
    });

    // -------- plain-shell (no psmux; VS Code + ConPTY floor) --------
    await measureTerminalRoundTrip({
      terminalOptions: {
        name: `bench-plain-${sessionName}`,
        location: vscode.TerminalLocation.Editor,
      },
      methods: {
        line: 'plain-shell-line',
        key: 'plain-shell-key',
        burstFirst: 'plain-shell-burst-first',
        burstLast: 'plain-shell-burst-last',
        burstGap: 'plain-shell-burst-gap',
      },
      iterations,
      samples,
    });
  } finally {
    try { psmux.killSession(sessionName); } catch { /* best effort */ }
  }

  return { samples, summary: summarize(samples) };
}

interface MeasureOptions {
  terminalOptions: vscode.TerminalOptions;
  methods: {
    line: BenchMethod;
    key: BenchMethod;
    burstFirst: BenchMethod;
    burstLast: BenchMethod;
    burstGap: BenchMethod;
  };
  iterations: number;
  samples: BenchSample[];
}

// Length of each burst. Long enough to expose batching; short enough to keep total runtime reasonable.
const BURST_LENGTH = 20;

async function measureTerminalRoundTrip(opts: MeasureOptions): Promise<void> {
  const terminal = vscode.window.createTerminal(opts.terminalOptions);
  terminal.show();
  // Let the terminal attach and the shell print its prompt before we start timing.
  await sleep(2000);

  const dataBuf = new DataBuffer(terminal);
  try {
    for (let i = 0; i < opts.iterations; i++) {
      // -- line --
      const lineSentinel = `BT${i}L${randomId()}`;
      await dataBuf.drainAndReset();
      const tLine = performance.now();
      terminal.sendText(lineSentinel, true);
      opts.samples.push({
        iteration: i,
        method: opts.methods.line,
        latencyMs: await dataBuf.waitFor(lineSentinel, tLine),
      });
      resetInputLine(terminal);

      // -- key (one char, wait, next char). Use only digits + ascii letters that won't trigger
      // PowerShell predictive completion; drain output between iterations to avoid seeing stale bytes.
      const keySentinel = makeUniqueKeySentinel(i);
      await dataBuf.drainAndReset();
      for (let c = 0; c < keySentinel.length; c++) {
        const ch = keySentinel[c];
        const t = performance.now();
        terminal.sendText(ch, false);
        opts.samples.push({
          iteration: i,
          method: opts.methods.key,
          latencyMs: await dataBuf.waitForChar(ch, t),
        });
      }
      resetInputLine(terminal);

      // -- burst (N chars back-to-back, measure first/last/max-gap) --
      const burstSentinel = makeBurstSentinel(i, BURST_LENGTH);
      await dataBuf.drainAndReset();
      dataBuf.startBurstRecording();
      const tBurst = performance.now();
      for (const ch of burstSentinel) {
        terminal.sendText(ch, false);
      }
      const burst = await dataBuf.waitForBurst(burstSentinel, tBurst);
      opts.samples.push({ iteration: i, method: opts.methods.burstFirst, latencyMs: burst.firstCharMs });
      opts.samples.push({ iteration: i, method: opts.methods.burstLast, latencyMs: burst.lastCharMs });
      opts.samples.push({ iteration: i, method: opts.methods.burstGap, latencyMs: burst.maxGapMs });
      resetInputLine(terminal);
    }
  } finally {
    dataBuf.dispose();
    terminal.dispose();
    await sleep(500);
  }
}

function makeBurstSentinel(iter: number, length: number): string {
  // Use ASCII letters only — avoids readline auto-complete/escape interpretation.
  const pool = 'abcdefghijklmnopqrstuvwxyz';
  let s = `z${iter}`;
  while (s.length < length) s += pool[Math.floor(Math.random() * pool.length)];
  return s.slice(0, length);
}

// A key sentinel with all-distinct characters. When measuring per-char echo we wait for a specific
// char; distinct chars prevent false matches from stale buffered output.
function makeUniqueKeySentinel(iter: number): string {
  const pool = 'abcdefghijklmnopqrstuvwxyz';
  // Take 8 distinct chars from a shuffled alphabet seeded loosely by iter.
  const chars = pool.split('').sort(() => Math.random() - 0.5);
  return chars.slice(0, 8).join('') + String(iter);
}

// Cancel any pending input line. Ctrl-C works across bash, zsh, PowerShell, and cmd readline modes
// without submitting the line.
function resetInputLine(terminal: vscode.Terminal): void {
  terminal.sendText('\u0003', false);
}

/**
 * Captures terminal output via the proposed onDidWriteTerminalData API.
 *
 * For whole-sentinel waits (`waitFor`), buffers all data since the last reset and searches it.
 * For per-char waits (`waitForChar`), resolves on the first data chunk since the call that
 * contains the character — this is the tightest possible "pixel appeared" signal we can get.
 */
class DataBuffer {
  private disposable: vscode.Disposable;
  private buffer = '';
  private pendingChar: { ch: string; resolve: (t: number) => void; startedAt: number } | null = null;
  private lastDataAtMs = 0;

  // Burst recording: when active, record every char-arrival timestamp so we can compute first/last/max-gap.
  private burstRecording = false;
  private burstArrivals: { ch: string; atMs: number }[] = [];

  constructor(private terminal: vscode.Terminal) {
    this.disposable = vscode.window.onDidWriteTerminalData((e) => {
      if (e.terminal !== this.terminal) return;
      const nowMs = performance.now();
      this.lastDataAtMs = nowMs;
      this.buffer += e.data;
      const visible = stripEscapes(e.data);

      if (this.burstRecording) {
        for (const ch of visible) this.burstArrivals.push({ ch, atMs: nowMs });
      }
      if (this.pendingChar) {
        const { ch, startedAt, resolve } = this.pendingChar;
        if (visible.includes(ch)) {
          this.pendingChar = null;
          resolve(nowMs - startedAt);
        }
      }
    });
  }

  reset(): void {
    this.buffer = '';
    this.pendingChar = null;
    this.burstRecording = false;
    this.burstArrivals = [];
  }

  /**
   * Wait until no terminal output has arrived for `quietMs` milliseconds, then reset.
   * Drains lingering prompt redraws / readline chatter left over from the previous step.
   */
  async drainAndReset(quietMs = 200, maxWaitMs = 3000): Promise<void> {
    const deadline = performance.now() + maxWaitMs;
    while (performance.now() < deadline) {
      const since = performance.now() - this.lastDataAtMs;
      if (since >= quietMs) break;
      await sleep(Math.min(quietMs - since, 50));
    }
    this.reset();
  }

  startBurstRecording(): void {
    this.burstRecording = true;
    this.burstArrivals = [];
  }

  async waitFor(sentinel: string, startedAt: number, timeoutMs = 30_000): Promise<number> {
    const deadline = startedAt + timeoutMs;
    while (performance.now() < deadline) {
      if (this.buffer.includes(sentinel)) return performance.now() - startedAt;
      await sleep(2);
    }
    throw new Error(`Timed out waiting for sentinel ${sentinel} after ${timeoutMs}ms (buffer tail: ${JSON.stringify(this.buffer.slice(-80))})`);
  }

  waitForChar(ch: string, startedAt: number, timeoutMs = 10_000): Promise<number> {
    return new Promise((resolve, reject) => {
      this.pendingChar = { ch, startedAt, resolve };
      const timer = setTimeout(() => {
        if (this.pendingChar?.ch === ch) {
          this.pendingChar = null;
          reject(new Error(`Timed out waiting for char '${ch}' after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      const orig = this.pendingChar.resolve;
      this.pendingChar.resolve = (t) => { clearTimeout(timer); orig(t); };
    });
  }

  /**
   * Waits for every char of `sentinel` to arrive in order (duplicates allowed, stray arrivals ignored).
   * Returns time-to-first-char, time-to-last-char, and the largest inter-arrival gap during the burst.
   */
  async waitForBurst(
    sentinel: string,
    startedAt: number,
    timeoutMs = 30_000,
  ): Promise<{ firstCharMs: number; lastCharMs: number; maxGapMs: number }> {
    const deadline = startedAt + timeoutMs;
    // Spin until we've matched the whole sentinel against recorded arrivals (in order).
    while (performance.now() < deadline) {
      const matched = matchSentinelAgainstArrivals(sentinel, this.burstArrivals);
      if (matched) {
        this.burstRecording = false;
        const firstCharMs = matched[0].atMs - startedAt;
        const lastCharMs = matched[matched.length - 1].atMs - startedAt;
        let maxGapMs = 0;
        for (let i = 1; i < matched.length; i++) {
          const gap = matched[i].atMs - matched[i - 1].atMs;
          if (gap > maxGapMs) maxGapMs = gap;
        }
        return { firstCharMs, lastCharMs, maxGapMs };
      }
      await sleep(2);
    }
    this.burstRecording = false;
    throw new Error(
      `Timed out waiting for burst ${JSON.stringify(sentinel)} after ${timeoutMs}ms ` +
      `(arrivals: ${this.burstArrivals.map((a) => a.ch).join('')})`,
    );
  }

  dispose(): void {
    this.disposable.dispose();
  }
}

function stripEscapes(s: string): string {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
}

// Returns the sub-sequence of arrivals that matches `sentinel` in order, or null if not yet complete.
function matchSentinelAgainstArrivals(
  sentinel: string,
  arrivals: { ch: string; atMs: number }[],
): { ch: string; atMs: number }[] | null {
  const matched: { ch: string; atMs: number }[] = [];
  let si = 0;
  for (const a of arrivals) {
    if (si < sentinel.length && a.ch === sentinel[si]) {
      matched.push(a);
      si++;
    }
    if (si === sentinel.length) return matched;
  }
  return null;
}

async function waitForSentinelInPane(
  psmux: PsmuxBridge,
  sessionName: string,
  sentinel: string,
  startedAt: number,
  timeoutMs = 60_000,
): Promise<number> {
  while (performance.now() - startedAt < timeoutMs) {
    try {
      const output = execSync(`${psmux.binary} capture-pane -p -t "${sessionName}"`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      if (output.includes(sentinel)) return performance.now() - startedAt;
    } catch { /* retry */ }
    await sleep(1);
  }
  throw new Error(`Timed out waiting for sentinel ${sentinel} in pane after ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function summarize(samples: BenchSample[]): BenchSummary[] {
  const methods = Array.from(new Set(samples.map((s) => s.method)));
  return methods.map((method) => {
    const ms = samples.filter((s) => s.method === method).map((s) => s.latencyMs).sort((a, b) => a - b);
    return {
      method,
      count: ms.length,
      p50: pct(ms, 0.5),
      p95: pct(ms, 0.95),
      p99: pct(ms, 0.99),
      max: ms[ms.length - 1],
      mean: ms.reduce((a, b) => a + b, 0) / ms.length,
    };
  });
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}

export function formatResult(result: BenchResult): string {
  const lines: string[] = ['Tackle terminal latency benchmark', ''];
  for (const s of result.summary) {
    lines.push(
      `${s.method.padEnd(22)}  n=${String(s.count).padStart(3)}  ` +
        `p50=${s.p50.toFixed(0)}ms  p95=${s.p95.toFixed(0)}ms  p99=${s.p99.toFixed(0)}ms  ` +
        `max=${s.max.toFixed(0)}ms  mean=${s.mean.toFixed(0)}ms`,
    );
  }
  return lines.join('\n');
}
