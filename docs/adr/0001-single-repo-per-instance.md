# Single repository per Chartroom instance

Chartroom is scoped to one git repository per instance. Multi-repo/multi-root workspaces are explicitly deferred. The git worktree model, task-scoped workspace switching, and file panel scoping all assume a single repo root. Both Claude Code and VS Code have known limitations in multi-root mode, and we don't want those trade-offs to constrain the single-repo DX, which is the primary use case.
