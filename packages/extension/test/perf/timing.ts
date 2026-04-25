/**
 * Perf timing harness — the deep module from ADR-0012.
 *
 * Measures two numbers per scenario run:
 *   - `t_responsive`: from when a keystroke is sent into the focused
 *     terminal to when its echo first appears in the terminal output stream.
 *     This is the user-perceived "the terminal is alive" signal.
 *   - `t_visible`: from when the scenario's setup fires the activate-task
 *     command to when the target task's terminal tab appears in
 *     `vscode.window.terminals`.
 *
 * The harness is decoupled from VS Code via a small `TimingTerminalProvider`
 * port so the unit tests can drive it with a mock terminal that emits
 * scripted data sequences. The integration adapter (see `vscode-provider.ts`)
 * wires this up against the real `vscode.window.onDidWriteTerminalData`
 * proposed API used by the latency benchmark.
 */

export interface TimingTerminal {
  /**
   * Subscribe to data written to the terminal — the proposed
   * `onDidWriteTerminalData` event, narrowed to a single terminal.
   */
  onDidWriteData(cb: (data: string) => void): { dispose(): void };
  sendText(text: string, addNewLine: boolean): void;
}

export interface TimingTerminalProvider {
  /** Currently focused terminal (the one we send the keystroke to). */
  getFocusedTerminal(): TimingTerminal | null;
  /**
   * Snapshot of `vscode.window.terminals` (or moral equivalent). The
   * harness polls this to detect when the target task's terminal tab
   * has appeared.
   */
  listTerminals(): readonly TimingTerminal[];
  /** Monotonic clock — `performance.now()` in production. */
  now(): number;
}

export interface ScenarioContext {
  now(): number;
}

/**
 * A scenario setup function. Should perform whatever world-shaping is
 * needed (seed the DB, spawn stub-Agent sessions, etc.) and then fire
 * the activate-task command for the target task. The harness measures
 * `t_visible` from the moment this function is *invoked*.
 */
export type ScenarioSetup = (ctx: ScenarioContext) => Promise<void>;

export interface MeasureScenarioOptions {
  provider: TimingTerminalProvider;
  setup: ScenarioSetup;
  /**
   * Optional hook fired immediately after the keystroke `sendText` call.
   * Production code does nothing here; tests use it to schedule the
   * mock echo emission.
   */
  onKeystrokeSent?: (sentAt: number) => void;
  /**
   * The harness considers attached output "flushed" once no new bytes
   * have arrived for this many ms. Default 100ms per the spec.
   */
  quiesceMs?: number;
  /** Hard cap on a single measurement (defaults to 30s). */
  timeoutMs?: number;
}

export interface ScenarioMeasurement {
  t_responsive: number;
  t_visible: number;
}

const KEYSTROKE_CHAR = 'x';

/**
 * Run a single timed scenario iteration.
 *
 * Protocol (matches issue #68 spec):
 *   1. Start the clock; invoke `setup` (which fires the activate-task command).
 *   2. While `setup` runs (and after), poll `provider.listTerminals()` until
 *      the focused terminal appears — that's `t_visible`.
 *   3. Subscribe to `onDidWriteData` on the focused terminal and wait for
 *      data events to quiesce (no new bytes for `quiesceMs`).
 *   4. Send a single keystroke (`sendText('x', false)`).
 *   5. Stop the clock at the next data event containing the keystroke char.
 *      That delta is `t_responsive`.
 */
export async function measureScenario(
  opts: MeasureScenarioOptions,
): Promise<ScenarioMeasurement> {
  const {
    provider,
    setup,
    onKeystrokeSent,
    quiesceMs = 100,
    timeoutMs = 30_000,
  } = opts;

  const startedAt = provider.now();

  // Kick the setup off; it fires the activate-task command and may also
  // do async DB / orchestrator work. We do NOT await before subscribing —
  // the terminal may produce data as soon as activate-task runs.
  const setupPromise = setup({ now: () => provider.now() });

  // Subscribe to onDidWriteData on the focused terminal as soon as one
  // is available. Some scenarios (cold-start) don't have a focused
  // terminal until setup progresses, so we may need to wait.
  let focused = provider.getFocusedTerminal();
  while (!focused) {
    await sleep(5);
    if (provider.now() - startedAt > timeoutMs) {
      throw new Error('measureScenario: timed out waiting for a focused terminal');
    }
    focused = provider.getFocusedTerminal();
  }

  // Track the time of the most recent data byte; the harness sleeps in
  // small increments and considers "quiesce" reached when the gap to now
  // exceeds `quiesceMs`.
  let lastDataAt = provider.now();
  let echoSeenAt: number | null = null;
  let armedForEcho = false;
  let keystrokeSentAt = 0;

  const sub = focused.onDidWriteData((data: string) => {
    const t = provider.now();
    lastDataAt = t;
    if (armedForEcho && data.includes(KEYSTROKE_CHAR) && echoSeenAt === null) {
      echoSeenAt = t;
    }
  });

  try {
    // Wait for `t_visible` — the moment the focused terminal appears in
    // the listTerminals snapshot. If it's already there we resolve
    // immediately. Bound by timeout.
    let t_visible = -1;
    while (t_visible < 0) {
      if (provider.listTerminals().includes(focused)) {
        t_visible = provider.now() - startedAt;
        break;
      }
      if (provider.now() - startedAt > timeoutMs) {
        throw new Error('measureScenario: timed out waiting for terminal to become visible');
      }
      await sleep(5);
    }

    // Wait for the attached output to quiesce: no new bytes for `quiesceMs`.
    while (provider.now() - lastDataAt < quiesceMs) {
      const remaining = quiesceMs - (provider.now() - lastDataAt);
      // Sleep a hair longer than `remaining` so the next iteration's
      // condition is decisive even with timer jitter.
      await sleep(Math.max(1, remaining));
      if (provider.now() - startedAt > timeoutMs) {
        throw new Error('measureScenario: timed out waiting for output to quiesce');
      }
    }

    // Arm and send the keystroke.
    armedForEcho = true;
    keystrokeSentAt = provider.now();
    onKeystrokeSent?.(keystrokeSentAt);
    focused.sendText(KEYSTROKE_CHAR, false);

    // Wait for the echo or timeout.
    while (echoSeenAt === null) {
      await sleep(2);
      if (provider.now() - keystrokeSentAt > timeoutMs) {
        throw new Error(
          `measureScenario: timed out waiting for keystroke echo after ${timeoutMs}ms`,
        );
      }
    }

    const t_responsive = echoSeenAt - keystrokeSentAt;
    // Surface setup errors only after we've measured (or failed); a
    // setup that crashes after the activate-task command should not
    // be silently dropped.
    await setupPromise;
    return { t_responsive, t_visible };
  } finally {
    sub.dispose();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
