# Chartroom - Design Document

> The chartroom is where the captain plots the course, reviews the charts, and makes navigation decisions.

**Chartroom** is a coding agent session and task management tool. Half your screen is your agent session(s), the other half is a UI that helps you keep track of what you're doing in your project and how tasks fit together. Each task has multiple sessions (planning, implementation, review, debugging, etc.) that can be selected from that task, with summaries and context passing between sessions. Each task also has a **Pilot** session -- a conversational controller agent you talk to about the task.

---

## Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Runtime | Electron desktop app | Rich UI + native terminal access. VS Code ecosystem (Monaco, xterm.js, diff viewer) was built for Electron. |
| Framework | Electron Forge + electron-vite | Community-standard build tooling for Electron in 2026. |
| Frontend | React + TypeScript | Mature ecosystem, huge component library, most Electron apps use it. |
| Session backend | psmux/tmux | Crash resilience -- sessions survive app crashes. User can also attach directly via `tmux attach`. psmux provides native Windows tmux. |
| Agent (primary) | Claude Code | Deep integration first (session resume, transcripts, CLAUDE.md context injection, hooks, MCP). |
| Agent (secondary) | GitHub Copilot CLI | Second agent to validate the abstraction layer. |
| Task source of truth | External system (ADO / GitHub Issues) | Single source of truth for the team. Local enrichment (phases, sessions, automation) layered on top. |
| Local persistence | SQLite | Simple, portable, no server. Schema designed for eventual multi-user migration. |
| Project scope | Per-repo | One Chartroom instance per git repo. Multi-repo = multiple instances. |
| Git isolation | Git worktrees | Each session gets its own worktree. Prevents agents from stepping on each other. |
| Project structure | Monorepo (pnpm workspaces) | Single repo: electron-app + shared-types + potential CLI package. |
| Controller name | Pilot | The Pilot is a conversational Claude Code session scoped to a task. You talk to it about the task's status and next steps. |
| Plan visualization | Phase timeline (vertical list) | Phases listed vertically, expandable to show child sessions. Status badges, summaries, artifacts. |
| Agent interface | CLI (`cr`) + skill.md | Standalone CLI reads/writes SQLite DB. Global skill.md teaches agents the CLI. No MCP server. |
| Context delivery | 4-layer model | (1) Global /chartroom skill, (2) Repo CLAUDE.md pointer, (3) Worktree CLAUDE.md with task context, (4) Hooks for mid-session state updates. |
| Data architecture | Cache + selective sync back | SQLite caches task metadata from ADO/GH. Chartroom enrichment is local. Key milestones sync back as comments/attachments. |
| ADO hierarchy mapping | Configurable | User configures which ADO work item types map to Chartroom tasks. Supports Scrum (PBI), Agile (User Story), etc. |
| Phase granularity | Configurable per task | Small tasks: local phases, one PR. Large tasks: phases create ADO child items + separate PRs. Decided at planning time. |
| ADO sync-back format | Configurable verbosity | Status updates + PR links always. Phase comments and session summaries configurable. |
| Cost tracking | Read from Claude Code (phase 2+) | Parse token usage from Claude Code session files. Aggregate per task/session. |
| Session templates | Yes (phase 2+) | Saveable session configurations for common patterns. |
| Review panel | 2 modes: Edit + Diff | Monaco editor for plans/docs/code. Monaco diff viewer for session changes. Auto-switches based on active session. Collapsible file browser sidebar. |
| Worktree model | Trunk + phase worktrees | Pilot/planning on task branch trunk. Impl creates phase worktrees. Review/test/debug inherit phase worktree. Post-phase sessions return to trunk. |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Chartroom (Electron)                         │
├──────────────┬──────────────────┬───────────────────────────────────┤
│  TASK PANEL  │  TERMINAL PANEL  │  REVIEW PANEL (collapsible)      │
│              │                  │                                   │
│  Task list   │  xterm.js        │  [Edit] [Diff]     │ Files(coll)│
│  Sessions    │  (psmux pane)    │                     │            │
│  Plan viz    │                  │  Monaco editor      │ Changed:   │
│   └ links    │  Tab bar:        │  or diff viewer     │  ■ auth.ts │
│     open in  │  [pilot][impl]   │                     │  ■ config  │
│     review   │  [review][debug] │  Auto-switches by   │  □ test    │
│              │                  │  active session     │            │
└──────┬───────┴────────┬─────────┴───────────┬─────────┴────────────┘
       │                │                     │
       │                │ xterm.js <-> psmux  │ Saves to trunk or
       │                │                     │ phase worktree
┌──────┴───────┐  ┌─────┴──────────────┐  ┌──┴───────────────────────┐
│   SQLite DB  │  │  psmux/tmux server │  │  Git Worktree Model      │
│              │  │                    │  │                          │
│  tasks       │  │  Pilot session     │  │  task branch (trunk)     │
│  sessions    │  │  Impl sessions     │  │    ├─ phase-1 worktree   │
│  phases      │  │  Review sessions   │  │    ├─ phase-2 worktree   │
│  summaries   │  │  Debug sessions    │  │    └─ post-phase (trunk) │
│  events      │  │                    │  │                          │
└──────────────┘  └────────────────────┘  └──────────────────────────┘
       │                                         │
       │  sync                                   │  cr CLI
       │                                         │
┌──────┴───────────────────┐  ┌──────────────────┴───────────────────┐
│  External Task Systems   │  │  Agent Context (4-layer)             │
│  - Azure DevOps          │  │  1. Global /chartroom skill          │
│  - GitHub Issues         │  │  2. Repo CLAUDE.md pointer           │
│                          │  │  3. Worktree CLAUDE.md (per-session) │
│  Automation Daemon       │  │  4. Hooks (mid-session updates)      │
│  - Watches events        │  │                                      │
│  - Fires rules           │  │  Standalone CLI: cr                  │
│  - Spawns sessions       │  │  (reads/writes same SQLite DB)       │
└──────────────────────────┘  └──────────────────────────────────────┘
```

---

## Core Concepts

### Tasks

A task maps 1:1 to an external work item (ADO work item or GitHub issue). Chartroom syncs the task's title, description, status, and assignee from the external system and enriches it locally with:

- **Phases** -- the structured plan for completing the task
- **Sessions** -- Claude Code (or other agent) sessions that do the actual work
- **Automation rules** -- declarative transitions between phases
- **Artifacts** -- plans, docs, diffs, browser tabs (future)

### Sessions

A session is a single agent conversation running in a psmux terminal pane. Sessions have:

- **Type** -- default types: `plan`, `implement`, `review`, `debug`, `test`, `pilot`, or custom types
- **Phase mapping** -- explicitly tied to a plan phase, or freeform/ad-hoc
- **Status** -- `running`, `idle`, `waiting`, `completed`, `failed`
- **Summary** -- auto-generated structured summary on completion
- **Transcript** -- full conversation history (stored by Claude Code, referenced by Chartroom)
- **Git worktree** -- isolated working copy for the session

A task can have multiple sessions of the same type (e.g., three `implement` sessions for three phases).

### The Pilot

The Pilot is a special long-lived Claude Code session scoped to a task. It is the **conversational interface to the task** -- like gastown's Mayor but scoped to one task.

**What the Pilot does:**
- Answers "where are we with this task?" by reading state from the DB
- Spawns new sessions when asked ("let's start implementing phase 2")
- Delegates operational work (summarizing, syncing to ADO) to short-lived subagents
- Stays clean and available -- doesn't do grunt work itself
- Uses the `cr` CLI to read/write Chartroom's SQLite DB

**What the Pilot doesn't do:**
- Run summaries or status syncs itself (delegates to subagents)
- Block on long-running operations
- Accumulate token-heavy context from child sessions

**Interaction pattern:**
- UI has buttons for common actions (start planning, begin implementation, etc.)
- Most of the time, you talk to the Pilot directly for nuanced requests
- The Pilot reads state from the DB on each turn (pull model, not push)

### Plan Visualization

The plan is a phase timeline -- a vertical list of phases, each expandable to show child sessions:

```
Task: Fix auth bug #1234
────────────────────────────
● Planning              [done]
  ├─ Session: planning-1  (3 min)
  │  Summary: Decided on OAuth2...
  └─ Artifact: plan.md

● Implementation        [in progress]
  ├─ Phase 1: Auth middleware  [done]
  │  └─ Session: impl-1  (12 min)
  ├─ Phase 2: Token refresh    [running]
  │  └─ Session: impl-2  (5 min...)
  └─ Phase 3: Error handling   [pending]

○ Review                [pending]
○ Testing               [pending]
```

**Plan source:** The planning session produces structured output (from workflows like /grill-me -> /prd-to-plan -> /tdd). Chartroom parses this into phases. The tool should not be overly opinionated about the specific planning workflow.

**Session mapping:** Planned phases have sessions explicitly tied to them. Ad-hoc sessions (exploration, debugging) float freely. The Pilot helps map sessions to phases when it's not obvious.

### Automation

A lightweight event-driven daemon (Node.js process within Electron) watches for session events and applies declarative rules:

```yaml
# .chartroom/automation.yaml
automation:
  transitions:
    plan -> implement:
      mode: manual        # human kicks this off (via Pilot or UI button)
    implement -> review:
      mode: auto          # fires when implementation phase completes
      context: auto_summary
    review -> test:
      mode: auto
      condition: review_approved
    test -> merge:
      mode: manual        # human approves merge
  on_phase_failed:
    implement:
      - type: debug
        auto_spawn: true
```

The automation daemon and the Pilot are **separate concerns**:
- The daemon applies rules mechanically (event matches rule -> action)
- The Pilot makes judgment calls when you ask it to
- Both read/write the same SQLite database

### Review Panel

The review panel is a collapsible third panel on the right side of the UI. It has two modes and a collapsible file browser sidebar:

```
Review Panel:
┌──────────────────────────────────────────┐
│ [Edit] [Diff]  │  plan.md  [x]  │ Files │
├────────────────┴─────────────────┤(coll) │
│                                  │ ● src/│
│  (Monaco editor or diff viewer)  │  auth/│
│                                  │ ● plan│
│                                  │       │
└──────────────────────────────────┴───────┘
```

**Edit mode:** Monaco editor with Edit/Preview/Split toggle. For plans, docs, config, or any file. Supports markdown preview.

**Diff mode:** Monaco diff viewer with changed files list. Shows git diff for a session's worktree vs the base branch. File tree shows only changed files.

**Auto-switching:** The review panel automatically shows content relevant to the active terminal session. Planning session active -> opens plan.md in Edit mode. Impl session active -> opens diff view. Manual override persists until you switch sessions.

**File browser:** Collapsible sidebar within the review panel. Context-aware:
- Edit mode: full worktree file tree
- Diff mode: changed files only

**Save targets:** The review panel knows whether a file is a shared artifact (saves to task trunk) or session code (saves to the session's worktree) based on file path context.

**Plan timeline links:** The task panel's plan visualization has clickable links that open the corresponding plan section in the review panel's Edit mode.

### Git Worktree Model

Sessions don't each get their own worktree. The worktree model follows the task lifecycle:

```
main branch
  │
  └─ task branch (trunk)
       │  Pilot session     -> works here
       │  Planning sessions -> works here
       │  Some doc sessions -> works here
       │
       ├─ phase-1 worktree (branched from task branch)
       │    Impl session    -> creates this worktree
       │    Review session  -> inherits this worktree
       │    Test session    -> inherits this worktree
       │    Debug session   -> inherits this worktree
       │    Doc session     -> sometimes works here
       │    └─ merges back to task branch when approved
       │
       ├─ phase-2 worktree (same pattern)
       │
       └─ Post-phase (all phases merged to trunk):
            Final review session  -> works on trunk
            Integration test      -> works on trunk
            Final docs            -> works on trunk
            └─ merges task branch to main
```

**Rules:**
- **Trunk sessions** (Pilot, planning, post-phase review/test/docs): work directly on the task branch
- **Phase sessions** (impl): create a new worktree branched from the task branch
- **Follow-on sessions** (review, test, debug of a phase): inherit the phase's worktree
- **Doc sessions**: flexible -- trunk or phase worktree depending on context
- **Worktree assignment** is configured when the session is spawned (by Pilot, automation, or user)

### Context Passing

When a session completes (or on demand), Chartroom generates a structured summary:

```json
{
  "type": "session_summary",
  "session_id": "sess_abc123",
  "session_type": "planning",
  "task_id": "ADO-1234",
  "duration_minutes": 8,
  "decisions": ["Use OAuth2 with PKCE", "Token refresh via silent iframe"],
  "artifacts": ["plans/auth-plan.md"],
  "open_questions": ["Which IdP provider?"],
  "files_changed": ["src/auth/middleware.ts"],
  "next_steps": ["Implement auth middleware", "Add token refresh"]
}
```

Downstream sessions receive this summary as injected context (via CLAUDE.md or initial prompt). Sessions also support:
- **Resume** -- reconnecting to an existing Claude Code session via `--resume`
- **Transcript access** -- reading the full conversation history from Claude Code's session files

---

## Data Model (SQLite)

```sql
-- Tasks (synced from external system)
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL,        -- ADO work item ID or GitHub issue number
  external_system TEXT NOT NULL,     -- 'ado' or 'github'
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
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',     -- pending, in_progress, done, failed
  sort_order INTEGER,
  parent_phase_id TEXT REFERENCES phases(id),  -- for sub-phases
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sessions
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),
  phase_id TEXT REFERENCES phases(id),  -- NULL for ad-hoc sessions
  type TEXT NOT NULL,                   -- plan, implement, review, debug, test, pilot, custom
  status TEXT DEFAULT 'pending',        -- pending, running, idle, waiting, completed, failed
  agent TEXT DEFAULT 'claude-code',
  psmux_session TEXT,                   -- psmux session name
  git_worktree TEXT,                    -- path to git worktree
  claude_session_id TEXT,               -- Claude Code session ID for --resume
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  raw_text TEXT,                       -- human-readable summary
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events (for automation daemon)
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT REFERENCES tasks(id),
  session_id TEXT REFERENCES sessions(id),
  event_type TEXT NOT NULL,            -- session_completed, session_failed, phase_complete, etc.
  payload JSON,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Automation rules (per-task or per-project)
CREATE TABLE automation_rules (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES tasks(id),   -- NULL = project-level default
  from_phase_type TEXT,
  to_phase_type TEXT,
  mode TEXT DEFAULT 'manual',          -- manual, auto
  condition TEXT,                       -- expression evaluated at transition time
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron (Forge + electron-vite) |
| Frontend | React + TypeScript |
| UI components | shadcn/ui + Radix primitives |
| Terminal | xterm.js + xterm-addon-fit + xterm-addon-webgl |
| Code editor/diff | Monaco Editor |
| Markdown | react-markdown or Monaco markdown preview |
| Session backend | psmux (Windows) / tmux (macOS/Linux) |
| PTY bridge | node-pty (Electron main process <-> psmux) |
| Database | better-sqlite3 |
| Git operations | simple-git or isomorphic-git |
| ADO integration | azure-devops-node-api |
| GitHub integration | @octokit/rest |
| IPC | Electron IPC (main <-> renderer) |
| Build | pnpm workspaces monorepo |

---

## Monorepo Structure

```
chartroom/
├── package.json               (pnpm workspace root)
├── pnpm-workspace.yaml
├── .chartroom/                (project-level config, gitignored)
│   ├── config.yaml
│   └── automation.yaml
├── packages/
│   ├── electron-app/          (main Electron application)
│   │   ├── src/
│   │   │   ├── main/          (Electron main process)
│   │   │   │   ├── index.ts
│   │   │   │   ├── db.ts              (SQLite operations)
│   │   │   │   ├── psmux.ts           (psmux session management)
│   │   │   │   ├── git.ts             (worktree management)
│   │   │   │   ├── sync/
│   │   │   │   │   ├── ado.ts         (ADO sync)
│   │   │   │   │   └── github.ts      (GitHub sync)
│   │   │   │   ├── automation.ts      (event daemon)
│   │   │   │   └── summarizer.ts      (session summary generation)
│   │   │   ├── renderer/      (React frontend)
│   │   │   │   ├── App.tsx
│   │   │   │   ├── panels/
│   │   │   │   │   ├── TaskPanel.tsx
│   │   │   │   │   ├── TerminalPanel.tsx
│   │   │   │   │   └── ReviewPanel.tsx
│   │   │   │   ├── components/
│   │   │   │   │   ├── TaskList.tsx
│   │   │   │   │   ├── SessionList.tsx
│   │   │   │   │   ├── PlanTimeline.tsx
│   │   │   │   │   ├── Terminal.tsx
│   │   │   │   │   ├── DiffViewer.tsx
│   │   │   │   │   └── MarkdownPreview.tsx
│   │   │   │   └── hooks/
│   │   │   └── preload/       (Electron preload scripts)
│   │   └── package.json
│   ├── cli/                   (standalone CLI: `cr`)
│   │   ├── src/
│   │   │   ├── index.ts       (entry point)
│   │   │   ├── commands/
│   │   │   │   ├── task.ts    (cr task list/show/status)
│   │   │   │   ├── session.ts (cr session list/spawn/summary)
│   │   │   │   ├── phase.ts   (cr phase list/update)
│   │   │   │   ├── plan.ts    (cr plan show)
│   │   │   │   └── context.ts (cr context)
│   │   │   └── db.ts          (shared DB access)
│   │   ├── bin/cr.js          (CLI binary entry point)
│   │   └── package.json
│   └── shared/                (shared types and utilities)
│       ├── src/
│       │   ├── types.ts       (Task, Session, Phase, Summary types)
│       │   ├── schema.ts      (SQLite schema definitions)
│       │   └── constants.ts
│       └── package.json
├── skill/                     (Claude Code skill, installed globally)
│   └── chartroom/
│       └── skill.md           (/chartroom skill definition)
└── README.md
```

---

## MVP Scope (Phase 1)

The first usable version focuses on two features:

1. **Task list with ADO/GitHub sync**
   - Connect to ADO project or GitHub repo
   - List work items / issues in the task panel
   - View task details (title, description, status)
   - Basic status sync back to external system

2. **Agent sessions (psmux + xterm.js)**
   - Spawn Claude Code sessions in psmux panes
   - Render terminal output via xterm.js in the terminal panel
   - Session tab bar for switching between sessions
   - Start/stop sessions
   - Associate sessions with tasks

**Not in MVP:** Session types/summaries, Pilot session, plan visualization, automation, review panel, git worktree isolation.

---

## Future Phases

**Phase 2: Sessions & Context**
- Session types (plan, implement, review, debug, etc.)
- Auto-generated session summaries
- Context injection into downstream sessions
- Session resume via `--resume`

**Phase 3: Pilot & Plan Visualization**
- Pilot session (conversational controller agent)
- Plan parsing from planning session output
- Phase timeline visualization
- Session-to-phase mapping

**Phase 4: Automation & Review**
- Declarative automation rules (YAML)
- Event-driven daemon for phase transitions
- Review panel (diffs via Monaco, markdown preview)
- Git worktree isolation per session

**Phase 5: Multi-Agent & Team**
- Copilot CLI support
- Multi-user support (shared DB / server mode)
- Team task board
- Session history for PR reviewers

---

## Inspirations & Prior Art

| Project | Stars | What we take from it |
|---------|-------|---------------------|
| **Vibe-Kanban** (BloopAI) | 25.2k | Kanban + multi-agent orchestration, task attempts, inline review, git worktree isolation |
| **Gas Town** (gastownhall) | 14.3k | Mayor/Pilot pattern, agent hierarchy, git-backed persistence, "talk to the Mayor" UX |
| **psmux** | 1.4k | Native Windows tmux, Claude Code agent team integration, warm sessions |
| **Agent Deck** | 2.1k | MCP socket pooling, conductor system, cost tracking |
| **Claude Squad** | ~7k | tmux + git worktrees, YOLO mode, early mover patterns |
| **CCManager** | 1k | PTY-based state detection, session data continuity, status change hooks |
| **agtx** | 873 | Kanban TUI with phase-based task flow, orchestrator agent |
| **Kanban-MCP** | 36 | MCP server for kanban as persistent agent memory |

---

## Agent Interface: CLI + Skill

Instead of an MCP server, Chartroom ships a standalone CLI (`cr`) and a globally installed Claude Code skill (`/chartroom`).

### CLI (`cr`)

The CLI is a standalone Node.js script that reads/writes the same SQLite DB as the Electron app. It works whether or not the app is running.

```bash
# Task management
cr task list
cr task show ADO-1234
cr task status ADO-1234 --set "in progress"

# Sessions
cr session list --task ADO-1234
cr session summary sess_abc
cr session spawn --task ADO-1234 --type implement --phase phase_1

# Plan / phases
cr plan show --task ADO-1234
cr phase list --task ADO-1234
cr phase update phase_1 --status done

# Context
cr context --task ADO-1234          # full task context for injection
cr context --session sess_abc       # session-specific context
```

### Context Delivery (4-Layer Model)

Agent sessions receive Chartroom context through four complementary mechanisms:

1. **Global skill** (`/chartroom`) -- Installed in `~/.claude/skills/`. Full CLI reference and usage patterns. Invoked on demand by any session.

2. **Permanent repo CLAUDE.md pointer** -- Lightweight lines in the repo's CLAUDE.md: "This repo uses Chartroom. Use `cr` to check task state. Invoke /chartroom for CLI reference."

3. **Worktree CLAUDE.md** -- Generated per session when Chartroom creates a git worktree. Contains:
   - Current task context (title, description, phase)
   - Prior session summaries
   - Phase-specific instructions
   - Pointer to /chartroom skill for CLI reference

4. **Hooks for mid-session state updates** -- Claude Code hooks fire on key events to update Chartroom state silently:
   - `pre-commit` / `post-commit` -- track files changed, update session progress
   - Post-tool-use hooks -- after Write/Edit, log changes; after test runs, update phase status
   - Checkpoint detection -- certain output patterns trigger state updates back to Chartroom DB

This means Chartroom stays informed about session progress without relying on the agent to proactively call `cr` commands.

---

## Data Architecture: Cache + Selective Sync Back

Chartroom caches task metadata locally in SQLite and selectively syncs back to ADO/GitHub:

```
SQLite DB (local):
  tasks (cached from ADO/GH -- title, status, description, assignee)
  + phases (local, key milestones synced back)
  + sessions (local only)
  + summaries (local, configurable sync back)

Sync back to ADO/GH:
  - Status updates (always)
  - PR links (always)
  - Phase completion comments (configurable)
  - Session summaries as attachments (configurable)
```

### ADO Hierarchy Mapping

ADO supports multiple workflow templates (Scrum has PBIs, Agile has User Stories). The mapping is configurable:

```yaml
# .chartroom/config.yaml
ado:
  project: MyProject
  organization: myorg
  task_types:
    - Product Backlog Item    # Scrum template
    - Bug
  phase_mapping:
    parent_type: Product Backlog Item
    child_type: Task
    auto_create_phases: false  # default: phases are local
  sync_back:
    status_updates: true
    pr_links: true
    phase_comments: true
    session_summaries: false
    verbosity: normal          # normal | minimal | verbose
```

### Phase Granularity (Configurable Per Task)

Decided at planning time (by user or Pilot):

- **Small task**: Phases are local to Chartroom. One PR when all done. Default.
- **Large task**: Each phase creates an ADO child Task and its own PR. Enables independent review/testing per phase.

Project-level default in config, per-task override at planning time.

---

## Resolved Questions

| Question | Resolution |
|----------|-----------|
| **MCP integration** | No MCP server. Use CLI (`cr`) + skill.md instead. Simpler, debuggable, works with any agent that can run shell commands. |
| **Multi-repo** | Per-repo for now. Task IDs are external (ADO/GitHub), so multiple Chartroom instances naturally share task identity. Defer multi-repo UI. |
| **Cost tracking** | Phase 2+. Read token usage from Claude Code session files and aggregate per task/session. |
| **Offline mode** | Graceful degradation. SQLite always works locally. ADO/GitHub sync failures are queued and retried when connectivity returns. |
| **Session templates** | Phase 2+. Saveable session configurations (agent, worktree settings, context injection patterns). |
| **Context delivery** | 4-layer: global skill + repo CLAUDE.md pointer + worktree CLAUDE.md + hooks for mid-session updates. |
| **ADO hierarchy** | Configurable mapping. User sets which work item types map to Chartroom tasks. Supports Scrum, Agile, and custom templates. |
| **Phase granularity** | Configurable per task. Local phases (one PR) or ADO phases (separate PRs). Decided at planning time. |
| **ADO sync-back** | Configurable verbosity. Status + PR links always. Phase comments and session summaries optional. |
