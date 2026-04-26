import vscodeModule from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

import { describe, it, expect, vi } from 'vitest';
import {
  TaskService,
  computeExternalStatusEvents,
  computeSyncDiscovery,
} from '../task/task-service';
import type { Task, LocalPhaseSnapshot } from '@tackle/shared';

const baseTask = (id: number, ext: string, external_status: string): Task => ({
  id,
  external_id: ext,
  external_system: 'github',
  title: `T${id}`,
  description: '',
  external_status,
  assignee: null,
  parent_external_id: null,
  worktree_path: null,
  worktree_branch: null,
  worktree_base_branch: null,
  tackle_status: 'not_started',
  synced_at: '',
  created_at: '',
});

describe('computeExternalStatusEvents (Sync diff)', () => {
  it('emits one event per task whose external state differs from local', () => {
    const existing = [baseTask(1, '101', 'open'), baseTask(2, '102', 'open')];
    const incoming = [
      { external_id: '101', state: 'closed' },
      { external_id: '102', state: 'open' },
    ];
    const events = computeExternalStatusEvents(existing, incoming);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'external.status_changed',
      task_id: 1,
      to: 'closed',
      source: 'sync',
    });
  });

  it('emits no events when all states match (idempotent sync)', () => {
    const existing = [baseTask(1, '101', 'open')];
    const incoming = [{ external_id: '101', state: 'open' }];
    const events = computeExternalStatusEvents(existing, incoming);
    expect(events).toHaveLength(0);
  });

  it('emits no event for incoming issues with no local mirror yet', () => {
    const existing: Task[] = [];
    const incoming = [{ external_id: '999', state: 'open' }];
    const events = computeExternalStatusEvents(existing, incoming);
    expect(events).toHaveLength(0);
  });
});

describe('computeSyncDiscovery (Plan Discovery + Plan Source per task)', () => {
  it('returns no work when there are no sub-issues and no plan file', () => {
    const result = computeSyncDiscovery({
      task: { id: 1, external_id: '42' },
      planId: null,
      localPhases: [],
      subIssues: [],
      planFiles: [],
      description: '',
    });
    expect(result.events).toEqual([]);
    expect(result.phaseUpserts).toEqual([]);
    expect(result.planSource).toEqual({ source_kind: 'issue_body', source_ref: null });
  });

  it('detects plan source from plans/ directory listing', () => {
    const result = computeSyncDiscovery({
      task: { id: 1, external_id: '42' },
      planId: null,
      localPhases: [],
      subIssues: [],
      planFiles: ['42-foo.md'],
      description: '',
    });
    expect(result.planSource).toEqual({ source_kind: 'markdown', source_ref: 'plans/42-foo.md' });
  });

  it('emits phase.created events for net-new sub-issues when a plan exists', () => {
    const result = computeSyncDiscovery({
      task: { id: 1, external_id: '42' },
      planId: 7,
      localPhases: [],
      subIssues: [
        { external_id: '101', title: 'Phase A', sort_order: 0 },
        { external_id: '102', title: 'Phase B', sort_order: 1 },
      ],
      planFiles: [],
      description: '',
    });
    expect(result.events).toHaveLength(2);
    expect(result.events[0]).toMatchObject({ type: 'phase.created', external_id: '101' });
    expect(result.events[1]).toMatchObject({ type: 'phase.created', external_id: '102' });
  });

  it('defers sub-issue discovery until a plan row exists (planId null = empty events)', () => {
    const result = computeSyncDiscovery({
      task: { id: 1, external_id: '42' },
      planId: null,
      localPhases: [],
      subIssues: [{ external_id: '101', title: 'Phase A', sort_order: 0 }],
      planFiles: [],
      description: '',
    });
    expect(result.events).toEqual([]);
  });

  it('emits phase.removed for vanished local phases', () => {
    const local: LocalPhaseSnapshot[] = [
      { id: 50, task_id: 1, plan_id: 7, external_id: '101', name: 'Phase A', sort_order: 0 },
    ];
    const result = computeSyncDiscovery({
      task: { id: 1, external_id: '42' },
      planId: 7,
      localPhases: local,
      subIssues: [],
      planFiles: [],
      description: '',
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ type: 'phase.removed', external_id: '101' });
  });

  it('returns upserts for phases whose title or sort_order changed', () => {
    const local: LocalPhaseSnapshot[] = [
      { id: 50, task_id: 1, plan_id: 7, external_id: '101', name: 'Old', sort_order: 5 },
    ];
    const result = computeSyncDiscovery({
      task: { id: 1, external_id: '42' },
      planId: 7,
      localPhases: local,
      subIssues: [{ external_id: '101', title: 'New', sort_order: 0 }],
      planFiles: [],
      description: '',
    });
    expect(result.events).toEqual([]);
    expect(result.phaseUpserts).toEqual([{ phase_id: 50, name: 'New', sort_order: 0 }]);
  });
});

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
