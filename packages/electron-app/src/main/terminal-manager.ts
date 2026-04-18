import * as pty from 'node-pty';
import { randomUUID } from 'crypto';

export interface TerminalSession {
  id: string;
  status: 'running' | 'exited';
  pid: number;
}

interface ManagedSession {
  id: string;
  ptyProcess: pty.IPty;
  status: 'running' | 'exited';
  dataListeners: ((data: string) => void)[];
}

export class TerminalManager {
  private sessions = new Map<string, ManagedSession>();

  create(shell?: string): TerminalSession {
    const id = randomUUID();
    const defaultShell =
      process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';

    const ptyProcess = pty.spawn(shell || defaultShell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    const session: ManagedSession = {
      id,
      ptyProcess,
      status: 'running',
      dataListeners: [],
    };

    ptyProcess.onData((data: string) => {
      for (const listener of session.dataListeners) {
        listener(data);
      }
    });

    ptyProcess.onExit(() => {
      session.status = 'exited';
    });

    this.sessions.set(id, session);

    return { id, status: 'running', pid: ptyProcess.pid };
  }

  list(): TerminalSession[] {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      status: s.status,
      pid: s.ptyProcess.pid,
    }));
  }

  get(id: string): TerminalSession | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    return { id: session.id, status: session.status, pid: session.ptyProcess.pid };
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.ptyProcess.write(data);
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (session) {
      session.ptyProcess.resize(cols, rows);
    }
  }

  onData(id: string, callback: (data: string) => void): void {
    const session = this.sessions.get(id);
    if (session) {
      session.dataListeners.push(callback);
    }
  }

  destroy(id: string): void {
    const session = this.sessions.get(id);
    if (session) {
      session.ptyProcess.kill();
      this.sessions.delete(id);
    }
  }

  destroyAll(): void {
    for (const id of this.sessions.keys()) {
      this.destroy(id);
    }
  }
}
