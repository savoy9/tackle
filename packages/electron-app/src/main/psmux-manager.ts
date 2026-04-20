import { execSync } from 'child_process';

export interface PsmuxWindow {
  index: number;
  name: string;
  active: boolean;
}

export interface PsmuxPane {
  index: number;
  pid: number;
  active: boolean;
}

export class PsmuxManager {
  private exec(cmd: string): string {
    try {
      return execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    } catch (e: any) {
      // tmux returns exit code 1 for "no sessions" etc.
      if (e.stdout) return e.stdout.toString().trim();
      throw e;
    }
  }

  createSession(name: string): void {
    this.exec(`tmux new-session -d -s "${name}"`);
  }

  killSession(name: string): void {
    this.exec(`tmux kill-session -t "${name}"`);
  }

  hasSession(name: string): boolean {
    try {
      this.exec(`tmux has-session -t "${name}"`);
      return true;
    } catch {
      return false;
    }
  }

  listSessions(): string[] {
    const output = this.exec('tmux list-sessions');
    if (!output) return [];
    return output.split('\n').filter(Boolean).map((line) => {
      // Format: "session-name: N windows (created ...)"
      const colonIdx = line.indexOf(':');
      return colonIdx >= 0 ? line.substring(0, colonIdx) : line;
    });
  }

  createWindow(sessionName: string, windowName: string): void {
    this.exec(`tmux new-window -t "${sessionName}" -n "${windowName}"`);
  }

  selectWindow(sessionName: string, windowName: string): void {
    this.exec(`tmux select-window -t "${sessionName}:${windowName}"`);
  }

  listWindows(sessionName: string): PsmuxWindow[] {
    const output = this.exec(`tmux list-windows -t "${sessionName}"`);
    if (!output) return [];
    // Format: "0: name* (1 panes) [120x30]" — * means active, - means last
    return output.split('\n').filter(Boolean).map((line) => {
      const match = line.match(/^(\d+):\s+(\S+?)([*-]?)\s+\(/);
      if (!match) return { index: 0, name: line, active: false };
      return {
        index: parseInt(match[1], 10),
        name: match[2],
        active: match[3] === '*',
      };
    });
  }

  createPane(sessionName: string, windowTarget?: string): void {
    const target = windowTarget
      ? `"${sessionName}:${windowTarget}"`
      : `"${sessionName}"`;
    this.exec(`tmux split-window -t ${target}`);
  }

  listPanes(sessionName: string, windowTarget?: string): PsmuxPane[] {
    const target = windowTarget
      ? `"${sessionName}:${windowTarget}"`
      : `"${sessionName}"`;
    const output = this.exec(`tmux list-panes -t ${target}`);
    if (!output) return [];
    // Format: "0: [120x30] [history ...] %1 (active)"
    return output.split('\n').filter(Boolean).map((line) => {
      const indexMatch = line.match(/^(\d+):/);
      const pidMatch = line.match(/%(\d+)/);
      const active = line.includes('(active)');
      return {
        index: indexMatch ? parseInt(indexMatch[1], 10) : 0,
        pid: pidMatch ? parseInt(pidMatch[1], 10) : 0,
        active,
      };
    });
  }

  sendKeys(sessionName: string, keys: string, target?: string): void {
    const t = target
      ? `"${sessionName}:${target}"`
      : `"${sessionName}"`;
    this.exec(`tmux send-keys -t ${t} "${keys}" Enter`);
  }
}
