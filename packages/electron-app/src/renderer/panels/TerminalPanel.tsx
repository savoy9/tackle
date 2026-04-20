import React, { useRef, useEffect } from 'react';
import type { ManagedSessionInfo } from '../types';
import { PanelHeader, collapseButtonStyle } from '../components/PanelHeader';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

interface TerminalPanelProps {
  sessions: ManagedSessionInfo[];
  activeSessionId: number | null;
  onSelectSession: (id: number) => void;
  onNewSession: () => void;
}

export function TerminalPanel({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
}: TerminalPanelProps) {
  const termContainerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const unsubDataRef = useRef<(() => void) | null>(null);

  // Initialize xterm.js once
  useEffect(() => {
    if (!termContainerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      theme: {
        background: '#1a1a1e',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termContainerRef.current);

    // Fit to container
    try { fitAddon.fit(); } catch { /* ignore if container not ready */ }

    // Forward keyboard input to psmux
    term.onData((data) => {
      window.chartroom?.terminal?.write(data);
    });

    // Receive output from psmux
    const unsub = window.chartroom?.terminal?.onData((data: string) => {
      term.write(data);
    });
    unsubDataRef.current = unsub ?? null;

    // Send initial resize
    const { cols, rows } = term;
    window.chartroom?.terminal?.resize(cols, rows);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Resize observer
    const observer = new ResizeObserver(() => {
      try {
        fitAddon.fit();
        const { cols: c, rows: r } = term;
        window.chartroom?.terminal?.resize(c, r);
      } catch { /* ignore */ }
    });
    observer.observe(termContainerRef.current);

    return () => {
      observer.disconnect();
      unsubDataRef.current?.();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  return (
    <>
      <PanelHeader
        title="Terminal"
        action={
          <button onClick={onNewSession} style={collapseButtonStyle} title="New session">
            +
          </button>
        }
      />
      {/* Session tab bar */}
      {sessions.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 2,
            padding: '4px 8px',
            borderBottom: '1px solid #2a2a2e',
            overflowX: 'auto',
          }}
        >
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              style={{
                padding: '4px 12px',
                borderRadius: 4,
                border: 'none',
                background: activeSessionId === s.id ? '#2a2a3a' : 'transparent',
                color: s.status === 'running' ? '#e0e0e0' : '#666',
                cursor: 'pointer',
                fontSize: 12,
                whiteSpace: 'nowrap',
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div
        ref={termContainerRef}
        data-testid="terminal-container"
        style={{
          flex: 1,
          padding: 4,
        }}
      />
    </>
  );
}
