# Tackle

A task-scoped workspace manager for AI-assisted development, delivered as a VS Code extension. Tackle binds all the windows a developer needs for a task — terminals, agent sessions, plans, reviews — into a single switchable workspace inside VS Code. When you change tasks, everything rearranges: terminals reattach, the layout restores, the review panel scopes, and you're back exactly where you left off. The core value is making task-switching instant and total — session life and session visibility are decoupled.

## Language

### Work structure

**Task**:
A unit of work synced from an external tracking system (GitHub Issues, ADO Work Items). The anchor for a workspace — selecting a task scopes all panel contents and triggers a full layout restore. Every task must exist in the external system; Tackle does not originate tasks.
_Avoid_: ticket, item, story

**Plan**:
A structured breakdown of a Task into Phases, produced by a planning session. The plan markdown file is the source of truth for content. Tackle extracts phases into a normalized internal format for progress tracking — either via template recognition (token-free, for known patterns) or agent extraction (a silent `-p` agent call, for non-standard formats).
_Avoid_: roadmap, backlog

**Phase**:
A unit of work within a Plan. Each Phase may have its own git worktree, agent sessions, and a guided build-review-test loop. Phases live in Tackle. In future versions, a Phase may also be promoted to an external work item.
_Avoid_: step, stage, sprint, milestone

### Sessions and terminals

**Agent Session**:
A chat session in an AI developer tool (e.g., Claude Code) running in a psmux-backed terminal in the editor area. Has rich conversational history, structured output, and trackable artifacts. The primary unit of work execution. Survives VS Code restarts via psmux.
_Avoid_: conversation, chat, run

**Terminal Tab**:
A non-agent terminal process (dev servers, build watchers, test runners). Displayed alongside Agent Sessions as editor-area tabs. Also psmux-backed — survives VS Code restarts and task switches. Not tracked with the same richness as Agent Sessions — no conversation history or structured output.
_Avoid_: shell, console

**psmux Session**:
A psmux (Windows tmux) session backing a single terminal tab. Session life is decoupled from visibility — disposing the VS Code terminal does not kill the psmux session. Task switching disposes terminal UI objects and reattaches the target task's psmux sessions. This makes task switching near-instant (tmux attach is ~50-100ms) while preserving all running processes.
_Avoid_: terminal session, PTY session

**Pilot**:
A long-lived conversational Agent Session scoped to a Task. Used for thinking, triaging, and organizing — not executing. Pinned across phase switches (only disposed on task switch). If a Task is simple enough for a single session, that session is the Pilot.
_Avoid_: controller, supervisor, orchestrator

### Workflow

**Session Loop**:
The guided progression within a Phase: build, review, test. Tackle suggests the next step when the previous one completes, and can trigger steps automatically via prompt-on-event. The developer can skip steps, reorder, or spawn ad-hoc sessions. Not a rigid state machine.
_Avoid_: pipeline, workflow engine, CI

**Prompt-on-Event**:
The automation mechanism. When a session completes or a phase transitions, Tackle can automatically start the next Agent Session with an appropriate prompt. Simple and declarative — not a general-purpose workflow engine.
_Avoid_: automation rule, event handler, trigger

### UI structure

**Tackle Mode**:
An explicit, toggled state of the VS Code window. Activated via `Tackle: Activate`, deactivated via `Tackle: Deactivate`. On activation, Tackle saves the user's current VS Code settings, applies the Tackle layout (hide bottom panel, set editor groups, show Activity Bar views), and begins managing the workspace. On deactivation, original settings are restored. Tackle Mode is the boundary — nothing happens outside it.
_Avoid_: workspace, profile

**Tackle Activity Bar**:
A custom Activity Bar entry on the left side. Contains TreeViews for Tasks, Plan/Phases, and Sessions. This is the primary navigation surface — the left edge of the screen. The stock VS Code Explorer remains accessible via its own Activity Bar icon but is secondary during Tackle Mode.
_Avoid_: sidebar, nav panel

**Editor Group 1 (Terminal Zone)**:
The left/primary editor group. Contains all terminal tabs (Agent Sessions and Terminal Tabs) for the active task, opened via `TerminalLocation.Editor`. May be split into a grid (e.g., agent session left, dev server right). The terminal zone is where the developer spends most of their time.
_Avoid_: terminal panel, center panel

**Editor Group 2 (Review Zone)**:
The right editor group. Contains code files, diffs, plan documents — anything opened from the Review File Tree. Files route here via `viewColumn: ViewColumn.Two`, ensuring they never land in the terminal zone. Collapsible by closing the editor group.
_Avoid_: editor panel, code panel

**Review File Tree**:
A custom TreeView in the Auxiliary Bar (far right edge). Shows files relevant to the active task/phase: changed files from git diff, plan documents, test files. Clicking a file opens it in the Review Zone (Editor Group 2). This is not a general-purpose file explorer — it is a scoped, purpose-built navigation tree for review.
_Avoid_: explorer, file browser

**Layout State**:
A snapshot of the full visual arrangement for a task, persisted in SQLite. Includes the editor group grid shape, terminal placements within that grid, review files open in Editor Group 2, and the focused terminal. Task switching restores the complete layout state — the experience is like switching desktops.
_Avoid_: workspace state, window state

### Agent integration

**CLI (`tackle`)**:
A standalone Node.js CLI that reads/writes the same SQLite DB as the VS Code extension. The primary interface for agents to communicate back to Tackle — reporting completion, providing summaries, transitioning phases. Surfaced to agents via CLAUDE.md standing orders. Bundled with the extension installation (single install step).
_Avoid_: API, SDK

**Session State File (`session_state.md`)**:
A markdown briefing packet generated by the extension and placed in the session's worktree at session creation time. Contains task context, phase goal, prior session summaries, and relevant file lists. Read once by the agent at session start. Disposable — lives only in the worktree.
_Avoid_: prompt, context file

**Standing Orders (CLAUDE.md injection)**:
A small, delimited block appended to the worktree's CLAUDE.md by the extension. Contains persistent behavioral rules: "run `tackle session complete` when done", "run `tackle phase update` after tests pass." These are re-read by Claude Code throughout the session, unlike the session state file which is consumed once. Delimited with `<!-- TACKLE:BEGIN -->` / `<!-- TACKLE:END -->` markers for safe update without touching user content.
_Avoid_: hooks, rules

### Naming

**Tab Label**:
The human-readable name shown on a terminal's editor tab. Format: `{taskId}-{taskSlug}|{kind}{N}-{label}`. Examples: `2435-BuildADOIntegration|Plan`, `2356-PhaseTracking|Impl4-SummarizeAgent`, `2435-BuildADOIntegration|Shell1`. Auto-generated from the plan structure (phase names map to session labels). The task slug is derived from the task title.
_Avoid_: terminal name, session name

**psmux Name**:
The machine-readable tmux session identifier. Format: `tackle-{source}-{taskId}-{kind}{N}`. Examples: `tackle-gh-2435-plan`, `tackle-gh-2356-impl4`. Alphanumeric + hyphens only (valid tmux identifier). Used for `tmux attach -t`. Deterministic — the same session always gets the same psmux name.
_Avoid_: session ID, terminal ID

## Relationships

- A **Task** is always backed by exactly one external work item (GitHub Issue or ADO Work Item)
- A **Task** has at most one **Plan**
- A **Task** has at most one **Pilot** (an Agent Session with a distinguished role)
- A **Task** has exactly one **Layout State** (saved on task switch, restored on task select)
- A **Task** has zero or more **Agent Sessions** and zero or more **Terminal Tabs**
- A **Plan** contains one or more **Phases** in sequence
- A **Phase** has zero or more **Agent Sessions** and zero or more **Terminal Tabs**
- A **Phase** may have its own git worktree (created by the extension on first impl session)
- Every **Agent Session** and **Terminal Tab** is backed by exactly one **psmux Session**
- Every **Agent Session** and **Terminal Tab** is rendered as a VS Code terminal in **Editor Group 1** (the Terminal Zone) via `TerminalLocation.Editor`
- The **Review File Tree** (Auxiliary Bar, far right) routes file opens to **Editor Group 2** (the Review Zone)
- **Phase selection** scopes the **Review File Tree** and highlights the **Plan TreeView**; it does not alter terminal tabs
- **Task selection** triggers a full workspace swap: dispose all terminal UI, restore target task's **Layout State**, reattach psmux sessions, refresh all TreeViews
- The **CLI (`tackle`)** and the **VS Code extension** are peers — both read/write the same SQLite DB via the repository interfaces
- **Authentication** for GitHub and ADO uses `vscode.authentication` — the user's existing VS Code sign-in, no separate tokens
- The **Session State File** is written by the extension into the worktree at session creation; the **Standing Orders** are appended to the worktree's CLAUDE.md
- The **Pilot** is pinned: it survives phase switches but is disposed on task switch (its psmux session stays alive)

## Layout

```
┌───────────┬─────────────────────────┬───────────────┬─────────┐
│  Tackle   │  Editor Group 1         │  Editor       │  Aux    │
│  Activity │  (Terminal Zone)        │  Group 2      │  Bar    │
│  Bar      │                         │  (Review Zone)│         │
│           │  ┌──────────┬─────────┐ │               │ Review  │
│  Tasks    │  │ [Pilot]  │[Impl2] │ │  auth.ts      │ File    │
│  ──────── │  │          │         │ │  plan.md      │ Tree    │
│  Plan     │  │ claude   │ claude  │ │               │         │
│  ──────── │  │ code     │ code    │ │  (Monaco      │ Modifed │
│  Sessions │  │ session  │ session │ │   editor,     │ ├ auth/ │
│           │  │          │         │ │   diffs,      │ ├ cfg/  │
│           │  │          │         │ │   markdown)   │ Plan    │
│           │  │          │         │ │               │ └ plan  │
│           │  └──────────┴─────────┘ │               │         │
├───────────┴─────────────────────────┴───────────────┴─────────┤
│  Status Bar (no Tackle items — avoided due to clutter)        │
└───────────────────────────────────────────────────────────────┘
```

## Typical workflow

1. Dev opens VS Code in a repo, runs `Tackle: Activate` — layout snaps into place
2. Tackle syncs tasks from GitHub/ADO via `vscode.authentication`
3. Dev selects a Task from the Task TreeView — psmux sessions reattach, layout restores, terminal tabs appear in the editor area
4. Dev runs a planning session (optional) → plan markdown produced
5. Tackle parses the plan into Phases (template recognition or silent agent call)
6. For each Phase: Session Loop (build → review → test), guided by Tackle, automated via prompt-on-event where desired
7. Ad-hoc sessions spawned as needed — appear as new terminal tabs in the editor area
8. Dev switches tasks — terminal UI disposes instantly, target task's layout restores with all psmux sessions reattached, review files reopen. Everything is exactly as they left it.
9. Dev runs `Tackle: Deactivate` — original VS Code layout and settings restored

## Example dialogue

> **Dev:** "I just activated Tackle and selected a task. What do I see?"
> **Domain expert:** "The terminal zone shows the Pilot session for that task. The Task TreeView highlights the active task. The Plan TreeView is empty until you run a planning session."
>
> **Dev:** "I ran a planning session and got a plan with three phases. Now what?"
> **Domain expert:** "The Plan TreeView shows three phases. Click one to scope the review file tree to that phase's files. Start an impl session — Tackle creates a git worktree and opens a new terminal tab in the editor area: `2435-BuildADO|Impl1-AuthMiddleware`."
>
> **Dev:** "I need to switch to a different task to check something."
> **Domain expert:** "Click the other task. All terminal tabs dispose, the other task's layout restores — same grid shape, same sessions, same focused terminal. Your first task's psmux sessions keep running in the background. Switch back anytime."
>
> **Dev:** "I want to see the code changes from this implementation session."
> **Domain expert:** "Click a file in the Review File Tree on the far right. It opens in the Review Zone (Editor Group 2) — the right editor column. Your terminal stays undisturbed on the left."
>
> **Dev:** "I'm done for the day. What do I do?"
> **Domain expert:** "Close VS Code. All psmux sessions survive. Tomorrow, open VS Code, activate Tackle, select the task — everything reattaches exactly where you left it."

## Flagged ambiguities

- **"session"** — used for both Agent Sessions (tracked, rich history) and Terminal Tabs (utility, minimal tracking). Both are psmux-backed and appear as editor tabs. The distinction is in tracking richness, not in UI treatment.
- **"workspace"** — VS Code uses this term for the open folder(s). Tackle uses it informally to mean "the UI state when a task is selected." No `TackleWorkspace` entity exists — it's the implicit combination of Layout State + active terminals + scoped TreeViews.
- **Multi-root workspaces** — Tackle requires a single-root workspace. Users with multi-root setups open a separate VS Code window for Tackle work. This is a deliberate constraint, not a limitation to fix later.
- **Terminal zone grid restoration** — the extension tracks which editor group index each terminal belongs to, but VS Code doesn't guarantee group indices are stable across `setEditorLayout` calls. The extension must set the layout first, then place terminals, in a deterministic order.
- **psmux dependency** — Tackle requires psmux (Windows) or tmux (macOS/Linux) installed. The extension should check on activation and provide install guidance if missing.
- **Review Zone vs. stock editor** — if a user opens a file from the stock Explorer (left side), it lands in whatever editor group is focused — possibly the terminal zone. This is a VS Code behavior Tackle can't override. The review file tree exists specifically to route files correctly.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    Tackle (VS Code Extension)                   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Extension Host (Node.js)                                │   │
│  │                                                          │   │
│  │  ┌─────────────┐  ┌───────────────┐  ┌───────────────┐  │   │
│  │  │ ModeManager │  │ ScopeManager  │  │ LayoutManager │  │   │
│  │  │             │  │               │  │               │  │   │
│  │  │ activate()  │  │ activeTask    │  │ save/restore  │  │   │
│  │  │ deactivate()│  │ activePhase   │  │ layout state  │  │   │
│  │  │ save/restore│  │ onTaskChange  │  │ setEditorLay  │  │   │
│  │  │ settings    │  │ onPhaseChange │  │ out + place   │  │   │
│  │  └─────────────┘  └───────┬───────┘  └───────────────┘  │   │
│  │                           │                               │   │
│  │         ┌─────────────────┼─────────────────┐             │   │
│  │         │                 │                 │             │   │
│  │  ┌──────┴──────┐  ┌──────┴──────┐  ┌───────┴───────┐    │   │
│  │  │  Terminal   │  │    Task     │  │   Review      │    │   │
│  │  │ Orchestrator│  │   Service   │  │   Service     │    │   │
│  │  │             │  │             │  │               │    │   │
│  │  │ create/     │  │ CRUD        │  │ git diff      │    │   │
│  │  │ dispose/    │  │ GitHub sync │  │ file tree     │    │   │
│  │  │ reattach    │  │ ADO sync    │  │ route to      │    │   │
│  │  │ terminals   │  │ auth via    │  │ Group 2       │    │   │
│  │  │ psmux bridge│  │ vscode.auth │  │               │    │   │
│  │  └─────────────┘  └─────────────┘  └───────────────┘    │   │
│  │                                                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐    │   │
│  │  │    Plan     │  │   Session   │  │   Context     │    │   │
│  │  │   Service   │  │   Service   │  │   Injector    │    │   │
│  │  │             │  │             │  │               │    │   │
│  │  │ parse plan  │  │ track agent │  │ write session │    │   │
│  │  │ extract     │  │ sessions    │  │ _state.md     │    │   │
│  │  │ phases      │  │ track terms │  │ append to     │    │   │
│  │  │ template or │  │ psmux names │  │ CLAUDE.md     │    │   │
│  │  │ agent call  │  │ tab labels  │  │ (delimited)   │    │   │
│  │  └─────────────┘  └─────────────┘  └───────────────┘    │   │
│  │                                                          │   │
│  │  ┌─────────────┐  ┌─────────────┐                       │   │
│  │  │  Worktree   │  │  Database   │                       │   │
│  │  │  Manager    │  │             │                       │   │
│  │  │             │  │ Repository  │                       │   │
│  │  │ git worktree│  │ interfaces  │                       │   │
│  │  │ add/remove  │  │ SQLite impl │                       │   │
│  │  │ per phase   │  │ (Postgres   │                       │   │
│  │  │             │  │  later)     │                       │   │
│  │  └─────────────┘  └──────┬──────┘                       │   │
│  │                          │                               │   │
│  └──────────────────────────┼───────────────────────────────┘   │
│                             │                                   │
│              ┌──────────────┼──────────────┐                    │
│              │              │              │                    │
│        ┌─────┴─────┐ ┌─────┴─────┐ ┌──────┴──────┐            │
│        │  TreeView  │ │  TreeView  │ │  TreeView   │            │
│        │  Tasks     │ │  Plan      │ │  Sessions   │            │
│        │ (Activity  │ │ (Activity  │ │ (Activity   │            │
│        │  Bar)      │ │  Bar)      │ │  Bar)       │            │
│        └────────────┘ └────────────┘ └─────────────┘            │
│                                                                 │
│        ┌────────────┐                                           │
│        │ TreeView   │  (Auxiliary Bar, far right)               │
│        │ Review     │                                           │
│        │ File Tree  │                                           │
│        └────────────┘                                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  .tackle/tackle.db (SQLite, WAL mode)                    │   │
│  │                                                          │   │
│  │  Shared with `tackle` CLI — both are peers               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  psmux / tmux                                            │   │
│  │                                                          │   │
│  │  All terminals backed by psmux sessions                  │   │
│  │  Sessions survive VS Code restarts and task switches     │   │
│  │  Naming: tackle-{source}-{taskId}-{kind}{N}              │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  tackle CLI (separate package, bundled with extension)          │
│                                                                 │
│  tackle task list | show | status                               │
│  tackle session list | complete | summary                       │
│  tackle phase list | update                                     │
│  tackle plan show                                               │
│                                                                 │
│  Reads/writes .tackle/tackle.db via same repository interfaces  │
│  Used by agents inside terminal sessions                        │
└─────────────────────────────────────────────────────────────────┘
```

## Data Model (SQLite)

```sql
-- Tasks (synced from external system)
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL,
  external_system TEXT NOT NULL,       -- 'github' or 'ado'
  title TEXT NOT NULL,
  description TEXT,
  status TEXT,
  assignee TEXT,
  synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Phases (parsed from planning output)
CREATE TABLE phases (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  plan_id TEXT REFERENCES plans(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',       -- pending, in_progress, done, failed
  sort_order INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Plans
CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  source_path TEXT,
  extracted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions (agent sessions and terminal tabs)
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  phase_id TEXT REFERENCES phases(id), -- NULL for task-level (pilot, ad-hoc)
  kind TEXT NOT NULL,                  -- plan, implement, review, debug, test, pilot, shell
  status TEXT DEFAULT 'pending',       -- pending, running, idle, completed, failed
  psmux_name TEXT NOT NULL,            -- tmux session identifier
  tab_label TEXT NOT NULL,             -- human-readable tab name
  agent TEXT,                          -- 'claude-code', 'copilot-cli', NULL for shells
  worktree_path TEXT,                  -- git worktree path, NULL for trunk sessions
  claude_session_id TEXT,              -- Claude Code session ID for --resume
  sort_order INTEGER,                  -- tab order within the task
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Layout state (one per task, saved on task switch)
CREATE TABLE layout_states (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id) UNIQUE,
  editor_layout JSON NOT NULL,         -- setEditorLayout descriptor
  terminal_placements JSON NOT NULL,   -- [{sessionId, groupIndex}]
  review_files JSON,                   -- [{uri, groupIndex}]
  focused_session_id TEXT,
  focused_group_index INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Session summaries
CREATE TABLE summaries (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  decisions JSON,
  artifacts JSON,
  open_questions JSON,
  files_changed JSON,
  next_steps JSON,
  raw_text TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events (for automation daemon)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES tasks(id),
  session_id TEXT REFERENCES sessions(id),
  event_type TEXT NOT NULL,
  payload JSON,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Interaction Flows

### Activate Tackle
```
User: Tackle: Activate
  → ModeManager.activate()
    → save current VS Code settings (terminal location, panel visibility, etc.)
    → apply Tackle settings:
        terminal.integrated.defaultLocation = "editor"
        workbench.panel.defaultLocation = hidden
    → LayoutManager.applyDefaultLayout()
        → executeCommand('workbench.action.closePanel')
        → setEditorLayout({ orientation: 0, groups: [{ size: 0.65 }, { size: 0.35 }] })
    → register Tackle Activity Bar views (Tasks, Plan, Sessions)
    → open/initialize .tackle/tackle.db
    → check for psmux/tmux, warn if missing
    → setContext('tackle.active', true)
    → TaskService.sync() — pull tasks from GitHub/ADO
```

### Select Task
```
User clicks Task in TreeView
  → ScopeManager.setActiveTask(task)
    → save current task's layout state:
        LayoutManager.saveLayoutState(currentTask)
          → read current editor layout, terminal placements, review files, focus
          → persist to layout_states table
    → dispose all current VS Code terminal objects
        (psmux sessions keep running)
    → restore target task's layout state:
        LayoutManager.restoreLayoutState(task)
          → setEditorLayout(saved.editor_layout)
          → for each terminal placement:
              TerminalOrchestrator.attachSession(session, groupIndex)
                → createTerminal({
                    name: session.tab_label,
                    location: TerminalLocation.Editor,
                    shellPath: 'tmux',
                    shellArgs: ['attach', '-t', session.psmux_name]
                  })
                → move to correct editor group
          → for each review file:
              showTextDocument(uri, { viewColumn: ViewColumn.Two })
          → focus saved terminal
    → PlanTreeProvider.refresh(task)
    → SessionTreeProvider.refresh(task)
    → setContext('tackle.activeTask', task.id)
```

### Create Agent Session
```
User: Tackle: New Session (or via Sessions TreeView)
  → pick phase (QuickPick, or Pilot if no plan)
  → pick kind (implement, review, test, debug)
  → SessionService.create(task, phase, kind)
    → WorktreeManager.ensureWorktree(task, phase)
        → if first impl session for phase: git worktree add
        → if follow-on (review, test): reuse phase worktree
    → generate psmux name: tackle-{source}-{taskId}-{kind}{N}
    → generate tab label from plan: {taskId}-{slug}|{kind}{N}-{phaseName}
    → ContextInjector.writeSessionState(worktree, task, phase, priorSummaries)
        → write session_state.md to worktree root
    → ContextInjector.appendStandingOrders(worktree)
        → append <!-- TACKLE:BEGIN --> block to CLAUDE.md
    → psmux.createSession(psmuxName, { cwd: worktreePath })
    → TerminalOrchestrator.attachSession(session, groupIndex: 0)
    → persist session to SQLite
    → SessionTreeProvider.refresh()
```

### Task Switch (Full Cycle)
```
Task A active, user clicks Task B:
  → save Task A layout state (grid, placements, review files, focus)
  → dispose all VS Code terminals (5 terminals → 5 dispose calls)
      (Task A's 5 psmux sessions continue running)
  → load Task B layout state from SQLite
  → setEditorLayout(Task B's grid shape)
  → create VS Code terminals for Task B's sessions (3 sessions → 3 create calls)
      each: createTerminal → tmux attach -t → reattach in ~50-100ms
  → place terminals in correct grid cells
  → reopen Task B's review files in Editor Group 2
  → focus Task B's last-active terminal
  → refresh all TreeViews

Total time: ~200-500ms for a typical task with 3-5 sessions
```

## MVP Scope

### In MVP
1. **Mode toggle** — `Tackle: Activate` / `Tackle: Deactivate` with settings save/restore
2. **Layout snap** — hide bottom panel, set editor group layout, show Tackle Activity Bar
3. **Task TreeView** — list tasks from GitHub Issues (via `vscode.authentication`), select a task
4. **Terminal orchestration** — psmux-backed terminals in editor area, create/dispose/reattach
5. **Session TreeView** — list sessions for active task, click to focus terminal
6. **Task switch** — full layout save/restore with all psmux sessions reattached
7. **SQLite persistence** — tasks, sessions, layout states in `.tackle/tackle.db`

### Post-MVP
- Plan/phase parsing and Plan TreeView
- Review File Tree in Auxiliary Bar
- Welcome webview home page
- Context injection (session_state.md, CLAUDE.md standing orders)
- `tackle` CLI
- ADO sync
- Git worktree management
- Automation / prompt-on-event
- Copilot CLI agent support
- Session summaries and context passing
- Cost tracking
