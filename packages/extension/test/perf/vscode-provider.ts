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
  // Cache wrappers so identity-equality survives across `listTerminals()`
  // calls. Use a strong Map (not WeakMap) so we can deterministically
  // invalidate on close — `WeakMap` would let the wrapper outlive the
  // disposal until GC, which is exactly the race the harness was hitting
  // ("Terminal has already been disposed" on `sendText` in baseline).
  const cache = new Map<vscode.Terminal, VSCodeTimingTerminal>();
  vscode.window.onDidCloseTerminal((t) => {
    cache.delete(t);
  });

  const isLive = (t: vscode.Terminal): boolean => {
    if (t.exitStatus !== undefined) return false;
    // Membership-in-live-list is the strongest signal: VS Code can
    // briefly hold a disposed terminal as `activeTerminal` whose
    // `exitStatus` hasn't yet been set, but it's removed from the
    // global list immediately when disposeAll fires.
    return vscode.window.terminals.includes(t);
  };

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
      if (!t || !isLive(t)) return null;
      return wrap(t);
    },
    listTerminals(): readonly TimingTerminal[] {
      return vscode.window.terminals.filter(isLive).map(wrap);
    },
    now(): number {
      return performance.now();
    },
  };
}
