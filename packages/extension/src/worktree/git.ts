import { execFileSync } from 'node:child_process';

export interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

export function gitTry(cwd: string, args: string[]): GitResult {
  try {
    const out = execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: out.trim(), stderr: '' };
  } catch (e) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      ok: false,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}
