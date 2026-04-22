# Per-session psmux, not per-task

Each Tackle Session is backed by its own psmux session (one-to-one), rather than one psmux per Task with tmux windows per Phase. This matches what the code has always done; prior domain documentation described the per-task model, which was aspirational and never built.

## Considered options

- **Per-task psmux** — one psmux session per Task, tmux windows per Phase + ad-hoc. A single detach/attach flips the whole Task. Phase-to-window mapping is clean in theory. But it would require reworking the terminal orchestrator, the sidebar Session-Row lifecycle actions (Stop / Mark Done / Remove / Restart all target a *single* psmux session, not a window inside a shared one), and the worktree-per-session model (a shared psmux has one cwd).
- **Per-session psmux (chosen)** — one psmux session per Session. Task switches attach multiple psmux sessions in parallel. Per-session Stop / Restart / Mark Done / Remove are clean one-to-one operations. Worktree-per-session is natural because each psmux has its own cwd.

## Consequences

- Task-switch cost scales with session count (N psmux attaches + N VS Code terminal creates). Acceptable at the target scale of ~5–10 sessions per Task; measured psmux attach is ~50–100ms.
- The UI primitives built on top of Sessions (Session Row, Stop / Mark Done, Restart with `--resume`) compose cleanly with the one-to-one model.
- Phase-to-session mapping, if/when it is built, lives in the Tackle model (`Session.phase_id`), not in tmux topology. Phase-switch is a Sidebar-level scoping operation, not a tmux window-select.
