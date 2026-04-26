import { execSync } from 'child_process';

function detectBinary(): string {
  const which = (cmd: string) => {
    execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  };
  // Prefer psmux (Windows-friendly tmux-alike), fall back to tmux
  try {
    which('psmux');
    return 'psmux';
  } catch {
    /* try tmux */
  }
  try {
    which('tmux');
    return 'tmux';
  } catch {
    /* none */
  }
  return '';
}

export class PsmuxBridge {
  readonly binary: string;

  constructor(binary?: string) {
    this.binary = binary ?? detectBinary();
  }

  private exec(cmd: string): string {
    try {
      return execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    } catch (e: any) {
      if (e.stdout) return e.stdout.toString().trim();
      throw e;
    }
  }

  static hasExecutable(): boolean {
    return detectBinary() !== '';
  }

  static generateSessionName(
    source: string,
    taskId: string,
    kind: string,
    n: number,
    prefix = 'tackle-',
  ): string {
    return `${prefix}${source}-${taskId}-${kind}${n}`;
  }

  static generateTabLabel(
    taskId: string,
    slug: string,
    kind: string,
    n: number,
    label?: string,
  ): string {
    const base = `${taskId}-${slug}|${kind}${n}`;
    return label ? `${base}-${label}` : base;
  }

  private assertBinary(): void {
    if (!this.binary) {
      throw new Error(
        'No terminal multiplexer found. Install psmux or tmux and reactivate Tackle.',
      );
    }
  }

  createSession(name: string): void {
    this.assertBinary();
    this.exec(`${this.binary} new-session -d -s "${name}"`);
  }

  killSession(name: string): void {
    this.assertBinary();
    this.exec(`${this.binary} kill-session -t "${name}"`);
  }

  hasSession(name: string): boolean {
    if (!this.binary) return false;
    try {
      this.exec(`${this.binary} has-session -t "${name}"`);
      return true;
    } catch {
      return false;
    }
  }

  listSessions(): string[] {
    if (!this.binary) return [];
    const output = this.exec(`${this.binary} list-sessions`);
    if (!output) return [];
    return output
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const colonIdx = line.indexOf(':');
        return colonIdx >= 0 ? line.substring(0, colonIdx) : line;
      });
  }

  sendKeys(sessionName: string, keys: string, target?: string): void {
    this.assertBinary();
    const t = target ? `"${sessionName}:${target}"` : `"${sessionName}"`;
    this.exec(`${this.binary} send-keys -t ${t} "${keys}" Enter`);
  }
}
