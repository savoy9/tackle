import vscodeModule from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

import { describe, it, expect } from 'vitest';
import { TaskService } from '../task/task-service';

describe('TaskService.parseGitRemote', () => {
  it('extracts owner/repo from HTTPS URL', () => {
    const result = TaskService.parseGitRemote('https://github.com/octocat/hello-world.git');
    expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
  });

  it('extracts owner/repo from HTTPS URL without .git', () => {
    const result = TaskService.parseGitRemote('https://github.com/octocat/hello-world');
    expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
  });

  it('extracts owner/repo from SSH URL', () => {
    const result = TaskService.parseGitRemote('git@github.com:octocat/hello-world.git');
    expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
  });

  it('extracts owner/repo from SSH URL without .git', () => {
    const result = TaskService.parseGitRemote('git@github.com:octocat/hello-world');
    expect(result).toEqual({ owner: 'octocat', repo: 'hello-world' });
  });

  it('returns null for invalid URL', () => {
    expect(TaskService.parseGitRemote('not-a-url')).toBeNull();
    expect(TaskService.parseGitRemote('https://gitlab.com/foo/bar')).toBeNull();
    expect(TaskService.parseGitRemote('')).toBeNull();
  });

  it('handles repo names with dots (common for *.github.io repos)', () => {
    const r = TaskService.parseGitRemote('https://github.com/octocat/some.repo.git');
    expect(r).toEqual({ owner: 'octocat', repo: 'some.repo' });
  });

  it('handles HTTPS URL with embedded credentials', () => {
    const r = TaskService.parseGitRemote('https://user:token@github.com/octocat/hello.git');
    expect(r).toEqual({ owner: 'octocat', repo: 'hello' });
  });

  it('handles ssh:// scheme URLs', () => {
    const r = TaskService.parseGitRemote('ssh://git@github.com/octocat/hello.git');
    expect(r).toEqual({ owner: 'octocat', repo: 'hello' });
  });

  it('handles trailing slash', () => {
    const r = TaskService.parseGitRemote('https://github.com/octocat/hello/');
    expect(r).toEqual({ owner: 'octocat', repo: 'hello' });
  });
});

describe('TaskService.parseOwnerRepo', () => {
  it('parses bare owner/repo', () => {
    expect(TaskService.parseOwnerRepo('octocat/hello')).toEqual({
      owner: 'octocat',
      repo: 'hello',
    });
  });
  it('tolerates trailing .git', () => {
    expect(TaskService.parseOwnerRepo('octocat/hello.git')).toEqual({
      owner: 'octocat',
      repo: 'hello',
    });
  });
  it('rejects bare strings', () => {
    expect(TaskService.parseOwnerRepo('hello')).toBeNull();
    expect(TaskService.parseOwnerRepo('')).toBeNull();
    expect(TaskService.parseOwnerRepo('a/b/c')).toBeNull();
  });
});

describe('TaskService.redactRemoteUrl', () => {
  it('strips user:token from https URLs', () => {
    expect(TaskService.redactRemoteUrl('https://user:token@github.com/octocat/hello.git')).toBe(
      'https://github.com/octocat/hello.git',
    );
  });
  it('strips bare token from https URLs', () => {
    expect(TaskService.redactRemoteUrl('https://ghp_abcd1234@github.com/octocat/hello.git')).toBe(
      'https://github.com/octocat/hello.git',
    );
  });
  it('leaves plain https URLs untouched', () => {
    expect(TaskService.redactRemoteUrl('https://github.com/octocat/hello.git')).toBe(
      'https://github.com/octocat/hello.git',
    );
  });
  it('leaves ssh URLs untouched (no userinfo@ pattern)', () => {
    expect(TaskService.redactRemoteUrl('git@github.com:octocat/hello.git')).toBe(
      'git@github.com:octocat/hello.git',
    );
  });
  it('truncates pathologically long URLs', () => {
    const long = 'https://github.com/' + 'a'.repeat(500);
    const out = TaskService.redactRemoteUrl(long);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith('...')).toBe(true);
  });
});
