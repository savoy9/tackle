import vscodeModule from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorktreeProvisioner } from '../worktree/worktree-provisioner';
import type { TaskRepository, Task, TaskWorktreeFields } from '@tackle/shared';

interface InMemoryTaskRepoState {
  tasks: Map<number, Task>;
}

function createTaskRepo(state: InMemoryTaskRepoState): TaskRepository {
  return {
    list: async () => Array.from(state.tasks.values()),
    get: async (id: number) => state.tasks.get(id),
    upsert: async () => {},
    upsertBatch: async () => {},
    setWorktree: async (id: number, fields: TaskWorktreeFields) => {
      const t = state.tasks.get(id);
      if (!t) return;
      state.tasks.set(id, {
        ...t,
        worktree_path: fields.worktree_path,
        worktree_branch: fields.worktree_branch,
        worktree_base_branch: fields.worktree_base_branch,
      tackle_status: "not_started",
      });
    },
  };
}

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: 1,
    external_id: '42',
    external_system: 'github',
    title: 'Fix the auth bug',
    description: '',
    status: 'open',
    assignee: null,
    parent_external_id: null,
    worktree_path: null,
    worktree_branch: null,
    worktree_base_branch: null,
    tackle_status: "not_started",
    synced_at: '',
    created_at: '',
    ...over,
  };
}

function git(cwd: string, args: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8' }).trim();
}

function makeRepo(): { repoDir: string; rootDir: string; wtRoot: string } {
  const rootDir = mkdtempSync(join(tmpdir(), 'tackle-wt-'));
  const repoDir = join(rootDir, 'myrepo');
  const wtRoot = join(rootDir, 'wt');
  mkdirSync(repoDir);
  // Configure local user; -c flags would need to apply to every command.
  git(repoDir, 'init -q -b main');
  git(repoDir, 'config user.email tester@example.com');
  git(repoDir, 'config user.name Tester');
  writeFileSync(join(repoDir, 'README.md'), '# repo\n');
  git(repoDir, 'add .');
  git(repoDir, 'commit -q -m initial');
  return { repoDir, rootDir, wtRoot };
}

let rootDir: string;
let repoDir: string;
let wtRoot: string;
let state: InMemoryTaskRepoState;
let repo: TaskRepository;

beforeEach(() => {
  ({ repoDir, rootDir, wtRoot } = makeRepo());
  state = { tasks: new Map() };
  repo = createTaskRepo(state);
});

afterEach(() => {
  try {
    rmSync(rootDir, { recursive: true, force: true });
  } catch {
    /* windows */
  }
});

describe('WorktreeProvisioner.ensureWorktreeForTask', () => {
  it('creates a <id>-<slug> worktree off baseBranch on a fresh repo', async () => {
    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
    });
    const result = await provisioner.ensureWorktreeForTask(task);

    expect(result.branch).toBe('42-fix-the-auth-bug');
    expect(result.baseBranch).toBe('main');
    expect(result.path).toBe(join(wtRoot, '42-fix-the-auth-bug'));
    expect(existsSync(result.path)).toBe(true);
    // git worktree list should include the new path
    const list = git(repoDir, 'worktree list');
    expect(list).toContain('42-fix-the-auth-bug');
    // Persisted to repo
    const updated = await repo.get(1);
    expect(updated!.worktree_path).toBe(result.path);
    expect(updated!.worktree_branch).toBe('42-fix-the-auth-bug');
    expect(updated!.worktree_base_branch).toBe('main');
  });

  it('is idempotent — second call returns same path without duplicating', async () => {
    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
    });
    const first = await provisioner.ensureWorktreeForTask(task);
    const refreshed = (await repo.get(1))!;
    const second = await provisioner.ensureWorktreeForTask(refreshed);

    expect(second.path).toBe(first.path);
    expect(second.branch).toBe(first.branch);
    // Only the main checkout + 1 worktree
    const lines = git(repoDir, 'worktree list').split(/\r?\n/).filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it('reuses an existing local branch when exactly one matches *<external-id>*', async () => {
    // Pre-create a branch the user already started for this issue.
    git(repoDir, 'branch feature/42-prework');

    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
    });
    const result = await provisioner.ensureWorktreeForTask(task);

    expect(result.branch).toBe('feature/42-prework');
    // git worktree list checked out the existing branch
    const list = git(repoDir, 'worktree list');
    expect(list).toContain('feature/42-prework');
  });

  it('falls back to tackle/<external-id> on slug branch collision', async () => {
    // Two pre-existing branches that contain "42" → matching is ambiguous (more
    // than one), so we go to the new-branch path. Then the slug branch already
    // exists, forcing the fallback.
    git(repoDir, 'branch 42-fix-the-auth-bug');
    git(repoDir, 'branch other-42-thing');

    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
    });
    const result = await provisioner.ensureWorktreeForTask(task);

    expect(result.branch).toBe('tackle/42');
    expect(existsSync(result.path)).toBe(true);
    const branches = git(repoDir, 'branch --list')
      .split(/\r?\n/)
      .map((s) => s.replace(/^[\* +]+/, '').trim())
      .filter(Boolean);
    expect(branches).toContain('tackle/42');
  });

  it('logs an info message when the branch-reuse match is ambiguous', async () => {
    // Two branches both contain "42" → `findExistingMatchingBranch` refuses
    // to guess and falls through to creating a fresh branch. The user should
    // see a log line explaining why their expected branch wasn't reused.
    git(repoDir, 'branch feature/42-one');
    git(repoDir, 'branch feature/42-two');

    const task = makeTask({ id: 1, external_id: '42', title: 'A different title' });
    state.tasks.set(1, task);

    const messages: string[] = [];
    const originalInfo = console.info;
    console.info = (msg: string) => {
      messages.push(msg);
    };
    try {
      const provisioner = new WorktreeProvisioner({
        workspaceRoot: repoDir,
        taskRepo: repo,
        rootPath: wtRoot,
      });
      await provisioner.ensureWorktreeForTask(task);
    } finally {
      console.info = originalInfo;
    }
    expect(messages.some((m) => /match.*external id "42"/i.test(m))).toBe(true);
    expect(messages.some((m) => m.includes('feature/42-one') && m.includes('feature/42-two'))).toBe(
      true,
    );
  });

  it('hard-fails with a clear error when workspaceRoot is not a git repo', async () => {
    // Non-git directory: a fresh tempdir with no git init.
    const nonGit = mkdtempSync(join(tmpdir(), 'tackle-nogit-'));
    try {
      const task = makeTask({ id: 1, external_id: '42', title: 'whatever' });
      state.tasks.set(1, task);
      const provisioner = new WorktreeProvisioner({
        workspaceRoot: nonGit,
        taskRepo: repo,
        rootPath: wtRoot,
      });
      await expect(provisioner.ensureWorktreeForTask(task)).rejects.toThrow(
        /git repo|git repository|not a git/i,
      );
      // No partial state: Task row was not updated.
      const updated = await repo.get(1);
      expect(updated!.worktree_path).toBeNull();
    } finally {
      try {
        rmSync(nonGit, { recursive: true, force: true });
      } catch {
        /* windows */
      }
    }
  });

  it('silently recreates the worktree when the directory was deleted from disk', async () => {
    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
    });
    const first = await provisioner.ensureWorktreeForTask(task);
    expect(existsSync(first.path)).toBe(true);

    // Simulate a dev manually deleting the worktree directory from disk.
    rmSync(first.path, { recursive: true, force: true });
    expect(existsSync(first.path)).toBe(false);

    // Next spawn re-runs ensureWorktreeForTask silently → should recreate.
    const refreshed = (await repo.get(1))!;
    const second = await provisioner.ensureWorktreeForTask(refreshed);
    expect(second.path).toBe(first.path);
    expect(second.branch).toBe(first.branch);
    expect(existsSync(second.path)).toBe(true);
    // git worktree list should have exactly main + the recreated worktree
    const lines = git(repoDir, 'worktree list').split(/\r?\n/).filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it('does not inspect or mutate a dirty worktree or a manually-checked-out branch', async () => {
    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
    });
    const first = await provisioner.ensureWorktreeForTask(task);

    // Dirty up the worktree (uncommitted file) and checkout a different branch.
    writeFileSync(join(first.path, 'dirty.txt'), 'uncommitted\n');
    git(first.path, 'checkout -q -b some-other-branch');

    // Capture state before the second call.
    const branchBefore = git(first.path, 'rev-parse --abbrev-ref HEAD');
    const dirtyBefore = existsSync(join(first.path, 'dirty.txt'));
    expect(branchBefore).toBe('some-other-branch');
    expect(dirtyBefore).toBe(true);

    // Spawning again on the same Task: should be a no-op on the worktree.
    const refreshed = (await repo.get(1))!;
    const second = await provisioner.ensureWorktreeForTask(refreshed);
    expect(second.path).toBe(first.path);

    // No branch switch, no file mutation.
    const branchAfter = git(first.path, 'rev-parse --abbrev-ref HEAD');
    expect(branchAfter).toBe('some-other-branch');
    expect(existsSync(join(first.path, 'dirty.txt'))).toBe(true);
    // No new worktree directories created.
    const lines = git(repoDir, 'worktree list').split(/\r?\n/).filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it('when workspaceRoot is itself a worktree, returns workspaceRoot and skips nested creation', async () => {
    // Create a sibling worktree from the main repo, then point the
    // provisioner at that sibling as its workspaceRoot.
    const sibling = join(rootDir, 'sibling-wt');
    git(repoDir, `worktree add -b feature/x "${sibling}"`);

    const task = makeTask({ id: 1, external_id: '99', title: 'noop' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: sibling,
      taskRepo: repo,
      rootPath: wtRoot,
    });
    const result = await provisioner.ensureWorktreeForTask(task);

    expect(result.path).toBe(sibling);
    // No new worktree directory created under wtRoot
    expect(existsSync(wtRoot)).toBe(false);
    // Persisted
    const updated = await repo.get(1);
    expect(updated!.worktree_path).toBe(sibling);
  });
});

describe('WorktreeProvisioner config plumbing', () => {
  it('honors a configReader-supplied baseBranch when creating new branches', async () => {
    // Pre-create a 'develop' branch off main so we can use it as a base.
    git(repoDir, 'branch develop');

    const task = makeTask({ id: 1, external_id: '88', title: 'Use develop' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
      configReader: {
        getBaseBranch: () => 'develop',
        getRootPath: () => undefined,
      },
    });

    const result = await provisioner.ensureWorktreeForTask(task);
    expect(result.baseBranch).toBe('develop');
    // The new branch should fork from develop's tip.
    const developSha = git(repoDir, 'rev-parse develop');
    const branchSha = git(repoDir, `rev-parse ${result.branch}`);
    expect(branchSha).toBe(developSha);
  });

  it('honors a configReader-supplied rootPath with {repoName} substitution', async () => {
    const task = makeTask({ id: 1, external_id: '77', title: 'rooted' });
    state.tasks.set(1, task);

    // configReader returns a rootPath with the {repoName} placeholder; the
    // provisioner should substitute the basename of workspaceRoot.
    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      configReader: {
        getBaseBranch: () => undefined,
        getRootPath: () => join(rootDir, '{repoName}.worktrees'),
      },
    });

    const result = await provisioner.ensureWorktreeForTask(task);
    const expectedRoot = join(rootDir, 'myrepo.worktrees');
    expect(result.path.startsWith(expectedRoot)).toBe(true);
    expect(existsSync(result.path)).toBe(true);
  });

  it('reads config dynamically per call so live setting changes are picked up', async () => {
    let baseBranch = 'main';
    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
      configReader: {
        getBaseBranch: () => baseBranch,
        getRootPath: () => undefined,
      },
    });

    const t1 = makeTask({ id: 1, external_id: '101', title: 'first' });
    state.tasks.set(1, t1);
    const r1 = await provisioner.ensureWorktreeForTask(t1);
    expect(r1.baseBranch).toBe('main');

    // User flips the setting between calls.
    git(repoDir, 'branch develop');
    baseBranch = 'develop';

    const t2 = makeTask({ id: 2, external_id: '102', title: 'second' });
    state.tasks.set(2, t2);
    const r2 = await provisioner.ensureWorktreeForTask(t2);
    expect(r2.baseBranch).toBe('develop');
  });

  it('falls back to defaults when configReader returns undefined for both keys', async () => {
    // Default rootPath `../{repoName}.worktrees/` is resolved against the
    // workspace folder itself, so it lands as a SIBLING of the repo (one
    // level up from the worktree-per-task dir we get inside it). Use a
    // process-unique external id to avoid colliding with stale state from
    // prior test runs of sibling worktrees.
    const uniqueId = `def-${process.pid}-${Date.now()}`;
    const task = makeTask({ id: 1, external_id: uniqueId, title: 'defaulty' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      configReader: {
        getBaseBranch: () => undefined,
        getRootPath: () => undefined,
      },
    });

    const result = await provisioner.ensureWorktreeForTask(task);
    try {
      expect(result.baseBranch).toBe('main');
      // Default `../{repoName}.worktrees/` resolved against workspaceRoot
      // (= rootDir/myrepo) collapses to rootDir/myrepo.worktrees — a sibling
      // of the repo, the idiomatic git layout.
      const defaultRoot = join(rootDir, 'myrepo.worktrees');
      expect(result.path.startsWith(defaultRoot)).toBe(true);
    } finally {
      // Clean up the worktree dir that escaped our tmpdir sandbox.
      try {
        execSync(`git worktree remove --force "${result.path}"`, { cwd: repoDir });
      } catch {
        /* ignore */
      }
      try {
        rmSync(result.path, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
});

describe('createVscodeWorktreeConfigReader', () => {
  it('reads tackle.worktree.baseBranch and tackle.worktree.rootPath from a getConfiguration shim', async () => {
    const { createVscodeWorktreeConfigReader } = await import('../worktree/worktree-config');
    const store: Record<string, unknown> = {
      'worktree.baseBranch': 'trunk',
      'worktree.rootPath': '/somewhere/{repoName}',
    };
    const fakeGetConfiguration = (section?: string) => {
      expect(section).toBe('tackle');
      return {
        get: <T>(key: string): T | undefined => store[key] as T | undefined,
      };
    };
    const reader = createVscodeWorktreeConfigReader(fakeGetConfiguration);
    expect(reader.getBaseBranch()).toBe('trunk');
    expect(reader.getRootPath()).toBe('/somewhere/{repoName}');

    // Mutate store and confirm the reader picks up the new values on each call.
    store['worktree.baseBranch'] = 'release';
    expect(reader.getBaseBranch()).toBe('release');
  });

  it('returns undefined when keys are not set', async () => {
    const { createVscodeWorktreeConfigReader } = await import('../worktree/worktree-config');
    const reader = createVscodeWorktreeConfigReader(() => ({ get: () => undefined }));
    expect(reader.getBaseBranch()).toBeUndefined();
    expect(reader.getRootPath()).toBeUndefined();
  });
});

describe('WorktreeProvisioner.createIsolatedWorktree (α-isolation)', () => {
  it('creates <task-branch>-<session-ref> sub-worktree off the Task branch', async () => {
    const task = makeTask({ id: 1, external_id: '42', title: 'Fix the auth bug' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
    });
    const taskWt = await provisioner.ensureWorktreeForTask(task);

    // Now create an α-isolated sub-worktree for sessionId=7
    const refreshed = (await repo.get(1))!;
    const iso = await provisioner.createIsolatedWorktree(refreshed, 7);

    expect(iso.path).toBe(join(wtRoot, '42-fix-the-auth-bug-7'));
    expect(existsSync(iso.path)).toBe(true);
    expect(iso.branch).toBe(`${taskWt.branch}-7`);
    // Sub-worktree's HEAD branch should be the new sub-branch
    const headBranch = git(iso.path, 'rev-parse --abbrev-ref HEAD');
    expect(headBranch).toBe(iso.branch);
    // Task row is unchanged — α-isolation only feeds Session.worktree_path
    const persisted = await repo.get(1);
    expect(persisted!.worktree_path).toBe(taskWt.path);
    expect(persisted!.worktree_branch).toBe(taskWt.branch);
  });

  it('multiple isolated sessions on the same task get distinct sub-worktrees', async () => {
    const task = makeTask({ id: 1, external_id: '42', title: 'Multi' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
    });
    await provisioner.ensureWorktreeForTask(task);
    const refreshed = (await repo.get(1))!;

    const a = await provisioner.createIsolatedWorktree(refreshed, 1);
    const b = await provisioner.createIsolatedWorktree(refreshed, 2);

    expect(a.path).not.toBe(b.path);
    expect(a.branch).not.toBe(b.branch);
    expect(existsSync(a.path)).toBe(true);
    expect(existsSync(b.path)).toBe(true);

    // git worktree list should show main + task + 2 isolated = 4
    const lines = git(repoDir, 'worktree list').split(/\r?\n/).filter(Boolean);
    expect(lines).toHaveLength(4);
  });

  it('throws when the Task does not yet have a worktree', async () => {
    const task = makeTask({ id: 1, external_id: '42', title: 'No wt yet' });
    state.tasks.set(1, task);
    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
    });
    await expect(provisioner.createIsolatedWorktree(task, 1)).rejects.toThrow();
  });
});

describe('Integration: TerminalOrchestrator + WorktreeProvisioner', () => {
  it('first Session spawn on a Task ends with psmux cwd = Task worktree', async () => {
    // Lazy import inside test to keep top-of-file diff small.
    const { TerminalOrchestrator } = await import('../terminal/terminal-orchestrator');

    const task = makeTask({ id: 1, external_id: '42', title: 'Wire it up' });
    state.tasks.set(1, task);

    const provisioner = new WorktreeProvisioner({
      workspaceRoot: repoDir,
      taskRepo: repo,
      rootPath: wtRoot,
    });

    const sentKeys: Array<[string, string]> = [];
    const fakePsmux = {
      binary: 'tmux',
      createSession: () => undefined,
      killSession: () => undefined,
      hasSession: () => true,
      listSessions: () => [],
      sendKeys: (name: string, keys: string) => {
        sentKeys.push([name, keys]);
      },
    } as any;

    // Minimal in-memory SessionRepository
    const sessions: any[] = [];
    const sessionRepo: any = {
      list: async () => sessions,
      get: async (id: number) => sessions.find((s) => s.id === id),
      listForTask: async (tid: number) => sessions.filter((s) => s.task_id === tid),
      create: async (input: any) => {
        const s = { id: sessions.length + 1, status: 'running', ...input };
        sessions.push(s);
        return s;
      },
      update: async () => {},
      complete: async () => {},
      softDelete: async () => {},
    };

    const agentRegistry = {
      resolve: () => ({
        name: 'agency-cc',
        command: 'agency-cc',
        resumeFlag: (id: string) => ['-r', id],
        detector: 'ClaudeJsonlDetector',
      }),
      shouldLaunch: (kind: string) => kind !== 'shell',
      getDetector: () => null,
      disposeDetectors: () => {},
    } as any;

    const orchestrator = new TerminalOrchestrator(sessionRepo, fakePsmux, agentRegistry, {
      ensureForTask: async (taskId: number) => {
        const t = await repo.get(taskId);
        if (!t) throw new Error('no task');
        return provisioner.ensureWorktreeForTask(t);
      },
    });

    const session = await orchestrator.createTerminal({
      taskId: 1,
      taskSlug: 'wire-it-up',
      kind: 'implement',
    });

    const expectedPath = join(wtRoot, '42-wire-it-up');
    expect(session.worktree_path).toBe(expectedPath);
    expect(sentKeys[0][1]).toContain(`cd '${expectedPath}' `);
    // Task row is updated with worktree fields
    const refreshed = await repo.get(1);
    expect(refreshed!.worktree_path).toBe(expectedPath);
    expect(refreshed!.worktree_branch).toBe('42-wire-it-up');
  });
});
