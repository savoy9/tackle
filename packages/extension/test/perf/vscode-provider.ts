/**
 * VS Code adapter for the timing harness — wires
 * `vscode.window.onDidWriteTerminalData` (proposed API) and
 * `vscode.window.terminals` into the harness's `TimingTerminalProvider`
 * port.
 */
import * as vscode from 'vscode';
import type { TimingTerminal, TimingTerminalProvider } from './timing';

// `vscode.window.onDidWriteTerminalData` (proposed `terminalDataWriteEvent`
// API) is augmented onto the vscode module by `src/bench/latency-bench.ts`,
// which is compiled together with this file. We rely on that single
// declaration to avoid a duplicate `declare module 'vscode'` block.
type TerminalDataWriteEventLike = { readonly terminal: vscode.Terminal; readonly data: string };
const onDidWriteTerminalData = (
  vscode.window as unknown as {
    onDidWriteTerminalData: vscode.Event<TerminalDataWriteEventLike>;
  }
).onDidWriteTerminalData;

class VSCodeTimingTerminal implements TimingTerminal {
  constructor(private terminal: vscode.Terminal) {}

  onDidWriteData(cb: (data: string) => void): { dispose(): void } {
    const sub = onDidWriteTerminalData((e) => {
      if (e.terminal === this.terminal) cb(e.data);
    });
    return sub;
  }

  sendText(text: string, addNewLine: boolean): void {
    this.terminal.sendText(text, addNewLine);
  }

  /** For map-by-identity equality with `listTerminals()`. */
  get raw(): vscode.Terminal {
    return this.terminal;
  }
}

export function createVSCodeProvider(): TimingTerminalProvider {
  // Cache wrappers so identity-equality survives across `listTerminals()` calls.
  const cache = new WeakMap<vscode.Terminal, VSCodeTimingTerminal>();
  const wrap = (t: vscode.Terminal): VSCodeTimingTerminal => {
    let w = cache.get(t);
    if (!w) {
      w = new VSCodeTimingTerminal(t);
      cache.set(t, w);
    }
    return w;
  };
  return {
    getFocusedTerminal(): TimingTerminal | null {
      const t = vscode.window.activeTerminal;
      // VS Code can briefly retain a disposed terminal as activeTerminal
      // during scope-switch races (`disposeAll` → `reattachForTask`).
      // Filter on `exitStatus` — set the moment a terminal is closed —
      // so the harness retries until a fresh one arrives.
      if (!t || t.exitStatus !== undefined) return null;
      return wrap(t);
    },
    listTerminals(): readonly TimingTerminal[] {
      // Same disposed-but-still-listed window applies to the global list.
      return vscode.window.terminals
        .filter((t) => t.exitStatus === undefined)
        .map(wrap);
    },
    now(): number {
      return performance.now();
    },
  };
}
