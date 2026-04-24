# One git worktree per Task; Sessions share it unless the user opts into α-isolation

Each Task with a running Agent gets a dedicated git worktree on a Task-owned branch. Additional Sessions on the same Task reuse that worktree by default. A per-Session α-isolation toggle spawns a parallel sub-worktree branched off the Task's branch for users who want sibling Sessions to work in physical isolation.

## Considered options

- **No worktrees; everyone shares the main checkout** — simplest, but concurrent Agents on different Tasks stomp on each other's working tree and HEAD.
- **Worktree per Session** — maximal isolation, but makes the common case (plan + implement + review on one Task) pay for N checkouts and N branch names when the user wanted one feature branch.
- **Worktree per Task, optional α-isolation per Session (chosen)** — matches the user's mental model: a Task is a unit of work, Sessions are lenses onto it. Parallel agents-on-the-same-task that genuinely need isolation opt in; the default keeps siblings in sync.

## Decision

- `WorktreeProvisioner.ensureWorktreeForTask(task)` is the single entry point. It's idempotent: subsequent calls return the stored `worktree_path` / `worktree_branch` / `worktree_base_branch` without touching disk.
- Provisioning is **lazy**: triggered on the first Session spawn for a Task via `SessionWorktreeProvider.ensureForTask`, not on Task sync. Tasks you never start have no on-disk footprint.
- Resolution ladder, in order:
  1. Task row already has a valid worktree on disk → return it.
  2. Row points at a missing directory → `git worktree prune` + re-add at the same path / branch (silent recovery, no prompt).
  3. Workspace is itself a worktree → reuse; skip nested creation.
  4. Exactly one local branch name contains the Task's `external_id` (case-insensitive) → reuse that branch in a new worktree. Two or more matches is ambiguous → fall through to step 5 with a log line.
  5. Create `<external-id>-<slug>` off `baseBranch`; on collision, fall back to `tackle/<external-id>`.
- Worktree location: `../{repoName}.worktrees/<branch-safe-dir>` by default (idiomatic git sibling layout). Both `baseBranch` and `rootPath` are overridable via `tackle.worktree.baseBranch` and `tackle.worktree.rootPath` (the latter accepts a `{repoName}` placeholder). Settings are read on every provision call so live changes take effect without reconstructing the provisioner.
- α-isolation: `createIsolatedWorktree(task, sessionRef)` branches a `<taskBranch>-<sessionRef>` sub-worktree from the Task's branch. The caller stores the path on `Session.worktree_path`; the Task row is untouched. Offered in the New Session QuickPick only when the Task already has a worktree and the kind is Agent-launching.
- Cleanup policy: Stop / Mark Done / external terminal close → the worktree persists. Only `tackle.removeTask` triggers `TaskRemover`, which inspects cleanliness (porcelain status + commits-ahead-of-base), picks a safe default for the confirmation, and only runs `git worktree remove` when the user confirms.

## Consequences

- The common case (several Sessions per Task) stays in one working tree — plan, implement, and review see each other's edits without merging.
- The provisioner never inspects, asserts, or mutates the contents of an existing worktree. A dirty tree or a manually-checked-out branch is preserved as-is.
- Non-git workspaces are hard-failed at provision time with a clear error rather than letting partial state land in the DB.
- α-isolation sub-branches accumulate if users lean on it heavily; they're removed only via explicit `git` cleanup today. A future "clean α sub-worktrees" command can scan for `<taskBranch>-*` siblings.
- The `{repoName}` expansion sanitizes directory segments but does not quote the resulting path when handed to shell commands. Callers that shell-interpolate (e.g. `psmux.sendKeys`) must quote the cwd themselves.
