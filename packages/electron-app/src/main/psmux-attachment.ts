import * as pty from 'node-pty';

export class PsmuxAttachment {
  private ptyProcess: pty.IPty | null = null;
  private dataListeners: ((data: string) => void)[] = [];
  private exitListeners: (() => void)[] = [];

  onData(callback: (data: string) => void): void {
    this.dataListeners.push(callback);
  }

  onExit(callback: () => void): void {
    this.exitListeners.push(callback);
  }

  attach(sessionName: string): void {
    this.detach();

    const shell = process.platform === 'win32' ? 'tmux.exe' : 'tmux';

    this.ptyProcess = pty.spawn(shell, ['attach-session', '-t', sessionName], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env as Record<string, string>,
    });

    this.ptyProcess.onData((data: string) => {
      for (const listener of this.dataListeners) {
        listener(data);
      }
    });

    this.ptyProcess.onExit(() => {
      this.ptyProcess = null;
      for (const listener of this.exitListeners) {
        listener();
      }
    });
  }

  detach(): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }

  write(data: string): void {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.write(data);
      } catch {
        // PTY may have closed — ignore write errors
      }
    }
  }

  resize(cols: number, rows: number): void {
    if (this.ptyProcess) {
      try {
        this.ptyProcess.resize(cols, rows);
      } catch {
        // PTY may have closed — ignore resize errors
      }
    }
  }

  get isAttached(): boolean {
    return this.ptyProcess !== null;
  }
}
