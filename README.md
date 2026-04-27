# Tackle

**Task-scoped workspace manager for AI-assisted development.**

Tackle binds the windows a developer needs for a task — terminals, agent sessions, plans, reviews — into a single switchable workspace inside VS Code. When you change tasks, terminals reattach and the sidebar scopes so you're back where you left off. Session life is decoupled from session visibility: closing a VS Code terminal does not kill the underlying psmux session.

## Concepts at a glance

- **Task** — a unit of work synced from an external tracker (GitHub Issues today, ADO later). Every Session is scoped to a Task.
- **Session** — one psmux session rendered as one VS Code editor-area terminal tab. Has a *kind* (`plan`, `implement`, `review`, `debug`, `test`, `pilot`, `shell`), a lifecycle status, and an agent-readiness state.
- **Plan / Phase** *(future)* — a Task's decomposition into Phases, materialized as child issues in the external tracker. Plan Discovery reflects them locally on every Sync.
- **Pilot** *(future)* — a workspace-global agent session for triage, setup, and "talk to me about my project" interactions.
- **Event Bus** *(future)* — the single API surface for all status transitions on Tasks and Phases.

See [`CONTEXT.md`](./CONTEXT.md) for the full ubiquitous-language glossary.

## Repository layout

This is a Bun-managed monorepo (`packages/*`):

| Package              | Purpose                                                                 |
|----------------------|-------------------------------------------------------------------------|
| `@tackle/shared`     | Domain types, SQLite schema, event bus primitives — shared across surfaces. |
| `@tackle/cli`        | Standalone `tackle` CLI for reads and write-intent dispatch.           |
| `tackle` (extension) | The VS Code extension — the primary user surface.                      |
| `electron-app`       | Standalone Electron host (exploratory).                                |

Other top-level directories:

- `docs/adr/` — Architecture Decision Records.
- `plans/` — design docs and PRDs.
- `scripts/` — repo tooling.

## Getting started

Requires **Node ≥ 18** and **Bun**.

```bash
bun install
bun run typecheck
bun run test
```

### Common scripts

| Script                | What it does                                                          |
|-----------------------|-----------------------------------------------------------------------|
| `bun run typecheck`   | Typecheck `shared`, `cli`, and the extension.                         |
| `bun run typecheck:all` | Typecheck every package, including `electron-app`.                  |
| `bun run test`        | Run tests in `shared`, `cli`, extension.                              |
| `bun run test:all`    | Run every package's tests.                                            |
| `bun run lint`        | ESLint over all `packages/*/src`.                                     |
| `bun run lint:fix`    | ESLint with autofix.                                                  |
| `bun run format`      | Prettier write.                                                       |
| `bun run format:check`| Prettier check.                                                       |

### Running the extension

From `packages/extension/`, use the standard VS Code "Run Extension" launch configuration to open an Extension Development Host with Tackle loaded.

## Architecture notes

- **One psmux session per Tackle Session** (not per Task). Session life and visibility are independent: disposing the VS Code terminal does not kill the psmux session.
- **All status transitions flow through the Event Bus** *(future)*. Nothing writes status columns directly. Pure + cascade handlers run inside the events transaction; side-effecting handlers run after commit.
- **The CLI is a producer over IPC**, not a handler-runner. Writes are sent as typed intents over a Unix-domain socket (POSIX) or named pipe (Windows) to the extension dispatcher; reads open SQLite directly.
- **Plan-first workflow**: Tasks decompose into Phases as external child issues; Tackle never writes to the external tracker to create Phases — that's the planning skill's job (`/to-issues`).

For deeper rationale, see the ADRs under [`docs/adr/`](./docs/adr/).

## Status

Tackle is pre-MVP. Concepts marked *(future)* in `CONTEXT.md` are designed but not yet implemented.
