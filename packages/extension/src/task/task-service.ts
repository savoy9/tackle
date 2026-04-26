import * as vscode from 'vscode';
import { execFileSync } from 'node:child_process';
import {
  computePhaseDiscoveryEvents,
  detectPlanSource,
  type DetectPlanSourceOutput,
  type EventBus,
  type ExternalChildItem,
  type ExternalStatusChangedEvent,
  type LocalPhaseSnapshot,
  type PhaseCreatedEvent,
  type PhaseRemovedEvent,
  type PhaseRepository,
  type PhaseUpsert,
  type Plan,
  type PlanRepository,
  type Task,
  type TaskRepository,
  type UpsertTask,
} from '@tackle/shared';

interface IncomingIssue {
  external_id: string;
  state: string;
}

/**
 * Pure diff: given the current local Task rows and the incoming external
 * issues from Sync, return the `external.status_changed` events that need
 * to be dispatched. First-time-seen issues are NOT eventized (they're
 * created by upsertBatch instead).
 */
export function computeExternalStatusEvents(
  existing: Pick<Task, 'id' | 'external_id' | 'external_status'>[],
  incoming: IncomingIssue[],
): ExternalStatusChangedEvent[] {
  const byExtId = new Map<string, { id: number; external_status: string }>();
  for (const t of existing) {
    byExtId.set(t.external_id, { id: t.id, external_status: t.external_status });
  }
  const events: ExternalStatusChangedEvent[] = [];
  for (const issue of incoming) {
    const local = byExtId.get(issue.external_id);
    if (!local) continue; // newly created — handled by upsertBatch
    if (local.external_status === issue.state) continue;
    events.push({
      type: 'external.status_changed',
      task_id: local.id,
      to: issue.state,
      source: 'sync',
    });
  }
  return events;
}

/**
 * Filter incoming GitHub issues by the user's configured Tackle label allow-
 * list. If the allow-list is empty (no filter configured), all issues pass.
 * Otherwise an issue passes iff at least one of its labels matches one of
 * the allowed labels (case-insensitive, trimmed).
 *
 * Pure helper. The caller pulls allowed labels from VS Code settings.
 */
export function filterIssuesByLabels<T extends { labels: Array<{ name: string }> }>(
  issues: T[],
  allowedLabels: string[],
): T[] {
  if (allowedLabels.length === 0) return issues;
  const allow = new Set(allowedLabels.map((s) => s.trim().toLowerCase()).filter(Boolean));
  if (allow.size === 0) return issues;
  return issues.filter((issue) =>
    issue.labels.some((l) => allow.has(l.name.trim().toLowerCase())),
  );
}

/**
 * Pure helper for the Plan Discovery + Plan Source side of Sync. For ONE task,
 * given the freshly fetched sub-issues and the local phase mirror, return:
 *   - the events the bus should dispatch (phase.created / phase.removed)
 *   - the phase title/order upserts to apply directly via the phases repo
 *   - the detected plan source kind/ref to record on the plans row
 *
 * No IO. The caller fetches sub-issues and lists `plans/`.
 */
export interface SyncDiscoveryInput {
  task: Pick<Task, 'id' | 'external_id'>;
  /**
   * The local Plan id for this task, or null if no plan exists yet. Required
   * to emit phase.created events; if null, sub-issues are deferred until a
   * plan row is created.
   */
  planId: number | null;
  localPhases: LocalPhaseSnapshot[];
  subIssues: ExternalChildItem[];
  planFiles: string[];
  description: string;
}

export interface SyncDiscoveryOutput {
  events: Array<PhaseCreatedEvent | PhaseRemovedEvent>;
  phaseUpserts: PhaseUpsert[];
  planSource: DetectPlanSourceOutput;
}

export function computeSyncDiscovery(input: SyncDiscoveryInput): SyncDiscoveryOutput {
  const planSource = detectPlanSource({
    external_id: input.task.external_id,
    planFiles: input.planFiles,
    description: input.description,
  });

  if (input.planId === null) {
    return { events: [], phaseUpserts: [], planSource };
  }

  const { events, upserts } = computePhaseDiscoveryEvents({
    task_id: input.task.id,
    plan_id: input.planId,
    local: input.localPhases,
    incoming: input.subIssues,
    source: 'sync',
  });
  return { events, phaseUpserts: upserts, planSource };
}

/**
 * Optional Plan-Discovery-related dependencies. The base TaskService is
 * usable without them (Sync still produces tasks + external_status events);
 * pass these to enable Plan Source detection + sub-issue mirroring.
 */
export interface PlanDiscoveryDeps {
  plansRepo: PlanRepository;
  phasesRepo: PhaseRepository;
  /** Returns the GH sub-issues for a parent issue's external_id. */
  fetchSubIssues: (parentExternalId: string) => Promise<ExternalChildItem[]>;
  /** Returns the basenames of files in the workspace `plans/` directory. */
  listPlanFiles: () => Promise<string[]>;
}

export class TaskService {
  constructor(
    private taskRepo: TaskRepository,
    private eventBus?: EventBus,
    private deps?: PlanDiscoveryDeps,
  ) {}

  /**
   * For each Task that already has a plans row (i.e. plan_started has fired),
   * fetch its GitHub sub-issues, list the workspace `plans/` directory, run
   * Plan Discovery, dispatch the resulting phase events, apply phase
   * title/order upserts, and upsert the detected Plan Source onto the
   * plans row.
   *
   * No-op when PlanDiscoveryDeps were not supplied at construction.
   */
  async applyPlanDiscovery(): Promise<void> {
    if (!this.deps) return;
    const { plansRepo, phasesRepo, fetchSubIssues, listPlanFiles } = this.deps;
    const [tasks, planFiles] = await Promise.all([this.taskRepo.list(), listPlanFiles()]);

    await Promise.all(
      tasks.map(async (task) => {
        const plan: Plan | undefined = await plansRepo.get(task.id);
        if (!plan) return; // No plan_started yet — skip discovery for this task.

        const [phaseRows, subIssues] = await Promise.all([
          phasesRepo.listForPlan(plan.id),
          fetchSubIssues(task.external_id),
        ]);
        const localPhases: LocalPhaseSnapshot[] = phaseRows.map((p) => ({
          id: p.id,
          task_id: p.task_id,
          plan_id: p.plan_id,
          external_id: p.external_id,
          name: p.name,
          sort_order: p.sort_order,
        }));

        const result = computeSyncDiscovery({
          task: { id: task.id, external_id: task.external_id },
          planId: plan.id,
          localPhases,
          subIssues,
          planFiles,
          description: task.description,
        });

        await Promise.all([
          plansRepo.save({
            task_id: task.id,
            source_path: plan.source_path,
            source_kind: result.planSource.source_kind,
            source_ref: result.planSource.source_ref,
            extracted_at: plan.extracted_at,
          }),
          ...result.phaseUpserts.map((u) =>
            phasesRepo.update(u.phase_id, { name: u.name, sort_order: u.sort_order }),
          ),
        ]);

        if (this.eventBus) {
          for (const ev of result.events) {
            try {
              this.eventBus.dispatch(ev);
            } catch (err) {
              console.warn('[tackle] phase event dispatch failed', err);
            }
          }
        }
      }),
    );
  }

  async syncFromGitHub(): Promise<number> {
    const session = await vscode.authentication.getSession('github', ['repo'], {
      createIfNone: true,
    });
    if (!session) {
      throw new Error('GitHub authentication required');
    }

    const { remote, diagnostics } = await this.getRemote();
    if (!remote) {
      throw new Error(`Could not determine GitHub repository from workspace. ${diagnostics}`);
    }

    const response = await fetch(
      `https://api.github.com/repos/${remote.owner}/${remote.repo}/issues?state=open&per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: 'application/vnd.github+json',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const issues = (await response.json()) as Array<{
      number: number;
      title: string;
      body: string | null;
      state: string;
      assignee: { login: string } | null;
      labels: Array<{ name: string }>;
    }>;

    // Apply Label Config filter (#79). When `tackle.labels.enabled` is
    // configured, only issues carrying at least one of the listed labels
    // become Tasks; an empty list disables the filter entirely.
    const allowedLabels = vscode.workspace
      .getConfiguration('tackle')
      .get<string[]>('labels.enabled', []);
    const filteredIssues = filterIssuesByLabels(
      issues.map((i) => ({ ...i, labels: i.labels ?? [] })),
      allowedLabels ?? [],
    );

    const tasks: UpsertTask[] = filteredIssues.map((issue) => ({
      external_id: String(issue.number),
      external_system: 'github' as const,
      title: issue.title,
      description: issue.body ?? '',
      external_status: issue.state,
      assignee: issue.assignee?.login ?? null,
    }));

    // Diff BEFORE upsertBatch overwrites local state, so we know which Tasks
    // changed and can dispatch events afterward. The bus is the canonical
    // writer for `external_status`; upsertBatch's write of the same column
    // is acceptable for first-time-seen issues only.
    const existing = await this.taskRepo.list();
    const events = computeExternalStatusEvents(
      existing,
      filteredIssues.map((i) => ({ external_id: String(i.number), state: i.state })),
    );

    await this.taskRepo.upsertBatch(tasks);

    if (this.eventBus) {
      for (const ev of events) {
        try {
          this.eventBus.dispatch(ev);
        } catch {
          // Audit/refresh failure must not break Sync.
        }
      }
    }

    // Phase Tracker discovery: for each Task that has a plans row, mirror its
    // sub-issues and detect its Plan Source. No-op if PlanDiscoveryDeps
    // weren't supplied at construction (kept optional so unit tests / older
    // call sites don't have to provide GH HTTP and fs deps).
    try {
      await this.applyPlanDiscovery();
    } catch {
      // A discovery failure shouldn't fail Sync; the next pass will retry.
    }

    return tasks.length;
  }

  /**
   * Resolve the first GitHub remote for the current workspace. Tries the
   * VS Code git extension first, then falls back to the `git` CLI. On
   * failure the returned `diagnostics` string explains what was tried and
   * why it failed — the caller surfaces this so the user doesn't have to
   * guess at the root cause (the old message "Is this a git repo with a
   * GitHub remote?" was unactionable when the real problem was, say, a
   * detached workspace folder or an SSH URL we didn't recognize).
   */
  /**
   * Strip any `user:token@` userinfo from a URL so it's safe to log. We
   * also cap length at 200 chars so a runaway remote URL can't blow out
   * an error toast. Exported for testing.
   */
  static redactRemoteUrl(url: string): string {
    const redacted = url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^@\s/]+@/i, '$1');
    return redacted.length > 200 ? redacted.slice(0, 197) + '...' : redacted;
  }

  /**
   * Public wrapper around the same remote resolution Sync uses. Returns
   * `null` when no GitHub remote can be resolved (rather than throwing) —
   * cross-cutting features like the Label Projector and sub-issues fetch
   * use this and silently no-op when GH isn't reachable.
   */
  async resolveRemote(): Promise<{ owner: string; repo: string } | null> {
    const { remote } = await this.getRemote();
    return remote;
  }

  private async getRemote(): Promise<{
    remote: { owner: string; repo: string } | null;
    diagnostics: string;
  }> {
    // 0) Explicit setting wins. When the workspace isn't a git repo (or uses
    //    a non-GitHub remote but the user still wants to sync against a
    //    specific GitHub repo), `tackle.github.repo` gives them a direct
    //    override — no git introspection required.
    const configured = vscode.workspace.getConfiguration('tackle').get<string>('github.repo');
    if (configured && configured.trim()) {
      const parsed = TaskService.parseOwnerRepo(configured.trim());
      if (parsed) return { remote: parsed, diagnostics: '' };
      return {
        remote: null,
        diagnostics: `tackle.github.repo is set to "${configured}" but must be in "owner/repo" form.`,
      };
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return { remote: null, diagnostics: 'No workspace folder is open.' };
    }
    const cwd = workspaceFolder.uri.fsPath;
    const notes: string[] = [];

    // 1) VS Code git extension API (handles in-memory state + UX niceties).
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (gitExtension) {
        if (!gitExtension.isActive) await gitExtension.activate();
        const git = gitExtension.exports.getAPI(1);
        const repos: Array<{
          state: { remotes: Array<{ name?: string; fetchUrl?: string; pushUrl?: string }> };
        }> = git.repositories ?? [];
        for (const repo of repos) {
          for (const r of repo.state.remotes ?? []) {
            const url = r.fetchUrl ?? r.pushUrl;
            if (!url) continue;
            const parsed = TaskService.parseGitRemote(url);
            if (parsed) return { remote: parsed, diagnostics: '' };
            notes.push(
              `git-ext remote ${r.name ?? '?'}=${TaskService.redactRemoteUrl(url)} did not match a GitHub URL`,
            );
          }
        }
        if (repos.length === 0) {
          notes.push('vscode.git reports no repositories (it may still be scanning)');
        }
      } else {
        notes.push('vscode.git extension not installed');
      }
    } catch (err) {
      notes.push(`vscode.git API threw: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 2) git CLI fallback. List every remote so we pick up `upstream`,
    //    `github`, or whatever the user named their GitHub remote.
    try {
      const remoteList = execFileSync('git', ['remote'], { cwd, encoding: 'utf-8' })
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (remoteList.length === 0) {
        notes.push(`git CLI: no remotes configured at ${cwd}`);
      }
      // Try `origin` first (most common), then the rest in declaration order.
      const ordered = remoteList.includes('origin')
        ? ['origin', ...remoteList.filter((r) => r !== 'origin')]
        : remoteList;
      for (const name of ordered) {
        try {
          const url = execFileSync('git', ['remote', 'get-url', name], {
            cwd,
            encoding: 'utf-8',
          }).trim();
          const parsed = TaskService.parseGitRemote(url);
          if (parsed) return { remote: parsed, diagnostics: '' };
          notes.push(
            `git CLI remote ${name}=${TaskService.redactRemoteUrl(url)} did not match a GitHub URL`,
          );
        } catch (err) {
          notes.push(
            `git CLI: \`git remote get-url ${name}\` failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      notes.push(
        `git CLI: \`git remote\` at ${cwd} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const suffix =
      ' Set `tackle.github.repo` (e.g. "owner/repo") in Settings to sync against an explicit repository.';
    return {
      remote: null,
      diagnostics: (notes.join('; ') || 'No diagnostics available.') + suffix,
    };
  }

  /** Accept "owner/repo", tolerating a trailing `.git` or slash. */
  static parseOwnerRepo(s: string): { owner: string; repo: string } | null {
    const m = s.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
    if (!m) return null;
    return { owner: m[1], repo: m[2] };
  }

  static parseGitRemote(remoteUrl: string): { owner: string; repo: string } | null {
    // Strip query strings / fragments that occasionally hitch a ride.
    const clean = remoteUrl.split(/[?#]/)[0].trim();

    const httpsMatch = clean.match(
      /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/,
    );
    if (httpsMatch) {
      return { owner: httpsMatch[1], repo: httpsMatch[2] };
    }

    const sshMatch = clean.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?\/?$/);
    if (sshMatch) {
      return { owner: sshMatch[1], repo: sshMatch[2] };
    }

    // git:// and ssh:// schemes.
    const altMatch = clean.match(
      /^(?:git|ssh):\/\/(?:[^@]+@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/,
    );
    if (altMatch) {
      return { owner: altMatch[1], repo: altMatch[2] };
    }

    return null;
  }
}
