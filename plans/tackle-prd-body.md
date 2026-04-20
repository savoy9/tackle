## Problem Statement

Developers working on AI-assisted coding tasks juggle multiple terminal sessions, code files, and context windows simultaneously. When switching between tasks, they must manually rearrange their workspace: find the right terminals, close irrelevant tabs, open the right files, and re-orient themselves. The current ChartRoom Electron MVP rebuilds VS Code's shell, terminal, and editor infrastructure from scratch -- poorly -- when VS Code already provides all of these capabilities natively.

## Solution

**Tackle** is a VS Code extension that turns VS Code into a task-scoped workspace manager. It rearranges the VS Code layout to put psmux-backed terminals in the center editor area and review content on the right, with task/plan/session navigation on the left. When the user selects a task, the entire workspace snaps into place: terminals reattach, the editor grid restores, review files reopen, and focus returns to the last-active session. Session life is decoupled from visibility via psmux -- switching tasks does not kill running agents.

The extension is activated via an explicit mode toggle (Tackle: Activate), which saves the user's current VS Code settings, applies the Tackle layout, and begins managing the workspace. Deactivating restores original settings.

## User Stories

1. As a developer, I want to toggle Tackle mode on and off, so that I can switch between my normal VS Code workflow and the task-focused Tackle layout without losing my original settings.
2. As a developer, I want my VS Code layout to automatically rearrange when I activate Tackle, so that terminals appear in the editor area (center) and the bottom panel is hidden.
3. As a developer, I want to see a list of my GitHub Issues in the Tackle Activity Bar, so that I can select a task to work on.
4. As a developer, I want task sync to use my existing VS Code GitHub authentication, so that I don't have to configure a separate token.
5. As a developer, I want to select a task and have all its terminal sessions appear as editor tabs, so that I'm immediately in the right context.
6. As a developer, I want each terminal tab to be backed by a psmux/tmux session, so that my running processes survive VS Code restarts and task switches.
7. As a developer, I want task switching to dispose current terminal tabs and reattach the target task's psmux sessions, so that switching is near-instant (~200-500ms).
8. As a developer, I want the full editor layout (grid shape, terminal placements, review files, focused terminal) to be saved and restored per task, so that switching tasks feels like switching desktops.
9. As a developer, I want terminal tabs to have meaningful names like 2435-BuildADO|Impl2-AuthMiddleware, so that I can identify which session is which at a glance.
10. As a developer, I want a Sessions TreeView in the Activity Bar showing all sessions for the active task, so that I can click to focus any terminal.
11. As a developer, I want to split terminals into a grid within the editor area (e.g., agent session left, dev server right), and have that grid layout persist across task switches.
12. As a developer, I want the extension to check for psmux/tmux on activation and warn me if it's missing, so that I know what to install.
13. As a developer, I want all state (tasks, sessions, layout snapshots) persisted in a local SQLite database at .tackle/tackle.db, so that my workspace survives restarts.
14. As a developer, I want the SQLite database to use WAL mode, so that the tackle CLI and the extension can access it concurrently without conflicts.
15. As a developer, I want to create new terminal sessions for a task from the Sessions TreeView or command palette, so that I can spawn agent sessions or utility terminals.
16. As a developer, I want each new terminal to be created via TerminalLocation.Editor, so that terminals always appear in the editor area, never the bottom panel.
17. As a developer, I want psmux session names to follow the convention tackle-{source}-{taskId}-{kind}{N}, so that sessions are deterministic and debuggable via tmux ls.
18. As a developer, I want to deactivate Tackle and have all my original VS Code settings restored, so that Tackle doesn't permanently alter my environment.
19. As a developer, I want the extension to work in single-root workspaces only, so that the task-scoping model remains unambiguous.
20. As a developer, I want .tackle/ to be gitignored, so that my local workspace state doesn't pollute the repository.

## Implementation Decisions

### Architecture

- **Single VS Code extension** with multiple contribution points (Activity Bar views, commands, configuration), not multiple extensions. Shared state requires a single extension context.
- **Monorepo structure**: packages/extension/ (VS Code extension), packages/cli/ (tackle CLI), packages/shared/ (types, repository interfaces, SQLite implementation, psmux bridge). The existing Electron app code in packages/electron-app/ is retained as reference during development and deleted after harvesting reusable code.
- **Repo renamed** from chartroom to tackle.

### Modules

1. **Database Layer** (packages/shared/src/db/): Harvested from MVP. Repository interfaces (TaskRepository, SessionRepository, LayoutStateRepository, PhaseRepository, PlanRepository) with async signatures for future Postgres swappability. SQLite implementation via better-sqlite3 with WAL mode. Schema includes new layout_states table with JSON columns for editor layout descriptor, terminal placements, review files, and focus state.

2. **PsmuxBridge** (packages/shared/src/psmux/): Harvested from MVP's psmux-manager.ts. Wraps tmux/psmux CLI commands (create session, kill session, has session, list sessions, send keys). Pure Node.js, no VS Code dependency. Used by both the extension and the CLI.

3. **ModeManager** (packages/extension/src/mode/): Manages the activate/deactivate lifecycle. On activate: saves current VS Code settings (terminal.integrated.defaultLocation, panel visibility, etc.) to extension global state, applies Tackle settings, initializes DB, checks for psmux, triggers task sync, sets tackle.active context. On deactivate: restores original settings, clears context.

4. **LayoutManager** (packages/extension/src/layout/): Saves and restores per-task layout states. On save: reads current editor group layout, enumerates terminal tab placements by group index, collects review file URIs, records focused editor/terminal. On restore: calls vscode.setEditorLayout() with saved descriptor, recreates terminals in correct groups, reopens review files in Editor Group 2, restores focus.

5. **TerminalOrchestrator** (packages/extension/src/terminal/): Creates and disposes VS Code terminals backed by psmux. Each terminal is created with TerminalLocation.Editor and runs tmux attach -t <psmux_name>. Generates psmux names (tackle-{source}-{taskId}-{kind}{N}) and tab labels ({taskId}-{slug}|{kind}{N}-{label}). Tracks terminal-to-session mappings. Handles dispose on task switch (psmux sessions stay alive) and reattach on task return.

6. **ScopeManager** (packages/extension/src/scope/): Orchestrates task selection. Sequences: save current layout state, dispose terminals, restore target layout state, reattach terminals, refresh TreeViews, update context. The conductor that ties LayoutManager, TerminalOrchestrator, and TreeView providers together.

7. **TaskService** (packages/extension/src/task/): GitHub Issues sync using vscode.authentication.getSession('github', ['repo']). Maps GitHub issues to Task entities via repository interface. ADO sync (post-MVP) will use vscode.authentication.getSession('microsoft', [...]).

8. **TreeView Providers** (packages/extension/src/views/): TaskTreeProvider -- lists tasks, click to select (triggers ScopeManager). SessionTreeProvider -- lists sessions for active task, click to focus terminal. PlanTreeProvider and ReviewFileTreeProvider are post-MVP stubs.

9. **Tackle CLI** (packages/cli/): Standalone Node.js CLI reading/writing same SQLite DB via shared repository interfaces. Commands: tackle task list|show|status, tackle session list|complete|summary, tackle phase list|update, tackle plan show. Bundled with the extension (single install step).

### Key Technical Decisions

- **TerminalLocation.Editor** (VS Code API since v1.64) places terminals as editor tabs in the center area. No fork, no webview terminal, no custom xterm.js needed.
- **All terminals are psmux-backed** -- both agent sessions and utility terminals. No distinction in persistence behavior. This decouples session life from visibility.
- **Task switch is eager** -- all terminals for the target task are recreated on switch (not lazy). Full layout restore including grid shape, terminal placements, review files, and focus.
- **Authentication** uses vscode.authentication API -- reuses the user's existing VS Code GitHub/Microsoft sign-in. No separate token configuration.
- **Single-root workspace only**. Multi-root is explicitly out of scope -- one Tackle instance per VS Code window.
- **Layout state** stored as JSON in SQLite (layout_states table) -- includes setEditorLayout descriptor, terminal-to-group mappings, review file URIs, and focused session ID.
- **Repository pattern** with async interfaces for future Postgres migration. SQLite implementation wraps better-sqlite3 synchronous calls in Promise.resolve().

### Data Model

New/modified tables vs. MVP:

- sessions table gains: psmux_name TEXT (machine identifier), tab_label TEXT (display name), agent TEXT (nullable, 'claude-code' or 'copilot-cli'), worktree_path TEXT (nullable), sort_order INTEGER (tab ordering), claude_session_id TEXT (for --resume)
- New layout_states table: task_id TEXT UNIQUE, editor_layout JSON, terminal_placements JSON, review_files JSON, focused_session_id TEXT, focused_group_index INTEGER
- sessions.kind expanded from agent|terminal to plan|implement|review|debug|test|pilot|shell

## Testing Decisions

### What makes a good test

Tests should verify **external behavior through module interfaces**, not implementation details. A test for LayoutManager should verify that saving and restoring a layout produces the correct setEditorLayout descriptor and terminal placement list -- not that a specific internal method was called. Tests should be fast (sub-second), deterministic, and not depend on VS Code being running.

### Modules under test

1. **Database Layer** -- Repository CRUD operations against in-memory SQLite. Verify upsert behavior, layout state round-tripping (save JSON -> load JSON -> identical structure), batch operations, WAL mode concurrent access.
2. **LayoutManager** -- Layout state serialization/deserialization. Given a layout descriptor and terminal list, verify correct placement logic. Mock VS Code API calls.
3. **TerminalOrchestrator** -- psmux name generation (tackle-gh-42-impl1), tab label generation (42-AuthBug|Impl1-Middleware), session-to-terminal mapping logic. Mock VS Code terminal API and PsmuxBridge.
4. **PsmuxBridge** -- Integration tests against real tmux (if available in CI). Verify session create/kill/has/list lifecycle.
5. **ScopeManager** -- Coordination test with mocked dependencies. Verify that task switch calls save, dispose, restore, reattach in the correct order.
6. **TaskService** -- Data mapping from GitHub API response to Task entity. Mock vscode.authentication and HTTP responses.
7. **Tackle CLI** -- Command parsing and DB interactions. Verify CLI output format against repository data.

### Prior art

The existing ChartRoom MVP has ~30 test files in packages/electron-app/src/main/__tests__/ covering DB operations, plan parsing, session management, and GitHub sync. These test patterns (in-memory SQLite, direct repository calls) carry over directly for the shared package tests.

## Out of Scope

- Plan/phase parsing and Plan TreeView (post-MVP Phase 2)
- Review File Tree in Auxiliary Bar (post-MVP Phase 2)
- Welcome webview home page (TreeView is sufficient for v1)
- Context injection (session_state.md, CLAUDE.md standing orders) (post-MVP Phase 2)
- Git worktree management (post-MVP Phase 2)
- ADO work item sync (GitHub only for v1)
- Automation / prompt-on-event (post-MVP Phase 3+)
- Copilot CLI agent support (Claude Code only for v1)
- Session summaries and context passing (post-MVP Phase 2)
- Cost tracking
- VS Code Marketplace publishing (local .vsix sideload for v1)
- Multi-root workspace support (explicitly excluded by design)
- Status bar items (excluded to avoid status bar clutter)
- Forking VS Code (unnecessary; all required features available via extension API)

## Further Notes

- The name **Tackle** replaces ChartRoom. The nautical metaphor continues (Pilot, rigging, etc.) but emphasizes the workspace management ("tackle a task") rather than chart/planning.
- The existing chartroom repo will be renamed to tackle. The Electron MVP code stays as reference during extension development and is deleted once all reusable code is harvested into packages/shared/.
- The cr CLI becomes tackle CLI. Same functionality, same SQLite DB access pattern, new name.
- psmux/tmux is a hard dependency. The extension checks on activation and provides install guidance if missing.
- Full domain model, ubiquitous language, and design decisions are documented in plans/tackle-domain-model.md.
