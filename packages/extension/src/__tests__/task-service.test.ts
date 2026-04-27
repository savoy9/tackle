import vscodeModule from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

import { describe, it, expect, vi } from 'vitest';
import {
  TaskService,
  computeExternalStatusEvents,
  computeSyncDiscovery,
  filterIssuesByLabels,
  parseNextPageUrl,
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

describe('filterIssuesByLabels', () => {
  type LabeledIssue = { number: number; labels: Array<{ name: string }> };
  const labeled = (n: number, names: string[]): LabeledIssue => ({
    number: n,
    labels: names.map((name) => ({ name })),
  });

  it('returns all issues when allowed labels list is empty (no filter configured)', () => {
    const issues = [labeled(1, ['bug']), labeled(2, [])];
    expect(filterIssuesByLabels(issues, [])).toEqual(issues);
  });

  it('keeps only issues having at least one allowed label', () => {
    const issues = [labeled(1, ['bug', 'tackle']), labeled(2, ['bug']), labeled(3, ['tackle'])];
    expect(filterIssuesByLabels(issues, ['tackle']).map((i) => i.number)).toEqual([1, 3]);
  });

  it('label match is case-insensitive', () => {
    const issues = [labeled(1, ['Tackle']), labeled(2, ['TACKLE'])];
    expect(filterIssuesByLabels(issues, ['tackle']).map((i) => i.number)).toEqual([1, 2]);
  });

  it('issue with no labels is excluded when filter is configured', () => {
    expect(filterIssuesByLabels([labeled(1, [])], ['tackle'])).toEqual([]);
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

describe('TaskService.applyPlanDiscovery (IO orchestration)', () => {
  type FakePlan = {
    id: number;
    task_id: number;
    source_kind: string | null;
    source_ref: string | null;
  };
  type FakePhase = {
    id: number;
    plan_id: number;
    task_id: number;
    external_id: string | null;
    name: string;
    sort_order: number;
  };

  function makeFakeRepos(opts: {
    tasks: Array<Pick<Task, 'id' | 'external_id' | 'description'>>;
    plans: FakePlan[];
    phases: FakePhase[];
  }) {
    const planUpserts: Array<{
      task_id: number;
      source_kind: string | null;
      source_ref: string | null;
    }> = [];
    const phaseUpdates: Array<{ id: number; fields: { name?: string; sort_order?: number } }> = [];
    const taskRepo = {
      list: async () => opts.tasks as Task[],
      get: async (id: number) => opts.tasks.find((t) => t.id === id) as Task | undefined,
    };
    const plansRepo = {
      get: async (taskId: number) => opts.plans.find((p) => p.task_id === taskId),
      save: async (plan: {
        task_id: number;
        source_path: string;
        source_kind: string | null;
        source_ref: string | null;
        extracted_at: string | null;
      }) => {
        planUpserts.push({
          task_id: plan.task_id,
          source_kind: plan.source_kind,
          source_ref: plan.source_ref,
        });
        const existing = opts.plans.find((p) => p.task_id === plan.task_id);
        if (existing) {
          existing.source_kind = plan.source_kind;
          existing.source_ref = plan.source_ref;
          return existing as never;
        }
        const created: FakePlan = {
          id: opts.plans.length + 1,
          task_id: plan.task_id,
          source_kind: plan.source_kind,
          source_ref: plan.source_ref,
        };
        opts.plans.push(created);
        return created as never;
      },
    };
    const phasesRepo = {
      listForPlan: async (planId: number) =>
        opts.phases.filter((p) => p.plan_id === planId) as never,
      update: async (id: number, fields: { name?: string; sort_order?: number }) => {
        phaseUpdates.push({ id, fields });
      },
    };
    return { taskRepo, plansRepo, phasesRepo, planUpserts, phaseUpdates };
  }

  it('saves the detected plan source for each task with a plans row', async () => {
    const repos = makeFakeRepos({
      tasks: [{ id: 1, external_id: '42', description: '' } as Task],
      plans: [{ id: 100, task_id: 1, source_kind: null, source_ref: null }],
      phases: [],
    });
    const events: unknown[] = [];
    const bus = { dispatch: (e: unknown) => events.push(e) };
    const service = new TaskService(repos.taskRepo as never, bus as never, {
      plansRepo: repos.plansRepo as never,
      phasesRepo: repos.phasesRepo as never,
      fetchSubIssues: async () => [],
      listPlanFiles: async () => ['42-foo.md'],
    });
    await service.applyPlanDiscovery();
    expect(repos.planUpserts).toEqual([
      { task_id: 1, source_kind: 'markdown', source_ref: 'plans/42-foo.md' },
    ]);
  });

  it('dispatches phase.created events for net-new sub-issues', async () => {
    const repos = makeFakeRepos({
      tasks: [{ id: 1, external_id: '42', description: '' } as Task],
      plans: [{ id: 100, task_id: 1, source_kind: null, source_ref: null }],
      phases: [],
    });
    const events: unknown[] = [];
    const bus = { dispatch: (e: unknown) => events.push(e) };
    const service = new TaskService(repos.taskRepo as never, bus as never, {
      plansRepo: repos.plansRepo as never,
      phasesRepo: repos.phasesRepo as never,
      fetchSubIssues: async (extId: string) =>
        extId === '42' ? [{ external_id: '201', title: 'Phase A', sort_order: 0 }] : [],
      listPlanFiles: async () => [],
    });
    await service.applyPlanDiscovery();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'phase.created',
      task_id: 1,
      plan_id: 100,
      external_id: '201',
      name: 'Phase A',
    });
  });

  it('skips tasks that have no plans row (no plan_started yet)', async () => {
    const repos = makeFakeRepos({
      tasks: [{ id: 1, external_id: '42', description: '' } as Task],
      plans: [],
      phases: [],
    });
    const events: unknown[] = [];
    const bus = { dispatch: (e: unknown) => events.push(e) };
    const fetchSpy = vi.fn(async () => []);
    const service = new TaskService(repos.taskRepo as never, bus as never, {
      plansRepo: repos.plansRepo as never,
      phasesRepo: repos.phasesRepo as never,
      fetchSubIssues: fetchSpy as never,
      listPlanFiles: async () => [],
    });
    await service.applyPlanDiscovery();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(repos.planUpserts).toEqual([]);
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

describe('TaskService.syncFromGitHub — pagination + state=all (#86)', () => {
  type Issue = {
    number: number;
    title: string;
    body: string;
    state: string;
    assignee: null;
    labels: never[];
  };
  const mkIssue = (n: number, state: 'open' | 'closed'): Issue => ({
    number: n,
    title: `T${n}`,
    body: '',
    state,
    assignee: null,
    labels: [],
  });

  function mkResponse(body: unknown, link: string | null = null): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: link
        ? { Link: link, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' },
    });
  }

  function setupFetch(pages: Array<{ body: Issue[]; nextUrl: string | null }>) {
    const calls: string[] = [];
    const orig = globalThis.fetch;
    let i = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      calls.push(String(url));
      const page = pages[i++];
      if (!page) throw new Error(`Unexpected extra fetch: ${url}`);
      const link = page.nextUrl ? `<${page.nextUrl}>; rel="next"` : null;
      return mkResponse(page.body, link);
    }) as typeof fetch;
    return {
      calls,
      restore: () => {
        globalThis.fetch = orig;
      },
    };
  }

  function setupVscode() {
    (vscodeModule.authentication.getSession as any).mockResolvedValue({
      accessToken: 'tok',
    });
    // Force the configured-remote path so getRemote() doesn't try git.
    (vscodeModule.workspace.getConfiguration as any) = vi.fn(() => ({
      get: (key: string, dflt?: unknown) => {
        if (key === 'github.repo') return 'octo/repo';
        if (key === 'labels.enabled') return [];
        return dflt;
      },
    }));
  }

  function makeRepo(initial: Task[]) {
    const rows: Task[] = [...initial];
    return {
      list: async () => rows,
      upsertBatch: vi.fn(async () => {}),
      get: async (id: number) => rows.find((r) => r.id === id),
    } as never;
  }

  it('fetches state=all on the first page', async () => {
    setupVscode();
    const fx = setupFetch([{ body: [mkIssue(1, 'open')], nextUrl: null }]);
    try {
      const svc = new TaskService(makeRepo([]));
      await svc.syncFromGitHub();
      expect(fx.calls[0]).toContain('state=all');
      expect(fx.calls[0]).toContain('per_page=100');
    } finally {
      fx.restore();
    }
  });

  it('walks Link rel="next" until exhausted, accumulating pages', async () => {
    setupVscode();
    const page2Url = 'https://api.github.com/repos/octo/repo/issues?page=2';
    const fx = setupFetch([
      { body: [mkIssue(1, 'open')], nextUrl: page2Url },
      { body: [mkIssue(2, 'closed')], nextUrl: null },
    ]);
    try {
      const repo = makeRepo([]);
      const svc = new TaskService(repo);
      await svc.syncFromGitHub();
      expect(fx.calls).toHaveLength(2);
      expect(fx.calls[1]).toBe(page2Url);
      // upsertBatch sees BOTH pages' issues
      const upserted = (repo as any).upsertBatch.mock.calls[0][0] as Array<{ external_id: string }>;
      expect(upserted.map((t) => t.external_id).sort()).toEqual(['1', '2']);
    } finally {
      fx.restore();
    }
  });

  it('dispatches external.status_changed for issues that closed on GitHub since last sync', async () => {
    setupVscode();
    // Local mirror says #1 is open. Remote sends it back as closed.
    const fx = setupFetch([{ body: [mkIssue(1, 'closed')], nextUrl: null }]);
    try {
      const repo = makeRepo([baseTask(1, '1', 'open')]);
      const dispatched: unknown[] = [];
      const eventBus = {
        register: vi.fn(),
        dispatch: vi.fn((e: unknown) => dispatched.push(e)),
        onRefresh: vi.fn(),
        onMutation: vi.fn(),
      } as never;
      const svc = new TaskService(repo, eventBus);
      await svc.syncFromGitHub();
      expect(dispatched).toEqual([
        expect.objectContaining({
          type: 'external.status_changed',
          task_id: 1,
          to: 'closed',
          source: 'sync',
        }),
      ]);
    } finally {
      fx.restore();
    }
  });
});

describe('parseNextPageUrl (#86 GitHub Link header pagination)', () => {
  it('returns null for empty / missing header', () => {
    expect(parseNextPageUrl(null)).toBeNull();
    expect(parseNextPageUrl(undefined)).toBeNull();
    expect(parseNextPageUrl('')).toBeNull();
  });

  it('extracts the rel="next" URL when present', () => {
    const header =
      '<https://api.github.com/repos/o/r/issues?page=2>; rel="next", ' +
      '<https://api.github.com/repos/o/r/issues?page=5>; rel="last"';
    expect(parseNextPageUrl(header)).toBe('https://api.github.com/repos/o/r/issues?page=2');
  });

  it('returns null on the last page (no rel="next")', () => {
    const header =
      '<https://api.github.com/repos/o/r/issues?page=1>; rel="prev", ' +
      '<https://api.github.com/repos/o/r/issues?page=1>; rel="first"';
    expect(parseNextPageUrl(header)).toBeNull();
  });
});

describe('computeExternalStatusEvents — closure detection (#86)', () => {
  it('emits external.status_changed=closed when an issue closed on GitHub since last sync', () => {
    // The bug pre-fix: incoming only carried open issues, so the closed
    // issue silently dropped out of the diff and no event fired. The fix
    // is to fetch state=all upstream — at this layer we just verify the
    // diff produces the right event when the closed issue IS in incoming.
    const existing = [baseTask(1, '101', 'open'), baseTask(2, '102', 'open')];
    const incoming = [
      { external_id: '101', state: 'open' },
      { external_id: '102', state: 'closed' },
    ];
    const events = computeExternalStatusEvents(existing, incoming);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ task_id: 2, to: 'closed' });
  });
});
