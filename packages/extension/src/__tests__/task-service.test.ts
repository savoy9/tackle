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
