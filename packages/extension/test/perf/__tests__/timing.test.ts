import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  measureScenario,
  type TimingTerminal,
  type TimingTerminalProvider,
  type ScenarioContext,
  type ScenarioSetup,
} from '../timing';

/**
 * Mock terminal that lets a test script the sequence of `onDidWriteData`
 * events the harness will observe. We use a tiny event-emitter pattern
 * (single listener is fine for the harness's use).
 */
class MockTerminal implements TimingTerminal {
  public sentText: string[] = [];
  private listener: ((data: string) => void) | null = null;

  onDidWriteData(cb: (data: string) => void): { dispose(): void } {
    this.listener = cb;
    return {
      dispose: () => {
        this.listener = null;
      },
    };
  }

  sendText(text: string, _addNewLine: boolean): void {
    this.sentText.push(text);
  }

  /** Test helper — emit a data event as if VS Code wrote bytes to the terminal. */
  emit(data: string): void {
    this.listener?.(data);
  }
}

/**
 * Drives the time / setTimeout pump using vitest fake timers. Helper
 * advances the clock by a number of ms while flushing microtasks so any
 * pending promises chained off setTimeout resolve.
 */
async function advance(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe('measureScenario (timing harness)', () => {
  let terminal: MockTerminal;
  let provider: TimingTerminalProvider;
  // Track all terminals known to the "vscode.window.terminals" view.
  let terminals: TimingTerminal[];

  beforeEach(() => {
    vi.useFakeTimers();
    terminal = new MockTerminal();
    terminals = [];
    provider = {
      getFocusedTerminal: () => terminal,
      listTerminals: () => terminals,
      now: () => performance.now(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('happy path: t_responsive is the gap between keystroke and echo', async () => {
    let activatedAt = 0;

    const setup: ScenarioSetup = async (ctx: ScenarioContext) => {
      // Caller fires the activate-task command (we just record time).
      activatedAt = ctx.now();
      // Emit some pre-activation "attached output" data; harness should wait
      // for it to quiesce.
      setTimeout(() => terminal.emit('welcome\n'), 10);
      setTimeout(() => terminal.emit('prompt> '), 50);
      // Make the terminal "visible" 200ms after activation.
      setTimeout(() => terminals.push(terminal), 200);
    };

    const onKeystrokeSent = (sentAt: number): void => {
      // Echo arrives 75ms later.
      setTimeout(() => terminal.emit('x'), 75);
    };

    const promise = measureScenario({
      provider,
      setup,
      onKeystrokeSent,
      quiesceMs: 100,
      timeoutMs: 5000,
    });

    // Drain the entire scheduled work.
    await advance(1000);

    const { t_responsive, t_visible } = await promise;
    expect(t_responsive).toBeGreaterThanOrEqual(70);
    expect(t_responsive).toBeLessThan(120);
    // t_visible measured from activation to terminals append (~200ms).
    expect(t_visible).toBeGreaterThanOrEqual(190);
    expect(t_visible).toBeLessThan(260);
    expect(activatedAt).toBeGreaterThanOrEqual(0);
    expect(terminal.sentText).toContain('x');
  });

  it('late-keystroke-echo: harness ignores unrelated chunks before the echo', async () => {
    const setup: ScenarioSetup = async () => {
      setTimeout(() => terminal.emit('boot\n'), 5);
      setTimeout(() => terminals.push(terminal), 50);
    };

    const onKeystrokeSent = (): void => {
      // Three unrelated chunks arrive, then the echo.
      setTimeout(() => terminal.emit('noise1 '), 20);
      setTimeout(() => terminal.emit('noise2 '), 40);
      setTimeout(() => terminal.emit('more output '), 60);
      setTimeout(() => terminal.emit('finally x here'), 90);
    };

    const promise = measureScenario({
      provider,
      setup,
      onKeystrokeSent,
      quiesceMs: 100,
      timeoutMs: 5000,
    });
    await advance(1000);
    const { t_responsive } = await promise;
    // Echo arrives ~90ms after sendText.
    expect(t_responsive).toBeGreaterThanOrEqual(85);
    expect(t_responsive).toBeLessThan(120);
  });

  it('multi-byte chunk: chunk containing both pre-echo bytes and the echo counts as the echo', async () => {
    const setup: ScenarioSetup = async () => {
      setTimeout(() => terminals.push(terminal), 10);
    };

    const onKeystrokeSent = (): void => {
      // Single chunk with garbage + the echo char.
      setTimeout(() => terminal.emit('redraw bytes...x and trailing'), 50);
    };

    const promise = measureScenario({
      provider,
      setup,
      onKeystrokeSent,
      quiesceMs: 100,
      timeoutMs: 5000,
    });
    await advance(1000);
    const { t_responsive } = await promise;
    expect(t_responsive).toBeGreaterThanOrEqual(45);
    expect(t_responsive).toBeLessThan(80);
  });

  it('keystroke never echoes: rejects with a clear error', async () => {
    const setup: ScenarioSetup = async () => {
      setTimeout(() => terminals.push(terminal), 10);
    };
    // No echo emission.
    const onKeystrokeSent = (): void => {};

    const promise = measureScenario({
      provider,
      setup,
      onKeystrokeSent,
      quiesceMs: 100,
      timeoutMs: 500,
    });
    // Catch the rejection as a value to assert on.
    const caught = promise.catch((e) => e);
    await advance(2000);
    const err = await caught;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/echo|timeout/i);
  });

  it('t_visible: zero when the terminal is already in the terminal list', async () => {
    // Terminal is in the list before activation.
    terminals.push(terminal);
    const setup: ScenarioSetup = async () => {
      // No new terminal addition; visible immediately.
    };
    const onKeystrokeSent = (): void => {
      setTimeout(() => terminal.emit('x'), 30);
    };

    const promise = measureScenario({
      provider,
      setup,
      onKeystrokeSent,
      quiesceMs: 100,
      timeoutMs: 5000,
    });
    await advance(1000);
    const { t_visible } = await promise;
    expect(t_visible).toBeLessThan(30);
  });
});
