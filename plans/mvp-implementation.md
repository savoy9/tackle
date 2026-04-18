# Plan: Chartroom MVP

> Source PRD: [plans/chartroom-design.md](./chartroom-design.md)

## Architectural decisions

Durable decisions that apply across all phases:

- **Monorepo**: pnpm workspaces with `packages/electron-app`, `packages/cli`, `packages/shared`
- **Electron**: Electron Forge + electron-vite for build tooling
- **Frontend**: React + TypeScript, shadcn/ui + Radix primitives
- **Database**: SQLite via better-sqlite3 in Electron main process
- **IPC**: Electron contextBridge + ipcMain/ipcRenderer for main <-> renderer communication
- **Terminal**: xterm.js + xterm-addon-fit + xterm-addon-webgl in renderer, psmux/tmux sessions managed from main process
- **External sync**: GitHub Issues first (@octokit/rest), ADO second (future phase)
- **Schema**: Tasks table synced from external system, sessions table for agent session tracking. Foreign key: sessions reference tasks.
- **Panel layout**: 3 resizable panels -- task (left), terminal (center), review (right, collapsible). Review panel deferred to post-MVP.

---

## Phase 1: Scaffold + empty shell

**User stories**: As a developer, I can clone the repo, run `pnpm dev`, and see the Chartroom Electron app with a 3-panel layout.

### What to build

Bootstrap the monorepo and Electron app with the 3-panel UI shell. No backend logic -- just the frame. The task panel, terminal panel, and review panel render as resizable regions. The review panel should be collapsible. This phase proves the build toolchain works end-to-end: pnpm workspaces -> electron-forge -> vite -> React -> renders in Electron.

### Acceptance criteria

- [ ] `pnpm install` and `pnpm dev` launch the Electron app from a clean clone
- [ ] Three packages exist: `electron-app`, `cli` (stub), `shared` (stub)
- [ ] The app renders 3 panels with resizable dividers (task, terminal, review)
- [ ] The review panel can be collapsed and expanded
- [ ] Hot reload works in development (edit React component, see change without relaunch)
- [ ] TypeScript compilation succeeds with strict mode

---

## Phase 2: SQLite + task list from DB

**User stories**: As a user, I can see a list of tasks in the task panel and click one to view its details.

### What to build

Wire up SQLite in the Electron main process and create the tasks table. Build an IPC bridge so the renderer can query tasks. The task panel renders a list of tasks from the database. Clicking a task shows its details (title, description, status) in an expanded view within the task panel. Seed the database with a few test tasks for development.

### Acceptance criteria

- [ ] SQLite database is created at a known location (e.g., `.chartroom/chartroom.db`) on app launch
- [ ] Tasks table matches the schema from the design doc (id, external_id, external_system, title, description, status, assignee, synced_at, created_at)
- [ ] Sessions table is created (even if not yet used) to avoid future migration
- [ ] IPC handlers exist: `tasks:list`, `tasks:get`
- [ ] Task panel renders a scrollable list of task titles with status indicators
- [ ] Clicking a task shows its full details (title, description, status, assignee) in the task panel
- [ ] Shared types package (`packages/shared`) exports Task and Session TypeScript types used by both main and renderer

---

## Phase 3: GitHub Issues sync

**User stories**: As a user, I can connect Chartroom to a GitHub repo and see its issues as tasks.

### What to build

Add GitHub integration: authenticate with a personal access token, fetch issues from a configured repository, and upsert them into the SQLite tasks table. The task panel now shows real GitHub issues. A settings/config mechanism (could be as simple as a config file or environment variable for MVP) specifies the GitHub repo. Start by connecting to `savoy9/chartroom` itself -- dogfooding from the start.

### Acceptance criteria

- [ ] A configuration mechanism exists to specify GitHub repo (owner/repo) and auth token
- [ ] On app launch (or manual refresh), issues are fetched from the GitHub API
- [ ] Issues are upserted into the tasks table with `external_system = 'github'`
- [ ] Task panel shows real GitHub issues with title, status (open/closed), and assignee
- [ ] Sync handles pagination (repos with >30 issues)
- [ ] Sync failures are handled gracefully (shows cached data, displays error notification)
- [ ] A "Refresh" button triggers a manual re-sync

---

## Phase 4: Terminal session in a panel

**User stories**: As a user, I have a working terminal embedded in the Chartroom app.

### What to build

Embed xterm.js in the terminal panel and connect it to a psmux (or tmux) session managed from the Electron main process. This phase is about proving the terminal pipeline: main process spawns a psmux session, connects to it, and pipes I/O to xterm.js in the renderer via IPC. The terminal should be fully functional -- run commands, see output, handle resize. No agent integration yet -- just a raw shell.

### Acceptance criteria

- [ ] xterm.js renders in the terminal panel with proper sizing and font
- [ ] A psmux/tmux session is spawned from the main process on app launch
- [ ] Terminal I/O (stdin/stdout) flows between xterm.js and the psmux session
- [ ] Terminal handles resize when the panel is resized (xterm-addon-fit)
- [ ] The terminal works for interactive commands (e.g., `git log`, `vim`)
- [ ] Closing the app does NOT kill the psmux session (crash resilience verified)
- [ ] Reopening the app reconnects to the existing psmux session

---

## Phase 5: Agent session lifecycle

**User stories**: As a user, I can start a Claude Code session in Chartroom, see it in a tab, switch between multiple sessions, and stop sessions.

### What to build

Add session management: a "New Session" button spawns Claude Code in a new psmux pane and records the session in SQLite. The terminal panel gets a tab bar showing all active sessions. Clicking a tab switches the xterm.js view to that session's psmux pane. Sessions can be stopped (kills the agent process, updates DB status). The sessions table tracks session metadata (id, status, psmux session name, started_at, etc.).

### Acceptance criteria

- [ ] A "New Session" button in the terminal panel header spawns a Claude Code session in a new psmux pane
- [ ] The session is recorded in the SQLite sessions table with status `running`
- [ ] A tab bar appears in the terminal panel showing all sessions (session name/id, status indicator)
- [ ] Clicking a tab switches the xterm.js view to that session's psmux pane
- [ ] Multiple sessions can run concurrently, each in its own psmux pane
- [ ] A "Stop" action on a session kills the agent process and sets DB status to `completed`
- [ ] Session status is detected (at minimum: running vs. completed) and reflected in the tab bar
- [ ] Closed sessions remain in the tab bar (grayed out) for reference but can be dismissed

---

## Phase 6: Tasks + sessions linked

**User stories**: As a user, I can associate sessions with tasks, see which sessions belong to which task, and navigate between them.

### What to build

Connect the task and session models: when starting a new session, the user selects which task it's for. The task panel shows a session list under each task. Selecting a task in the task panel filters or highlights its sessions in the terminal tab bar. The session list in the task panel shows session status and allows clicking to switch to that session's terminal. This completes the MVP -- tasks from GitHub are visible, agent sessions are running, and the two are linked.

### Acceptance criteria

- [ ] When creating a new session, a task picker lets the user associate it with a task (or create an unassociated session)
- [ ] The task panel shows a "Sessions" section under the selected task, listing all associated sessions
- [ ] Clicking a session in the task panel's session list switches the terminal panel to that session
- [ ] The terminal tab bar indicates which task each session belongs to (e.g., via label or color)
- [ ] Creating a session from a task context (e.g., a button on the task detail view) auto-associates it
- [ ] The sessions table foreign key to tasks is enforced (nullable for unassociated sessions)
- [ ] The overall workflow is demoable: open app -> see GitHub issues -> pick a task -> start a Claude Code session -> see it linked in both panels
