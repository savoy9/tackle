# Plan: Chartroom MVP (Revised)

> Source PRD: [plans/chartroom-design.md](./chartroom-design.md)
> Revision context: Domain modeling session refined identity, terminology, and architecture. See [CONTEXT.md](../CONTEXT.md) and [docs/adr/](../docs/adr/).

## What changed from the original MVP

| Area | Original MVP | Revised MVP | Why |
|------|-------------|-------------|-----|
| Identity | "Session & task management" | Task-scoped workspace manager | Core value is workspace switching, not session management |
| Terminal backend | node-pty spawning PTY processes directly | psmux session per task, panes within | Crash resilience, Claude Code agent team integration, instant task switching |
| Terminal rendering | One xterm.js per PTY, tab bar to switch | One xterm.js rendering active psmux window | psmux owns pane tiling; task switch = session swap |
| Session model | All sessions identical | Agent Session vs Terminal Tab | Different tracking needs — rich history vs utility |
| Phases | "Not in MVP" | MVP — core novel value | Plan-to-phase-to-session mapping is the one thing no existing tool provides |
| Review panel | "Deferred to post-MVP" | Basic version in MVP (markdown viewer) | Essential for task-scoped workspace — without it the right panel is empty |
| App.tsx | 609-line monolith | Extract into panel components | Required to support added complexity |
| node-pty | Direct dependency | Removed — psmux handles PTY | psmux manages terminal processes; Chartroom connects via tmux API |

## Architectural decisions

Durable decisions that apply across all phases:

- **Monorepo**: pnpm workspaces with `packages/electron-app`, `packages/cli`, `packages/shared`
- **Electron**: Electron Forge + electron-vite (ADR-0004: VS Code/Monaco ecosystem affinity)
- **Frontend**: React + TypeScript, shadcn/ui + Radix primitives
- **Database**: SQLite via better-sqlite3 in Electron main process (ADR-0002: remote-ready schema)
- **IPC**: Electron contextBridge + ipcMain/ipcRenderer for main ↔ renderer communication
- **Terminal**: psmux session per task, tmux windows per phase, xterm.js renders active window (ADR-0003)
- **External sync**: GitHub Issues first (@octokit/rest), ADO second (future)
- **Scope**: Single git repository per Chartroom instance (ADR-0001)
- **Agent interface**: CLI (`cr`) + skill.md + hooks — no MCP server
- **Panel layout**: 3 resizable panels — Task (left), Terminal (center), Review (right, collapsible)

---

## Phase 1: Component extraction and schema update

**Goal**: Refactor the existing monolith into the component structure needed for the remaining phases, and update the DB schema to match the revised domain model.

### What to build

Extract `App.tsx` (493 lines) into panel components: `TaskPanel.tsx`, `TerminalPanel.tsx`, `ReviewPanel.tsx`, plus shared components (`PanelHeader`, `Divider`). Update the SQLite schema to add the `phases` and `plans` tables and add `kind` and `phase_id` fields to `sessions`. Update shared types to match.

### Acceptance criteria

- [ ] `App.tsx` is a thin layout shell that composes `TaskPanel`, `TerminalPanel`, `ReviewPanel`
- [ ] Each panel component is in `src/renderer/panels/`
- [ ] Shared UI components (`PanelHeader`, `Divider`, `TaskList`, `TaskDetail`) are in `src/renderer/components/`
- [ ] SQLite schema includes `plans` table (id, task_id, source_path, extracted_at)
- [ ] SQLite schema includes `phases` table (id, plan_id, task_id, name, description, status, sort_order)
- [ ] `sessions` table adds `kind` field (`agent` | `terminal`) defaulting to `agent`
- [ ] `sessions` table adds `phase_id` field (nullable FK to phases)
- [ ] Shared types updated: `Plan`, `Phase`, `Session.kind`, `Session.phase_id`
- [ ] Existing functionality unchanged — app still launches, tasks display, sessions create
- [ ] All existing tests pass

### Files to create/modify

| Action | File | Notes |
|--------|------|-------|
| Create | `src/renderer/panels/TaskPanel.tsx` | Extract from App.tsx |
| Create | `src/renderer/panels/TerminalPanel.tsx` | Extract from App.tsx |
| Create | `src/renderer/panels/ReviewPanel.tsx` | Extract from App.tsx |
| Create | `src/renderer/components/PanelHeader.tsx` | Extract from App.tsx |
| Create | `src/renderer/components/Divider.tsx` | Extract from App.tsx |
| Create | `src/renderer/components/TaskList.tsx` | Extract from App.tsx |
| Create | `src/renderer/components/TaskDetail.tsx` | Extract from App.tsx |
| Modify | `src/renderer/App.tsx` | Thin shell composing panels |
| Modify | `src/main/db.ts` | Add plans, phases tables; alter sessions |
| Modify | `packages/shared/src/index.ts` | Add Plan, Phase types; update Session |

---

## Phase 2: psmux terminal backend

**Goal**: Replace node-pty with psmux as the terminal backend. One psmux session per task, xterm.js renders the active psmux window.

### Prerequisites

- psmux installed (`winget install psmux`)
- Phase 1 complete (component extraction)

### What to build

Rewrite `terminal-manager.ts` as `psmux-manager.ts` — a client that creates/manages psmux sessions via the tmux CLI API. When a task is selected, attach to its psmux session. When a new agent session or terminal tab is created, add a pane to the task's psmux session. Connect xterm.js to the attached psmux session's output. Remove the node-pty dependency.

### Acceptance criteria

- [ ] Selecting a task creates (or attaches to) a psmux session named `chartroom-{task_id}`
- [ ] "New Agent Session" creates a psmux pane running the agent command (e.g., `claude`)
- [ ] "New Terminal Tab" creates a psmux pane running the default shell
- [ ] xterm.js in the terminal panel renders the active psmux window's output
- [ ] Terminal input from xterm.js is sent to the active psmux pane
- [ ] Terminal handles resize when the panel is resized
- [ ] Switching tasks detaches from current psmux session and attaches to the target task's session
- [ ] Closing Electron does NOT kill psmux sessions (verified: reopen app, sessions still running)
- [ ] Reopening the app reconnects to existing psmux sessions for known tasks
- [ ] node-pty dependency removed from package.json

### Key technical decisions

- **psmux CLI interface**: Use `child_process.execSync`/`spawn` to call `psmux` (aliased as `tmux`) for session management commands (new-session, attach-session, split-window, send-keys, list-panes)
- **xterm.js attachment**: Pipe psmux output to xterm.js via a PTY connection to the psmux client process (psmux's `attach-session` command produces a PTY stream)
- **Session naming**: `chartroom-{task_external_system}-{task_external_id}` for globally unique, human-readable session names

### Files to create/modify

| Action | File | Notes |
|--------|------|-------|
| Create | `src/main/psmux-manager.ts` | psmux CLI wrapper — create/attach/detach sessions, create panes |
| Delete | `src/main/terminal-manager.ts` | Replaced by psmux-manager |
| Modify | `src/main/session-manager.ts` | Use psmux-manager instead of terminal-manager |
| Modify | `src/main/ipc-handlers.ts` | Update terminal handlers for psmux model |
| Modify | `src/main/index.ts` | Initialize psmux-manager, wire up task switching |
| Modify | `src/renderer/panels/TerminalPanel.tsx` | Connect xterm.js to psmux output stream |
| Modify | `src/preload/preload.ts` | Update terminal API for attach/detach model |
| Modify | `package.json` | Remove node-pty, add no new deps (psmux is a system binary) |

---

## Phase 3: Task-scoped workspace switching

**Goal**: Make task selection feel like a workspace switch — terminal panel swaps psmux sessions, session list filters, everything scopes to the selected task.

### What to build

When the user clicks a task in the task panel, Chartroom: (1) detaches from the current psmux session, (2) attaches to the target task's psmux session, (3) updates the terminal tab bar to show that task's sessions, (4) updates the review panel to show that task's files. The transition should feel instant. Persist the "last selected task" so the app restores state on relaunch.

### Acceptance criteria

- [ ] Clicking a task swaps the terminal panel to that task's psmux session within <200ms perceived
- [ ] The session tab bar updates to show only the selected task's sessions
- [ ] The review panel header updates to reflect the selected task
- [ ] A "no task selected" state shows a welcome/onboarding view
- [ ] The previously selected task is remembered across app restarts
- [ ] Creating a session while a task is selected auto-associates it with that task
- [ ] Sessions without a task ("unassociated") are accessible via a global view or filter

### Files to modify

| Action | File | Notes |
|--------|------|-------|
| Modify | `src/renderer/panels/TaskPanel.tsx` | Task selection triggers workspace switch |
| Modify | `src/renderer/panels/TerminalPanel.tsx` | Responds to task switch — re-attaches psmux |
| Modify | `src/renderer/panels/ReviewPanel.tsx` | Responds to task switch — scopes content |
| Modify | `src/renderer/App.tsx` | Workspace switch coordination, state persistence |
| Modify | `src/main/psmux-manager.ts` | Detach/attach API for task switching |
| Modify | `src/main/ipc-handlers.ts` | Add workspace switch handler |

---

## Phase 4: Plan extraction and phase visualization

**Goal**: Parse a plan markdown file into phases, store them in the DB, and render a phase timeline in the task panel.

### What to build

Add a "Link Plan" action to a task that associates a plan markdown file (from `./plans/` or any path). Build a plan parser that extracts phases — first via template recognition (detect `### Phase N:` or `## Slice N:` patterns with step tables), falling back to an agent extraction prompt. Store extracted phases in the `phases` table. Render a phase timeline in the task panel under the selected task: vertical list of phases with status badges (pending, in_progress, done). Clicking a phase filters the session list and terminal tabs to that phase.

### Acceptance criteria

- [ ] A "Link Plan" button on the task detail view lets the user select a plan markdown file
- [ ] The plan file path is stored in the `plans` table linked to the task
- [ ] Template recognition extracts phases from plans using `### Phase N:` or `## Slice N:` heading patterns
- [ ] Extracted phases are stored in the `phases` table with name, description, status, sort_order
- [ ] If template recognition finds no phases, a prompt is shown to run agent extraction (future — stub for MVP)
- [ ] The task panel shows a phase timeline below the task detail: vertical list with status badges
- [ ] Phase status can be manually updated (pending → in_progress → done) via click
- [ ] Clicking a phase filters the terminal tab bar to sessions associated with that phase
- [ ] Clicking "All" (or deselecting a phase) shows all sessions for the task
- [ ] When creating a new session with a phase selected, the session is auto-associated with that phase

### Files to create/modify

| Action | File | Notes |
|--------|------|-------|
| Create | `src/main/plan-parser.ts` | Template recognition: extract phases from plan markdown |
| Create | `src/main/plan-repository.ts` | CRUD for plans table |
| Create | `src/main/phase-repository.ts` | CRUD for phases table |
| Create | `src/renderer/components/PlanTimeline.tsx` | Phase timeline visualization |
| Modify | `src/renderer/components/TaskDetail.tsx` | Add "Link Plan" action, embed PlanTimeline |
| Modify | `src/renderer/panels/TerminalPanel.tsx` | Filter sessions by selected phase |
| Modify | `src/main/ipc-handlers.ts` | Add plan/phase handlers |
| Modify | `src/preload/preload.ts` | Expose plan/phase API |

---

## Phase 5: Phase-scoped psmux windows

**Goal**: Map phases to tmux windows within the task's psmux session. Selecting a phase switches the tmux window. Each phase can have its own git worktree.

### What to build

When a phase is created (from plan extraction), create a tmux window in the task's psmux session named after the phase. Sessions created within a phase are panes in that phase's tmux window. A task-level tmux window ("overview" or "pilot") holds task-scoped sessions not tied to any phase. Switching phases in the UI switches the active tmux window. Optionally create a git worktree for the phase.

### Acceptance criteria

- [ ] Each phase has a corresponding tmux window in the task's psmux session
- [ ] A task-level "overview" tmux window exists for un-phased sessions (pilot, ad-hoc)
- [ ] Creating a session within a phase adds a pane to that phase's tmux window
- [ ] Clicking a phase in the timeline switches the terminal panel to that phase's tmux window
- [ ] Clicking "All" switches to a view showing the overview window
- [ ] A "Create Worktree" action on a phase creates a git worktree branched from the task branch
- [ ] Sessions in a phase with a worktree have their psmux pane CWD set to the worktree path
- [ ] Phase tmux windows are named: `{phase_sort_order}-{phase_name_slug}`
- [ ] The psmux session survives app crashes — phase window layout is preserved

### Files to create/modify

| Action | File | Notes |
|--------|------|-------|
| Create | `src/main/git-manager.ts` | Git worktree create/list/remove |
| Modify | `src/main/psmux-manager.ts` | Create named tmux windows per phase, switch windows |
| Modify | `src/main/session-manager.ts` | Associate pane creation with phase's tmux window |
| Modify | `src/main/phase-repository.ts` | Add worktree_path field |
| Modify | `src/renderer/components/PlanTimeline.tsx` | Phase click triggers window switch + "Create Worktree" action |
| Modify | `src/main/ipc-handlers.ts` | Add worktree handlers |

---

## Phase 6: Review panel (Monaco markdown + file browser)

**Goal**: Bring the review panel to life with a task-scoped file viewer powered by Monaco.

### What to build

Integrate Monaco Editor into the review panel. When a task is selected, the review panel shows a file browser scoped to the task's worktree (or the repo root if no worktree). Plans are openable in a markdown preview/edit mode. Files can be viewed and edited. When a phase with a worktree is selected, the file browser scopes to that worktree. Add a diff view mode for comparing the phase worktree against the task branch.

### Acceptance criteria

- [ ] Monaco Editor loads in the review panel
- [ ] A file browser sidebar (collapsible) shows files from the current scope (repo root, task branch, or phase worktree)
- [ ] Clicking a file opens it in Monaco (read/write for text files)
- [ ] Plan markdown files render with syntax highlighting; a preview toggle shows rendered markdown
- [ ] When a task is selected, the file browser scopes to the relevant directory
- [ ] When a phase with a worktree is selected, the file browser scopes to that worktree
- [ ] A "Diff" mode tab compares the current worktree against the base branch
- [ ] The plan file linked to the current task is pinned/prominent in the file browser
- [ ] Review panel state (open file, scroll position) is preserved per task when switching tasks

### Files to create/modify

| Action | File | Notes |
|--------|------|-------|
| Create | `src/renderer/components/MonacoEditor.tsx` | Monaco wrapper component |
| Create | `src/renderer/components/FileBrowser.tsx` | Worktree-scoped file tree |
| Create | `src/renderer/components/MarkdownPreview.tsx` | Markdown preview component |
| Create | `src/renderer/components/DiffViewer.tsx` | Monaco diff viewer wrapper |
| Modify | `src/renderer/panels/ReviewPanel.tsx` | Compose editor, file browser, diff viewer |
| Modify | `src/main/ipc-handlers.ts` | File read/write/list handlers |
| Modify | `src/preload/preload.ts` | Expose file system API |
| Add dep | `monaco-editor` | VS Code's editor component |

---

## Phase 7: Session Loop (guided build → review → test)

**Goal**: Implement the guided session loop within a phase — Chartroom suggests the next step and can auto-trigger via prompt-on-event.

### What to build

When an agent session in a phase completes, Chartroom suggests the next step in the build → review → test loop. The suggestion appears as a prompt in the UI ("Build session completed. Start review session?"). The user can accept (one-click spawn), skip, or do something else. Add a prompt-on-event mechanism: optionally, the next session auto-spawns when the previous completes. Session completion is detected by monitoring the psmux pane's exit status.

### Acceptance criteria

- [ ] When an agent session completes, a suggestion banner appears: "Start [next step] session?"
- [ ] Accepting the suggestion spawns a new agent session in the same phase with an appropriate prompt template
- [ ] The session loop progression is: build → review → test (configurable per-phase in future)
- [ ] The phase status auto-updates based on session loop progress (pending → in_progress → done when test passes)
- [ ] A prompt-on-event toggle (per phase) enables auto-spawn of the next session
- [ ] Session completion is detected by monitoring psmux pane exit (the agent process exits)
- [ ] Ad-hoc sessions can be spawned at any point without disrupting the loop
- [ ] The plan timeline reflects loop progress (icons or badges for build/review/test status per phase)

### Files to create/modify

| Action | File | Notes |
|--------|------|-------|
| Create | `src/main/session-loop.ts` | Loop logic: what comes next, auto-spawn |
| Create | `src/main/prompt-templates.ts` | Default prompts for build/review/test sessions |
| Create | `src/renderer/components/SessionSuggestion.tsx` | Suggestion banner component |
| Modify | `src/main/psmux-manager.ts` | Monitor pane exit events |
| Modify | `src/main/session-manager.ts` | Integrate session-loop for next-step logic |
| Modify | `src/renderer/panels/TerminalPanel.tsx` | Show suggestion banner |
| Modify | `src/renderer/components/PlanTimeline.tsx` | Show build/review/test badges per phase |

---

## Summary: What's preserved from the original MVP

| Original Phase | Status | Notes |
|----------------|--------|-------|
| Phase 1: Scaffold + empty shell | ✅ Complete | Keep as-is |
| Phase 2: SQLite + task list | ✅ Complete | Schema gets updated in new Phase 1 |
| Phase 3: GitHub Issues sync | ✅ Complete | Keep as-is |
| Phase 4: Terminal in a panel | ⚠️ Rework | Replace node-pty with psmux (new Phase 2) |
| Phase 5: Agent session lifecycle | ⚠️ Rework | Adapt for psmux pane model (new Phase 2-3) |
| Phase 6: Tasks + sessions linked | ⚠️ Rework | Becomes workspace switching (new Phase 3) |

All existing working code (task list, GitHub sync, IPC bridge, DB layer, panel layout) is preserved. The rework focuses on the terminal layer (node-pty → psmux) and adding the missing novel features (phases, plan visualization, review panel).
