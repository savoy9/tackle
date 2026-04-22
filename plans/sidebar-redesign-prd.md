## Problem Statement

Tackle's MVP sidebar is two separate TreeViews (Tasks on top, Sessions below for the active task). This surface has three problems:

1. **It's a weak task switcher.** The Task TreeView shows one line per task (title + `#id · status`), with no indication of which tasks have running agents, which are waiting on me, or what's happening underneath. In a multi-task day — the workflow Tackle is designed for — I can't tell at a glance where I should go next.
2. **Sessions for non-active tasks are invisible.** Because the Session TreeView is filtered to `activeTaskId`, I cannot see that an agent on Task B is waiting on input while I'm working on Task A. I only find out when I switch.
3. **Session actions are missing.** I can create a session and focus it, but I cannot stop, restart, remove, rename, or mark a session as done from the sidebar. Today's management of a session requires CLI-style workflows in the terminal.

The MVP is built. The next step is refining this sidebar into a surface that actually supports the two dominant workflows:

- **Deep single-task focus**: one large task, multiple sessions, tracking progress through implementation and bug-fix cycles.
- **Multi-task switching**: one task in planning, another in hands-off exploration, a third waiting on agent input.

Both workflows demand density, live state visible across all tasks, and fast per-session actions.

## Solution

Replace the two TreeViews with a single `WebviewView` — the **Tackle Sidebar** — that operates in two modes:

- **List Mode**: a dense 3-line **Task Card** per open Task, sorted by activity, with a collapsed **Closed Issues Folder** at the bottom. Each card rolls up the state of its Sessions (waiting / working / idle / done / stopped) using an **Activity Glyph** vocabulary (✳️⏳●○✔️🚫). Clicking a card's body expands it in place to show Session Rows underneath; clicking the title enters Detail Mode; an inline button activates without entering detail. A primary left-edge accent bar marks the **Active Task** — the Task whose terminals are open in the editor area.

- **Detail Mode**: the same sidebar surface mutated to show one Task. Back button returns to List without deactivating. Content: Parent Item breadcrumb (hidden for flat GitHub, populated for ADO hierarchy), identity line, branch, scrollable markdown description (slot reserved for a future plan tracker), pinned Sessions section, and a **Task Footer** — a vertical scrollable list of the other Tasks sorted by activity, each row showing Activity Glyph + title + `#id`. Single-click switches Detail to that Task.

**Session Rows** appear in both modes (inside an expanded Card and in Detail's Sessions section). Each row is single-line: kind icon + `tab_label` + Activity Glyph + smart branch display + always-visible **Stop** and **Mark as Done** icons + overflow `⋯` for Restart, Rename, Remove. Row click attaches the terminal and activates the parent Task. Mark as Done flips `status=completed` AND kills the psmux session.

**New Session** auto-generates a label (`<kind>-<n>` per task), spawns psmux with cwd = `Session.worktree_path ?? workspaceRoot`, and auto-launches the configured **Agent** (default `agency-cc`, fallback `claude`; skipped for `shell` kind). Restart preserves continuity via `--resume <claude_session_id>`.

## User Stories

### List Mode: seeing the landscape

1. As a developer, I want all my open tasks rendered as dense cards, so that I can see what I'm working on at a glance without scrolling.
2. As a developer, I want tasks with agents waiting on my input to appear at the top of the list, so that I know where I'm needed first.
3. As a developer, I want each card to show a rollup of its Sessions' states (waiting / working / idle / done / stopped) using emoji glyphs, so that I can triage across tasks without expanding anything.
4. As a developer, I want each card to show the task's branch name, so that I can orient myself without opening the task.
5. As a developer, I want tasks without sessions to show a `+ New session` affordance in place of the rollup, so that I can start work in one click.
6. As a developer, I want the Active Task (the one whose terminals are in the editor area) marked by a visible left-edge accent, so that I know where my terminals are attached.
7. As a developer, I want closed issues grouped into a collapsed folder at the bottom, so that they don't consume space but are reachable.
8. As a developer, I want closed issues to render as compressed single-line rows when expanded, so that historical context stays dense.
9. As a developer, I want a sync button in the sidebar header, so that I can pull the latest tasks from GitHub without leaving the view.
10. As a developer, I want a counts indicator in the header (`N open · M closed`), so that I always know the scope of my workspace.

### List Mode: interacting with a card

11. As a developer, I want to single-click a card's body to expand it and see its Sessions nested below, so that I can peek at a task's state without committing to it.
12. As a developer, I want to single-click a card's title text to enter Detail Mode (which also activates the task), so that reading a task takes one click.
13. As a developer, I want an `Activate` button on non-Active cards, so that I can bring a task's terminals into the editor area without leaving List Mode.
14. As a developer, I want an overflow `⋯` menu on each card with task-level actions (Open on GitHub/ADO, New session, Deactivate, Copy ID), so that I can reach per-task actions without entering Detail Mode.
15. As a developer, I want multiple cards expanded simultaneously, so that I can compare state across tasks without losing my place.
16. As a developer, I want expanded cards to remember their expansion across VS Code reloads, so that my workspace state is preserved.

### Detail Mode: working on one task

17. As a developer, I want to enter Detail Mode by clicking a task title, so that I focus on one task with more real estate.
18. As a developer, I want the Detail Mode header to show the task title, a Back button, and an overflow menu, so that navigation is unambiguous.
19. As a developer, I want Back to return me to List Mode without closing my terminals, so that navigation and lifecycle stay independent.
20. As a developer, I want the task's parent work item (ADO Epic/Feature/PBI) rendered as a breadcrumb when present, so that I have hierarchical context without leaving the sidebar.
21. As a developer, I want the task description rendered as GitHub-flavored markdown in a scrollable container, so that I can read background without the Sessions list falling off-screen.
22. As a developer, I want the Sessions section pinned below the description regardless of how long the description is, so that the action layer is always one scroll away.
23. As a developer, I want a Task Footer at the bottom of Detail Mode listing other Tasks (~5 visible, scrollable), so that I can switch to another task without returning to List Mode.
24. As a developer, I want each Task Footer row to show an Activity Glyph, so that I can tell when another task needs my attention while I'm focused here.
25. As a developer, I want the Task Footer sorted by activity (waiting first), so that urgent switches are always at the top.
26. As a developer, I want the Task Footer to exclude the Task I'm currently viewing, so that footer slots aren't wasted on a no-op.
27. As a developer, I want the Detail Mode overflow menu to expose Open on GH/ADO, New session, Deactivate, and Copy ID, so that task-level actions are always reachable.

### Session management

28. As a developer, I want each Session Row to render its kind icon, label, Activity Glyph, and a `🌿 branch` chip only when the session's worktree differs from the task's primary branch, so that the row stays clean for the common case.
29. As a developer, I want active Sessions (running, attached) to sort above completed/stopped Sessions with a subtle divider between them, so that the current work is eye-level.
30. As a developer, I want clicking a Session Row to attach its terminal and activate the parent Task, so that I never end up with terminals attached to a different Task than the one I'm viewing.
31. As a developer, I want a always-visible Stop icon on each Session Row, so that I can halt a runaway agent without navigating a menu.
32. As a developer, I want a always-visible Mark as Done icon on each Session Row, so that I can signal "work finished, clean up" in one click.
33. As a developer, I want Mark as Done to set status to `completed` AND kill the psmux session, so that I don't end up with orphaned agents still thinking they're active.
34. As a developer, I want Restart, Rename, and Remove actions on the overflow menu of each Session Row, so that richer actions are available without cluttering the row.
35. As a developer, I want a right-click context menu mirroring the overflow menu, so that power-user interaction is consistent with VS Code conventions.
36. As a developer, I want Remove to prompt for confirmation when the session is still running, so that I don't kill work by accident.
37. As a developer, I want Restart to kill the current psmux, spawn a new one with the same kind/label/task, and pass `--resume <claude_session_id>` to the Agent, so that my conversation continues where it left off.
38. As a developer, I want the Restart operation to replace the session row in place (same id), so that my Sessions list doesn't accumulate ghost rows.
39. As a developer, I want Rename to edit the `tab_label` inline on the row, so that I don't lose context to a modal dialog.

### New Session creation

40. As a developer, I want a QuickPick picker for Session Kind when I create a new session, so that I pick from a known set (`plan`, `implement`, `review`, `debug`, `test`, `pilot`, `shell`).
41. As a developer, I want the new session's label auto-generated as `<kind>-<n>` scoped per task (e.g., `implement`, `implement-2`), so that I don't have to come up with names.
42. As a developer, I want the session to spawn with cwd = `Session.worktree_path ?? workspaceRoot`, so that the agent starts in the right directory for the task.
43. As a developer, I want the configured Agent to auto-launch after the terminal attaches, so that I don't have to type `agency-cc` or `claude` myself.
44. As a developer, I want the default Agent to be `agency-cc` (Microsoft-internal Claude wrapper with WorkIQ and ES Chat MCPs), overrideable via `tackle.defaultAgent`, so that I get internal-tool access by default.
45. As a developer, I want `shell` kind sessions to skip agent launch entirely, so that raw shells stay raw.
46. As a developer, I want New Session entry points on empty cards (`+ New session` link), in the Detail Mode sessions header, and in the task overflow menus, so that the action is reachable wherever I'm working.

### Task lifecycle

47. As a developer, I want entering Detail Mode on a non-Active Task to activate that task and swap terminals, so that Detail Mode always shows a live workspace.
48. As a developer, I want clicking a Task Footer row in Detail Mode to switch the Active Task and the Detail view simultaneously, so that switching is one click.
49. As a developer, I want the Active Task persisted across VS Code reloads, so that I come back to the workspace I left.
50. As a developer, I want a task that gets closed externally (on GitHub) to keep its running Sessions alive and surface a subtle "externally closed" indicator in Detail Mode, so that I'm not blocked from finishing work when the issue is closed under me.

### Activity Glyph behavior

51. As a developer, I want the Task Card's leading glyph to reflect the highest-urgency state across its Sessions (✳️ > ⏳ > ● > ○ > ✔️-only > 🚫-only), so that one glance tells me whether the task needs me.
52. As a developer, I want the glyph set to mirror Claude Code's tab indicators (✳️ waiting, ⏳ working, ✔️ done, 🚫 stopped), so that state semantics are consistent with the tools I'm already using.
53. As a developer, I don't want any pulsing or animation, so that a long list of tasks doesn't feel like a disco.
54. As a developer, I want the Agent State dimension added to the schema now (as `Session.agent_state`) with values `idle` / `working` / `waiting`, even though detection is deferred, so that the UI is ready to light up the day detection lands.

### State persistence

55. As a developer, I want the sidebar mode (List or Detail-of-X), expanded card set, Active Task id, and Closed Issues Folder expansion persisted to `workspaceState`, so that my workflow survives reloads.
56. As a developer, I don't want scroll positions persisted to disk; I want them preserved in-memory via `retainContextWhenHidden`, so that collapsing/expanding the sidebar doesn't lose my place but reloads don't try to restore fragile pixel offsets.

### Sync and data

57. As a developer, I want sync to be a single global operation (one GitHub API call pulling all open issues) rather than per-task, so that I never have to decide what to sync.
58. As a developer, I want the sidebar to refresh automatically after sync, session create/update/stop/remove, and agent state changes, so that I never see stale data.
59. As a developer, I want optimistic UI for fast/reversible actions (Stop, Mark as Done, Rename), so that the sidebar feels snappy.
60. As a developer, I want pessimistic UI (spinner) for slow/destructive actions (Restart, Remove), so that I can see when an operation is actually in flight.

### Backward compatibility

61. As a developer, I want existing Sessions to continue working after the sidebar redesign, so that work in progress isn't invalidated by the upgrade.
62. As a developer, I want the schema additions (`agent_state`, `prior_claude_session_ids`, `parent_external_id`) to be non-breaking additive migrations, so that I can open an older Tackle DB.

## Implementation Decisions

### Sidebar architecture

- The current `tackleTaskView` and `tackleSessionView` TreeViews are replaced by a single `WebviewView` registered as `tackleSidebar` in the Tackle Activity Bar container.
- `retainContextWhenHidden: true` preserves in-memory UI state when the sidebar is hidden.
- The webview is a pure function of state. The extension host computes a full view state on every relevant event and pushes `{type: 'state', payload}` in a single message; the webview calls `render(state)` and replaces its DOM. Debounced at the host.
- Webview → host messages are typed action verbs (`stopSession`, `restartSession`, `markSessionDone`, etc.).
- Code is organized as deep, independently-testable modules:
  - **sidebar-state** (pure reducer): `(prevState, event) → nextState`. No VS Code dependencies.
  - **render** (pure function): `state → HTML string`. No DOM, no VS Code dependencies.
  - **messages** (typed protocol): request/response shapes, validated both sides.
  - **sidebar-controller**: subscribes to repos/managers/orchestrator, computes state, pushes to webview, handles inbound messages.
  - **sidebar-view-provider**: registers the WebviewView with VS Code; thin shim.
  - **webview/main.ts + styles.css**: bootstrap, DOM delegation, message pipe.

### Interaction model

- **Card body single-click**: toggle expand in place.
- **Card title single-click**: enter Detail Mode (activates the task as a side effect).
- **Activate button (inline, non-Active cards only)**: activate the task without entering Detail Mode.
- **Card `⋯`**: task-level overflow menu.
- **Right-click on card**: same as overflow.
- **Back button in Detail Mode**: return to List Mode; does not deactivate the task.
- **Session Row click**: attach terminal + activate parent task.
- **Session Row inline Stop icon**: stop session (kill psmux, set status `stopped`).
- **Session Row inline Mark-as-Done icon**: set status `completed` + kill psmux.
- **Session Row `⋯`**: Restart, Rename, Remove.
- **Right-click on Session Row**: mirror of the overflow menu.

### Activity Glyph vocabulary

- ✳️ waiting for input · ⏳ working · ● idle attached · ○ idle detached · ✔️ completed · 🚫 stopped.
- All emojis, no codicons for the state set.
- Task Card glyph rolls up Sessions by urgency priority: ✳️ > ⏳ > ● > ○ > ✔️-only > 🚫-only.
- No animation.

### Session action semantics

- **Stop**: kill psmux, set `status='stopped'`. No confirmation.
- **Mark as Done**: kill psmux, set `status='completed'`. No confirmation. Icon always visible alongside Stop.
- **Restart**: replaces the row in place. Kills old psmux, spawns new psmux with same kind/label/task, auto-launches Agent with `--resume <claude_session_id>` for continuity. Fresh-start semantics are achieved via Remove + New Session.
- **Remove**: soft-delete DB record + kill psmux. Confirmation prompt required if the session is currently `running`.
- **Rename**: inline edit of `tab_label` in the Session Row.

### Agent registry

- A registry module maps Agent name → `{ command, resumeFlag(sessionId) }`.
- MVP entries: `agency-cc` (Microsoft-internal, default) and `claude` (vanilla).
- Both support `-r <id>` / `--resume <id>`; the registry exposes this as the unified `resumeFlag`.
- `tackle.defaultAgent` setting controls the default; per-session override stored on `Session.agent`.
- `shell` kind is recognized by the registry (or by the caller) and skips Agent launch entirely.

### New Session spawn flow

- cwd resolution: `Session.worktree_path ?? vscode.workspace.workspaceFolders[0].uri.fsPath`.
- After psmux create + terminal attach, the Agent is launched by sending keys to the psmux session (`cd <cwd> && <agent command>`), unless `kind === 'shell'`.
- Label auto-generation: `<kind>-<n>` where `n` is the count of same-kind sessions on the task + 1.

### Task lifecycle

- **Active Task** is the Task whose terminals are open in the editor area. At most one at a time in MVP.
- Entering Detail Mode on a Task activates it (terminal swap). Clicking Back does not deactivate.
- Detail Mode's Task Footer click switches both the Active Task and the Detail view in one atomic operation.
- Active Task id is persisted to `workspaceState`.

### Schema additions (non-breaking)

- `Session.agent_state` (TEXT, default `'idle'`) — values `idle` | `working` | `waiting`. Detection is deferred; the column exists so UI is ready.
- `Session.prior_claude_session_ids` (TEXT, nullable, JSON-encoded array) — captures Claude thread history when `/clear` or `/branch` is detected. No UI for this in MVP.
- `Task.parent_external_id` (TEXT, nullable) — the external-system parent (ADO Epic/Feature). Null for flat GitHub.

### Filtering and sorting

- MVP filter: all open issues visible; closed issues in a collapsed `Closed Issues Folder` at the bottom.
- Closed predicate: `status` matches a case-insensitive closed set (`closed`, `done`, `completed`, `resolved`, `removed`).
- Sort (both List Mode and Task Footer): activity-first (waiting > working > any-running > other), then `updated_at` descending.

### Commands registered

- New: `tackle.stopSession`, `tackle.restartSession`, `tackle.removeSession`, `tackle.renameSession`, `tackle.markSessionDone`, `tackle.enterTaskDetail`, `tackle.deactivateTask`, `tackle.openTaskExternal`, `tackle.copyTaskId`.
- Renamed/kept: `tackle.activateTask` (was `selectTask`), `tackle.focusSession`, `tackle.newSession`, `tackle.syncTasks`.
- Removed contributions: the two `views` entries for `tackleTaskView` and `tackleSessionView`; replaced by a single webview view.

### Configuration

- `tackle.defaultAgent` (string, default `'agency-cc'`): the Agent to auto-launch on new non-shell sessions.

## Testing Decisions

Good tests in this repo verify external behavior of a module against a public interface. The existing suites (`task-service.test.ts`, `terminal-orchestrator.test.ts`, `scope-manager.test.ts`, `session-tree-provider.test.ts`) use vitest with a local `vscode-mock.ts`; tests pass domain-level inputs and assert on the observable output of the module's public methods. Implementation details (private state, internal helper signatures, call order) are avoided.

Modules to be covered by new tests:

1. **`sidebar-state` (pure reducer)** — the highest-value suite. Every user-facing action is dispatched as an event and the resulting state is asserted against an expected shape. Tests include: toggle expand on collapsed/expanded card, enter Detail Mode from List, Back from Detail returns to List without changing `activeTaskId`, Activate button sets `activeTaskId`, closed-folder toggle, external closure moves task from open to closed set. Exhaustive coverage of state transitions; no VS Code mocks needed. Prior art: `task-service.test.ts` style — domain-level input, shape-level assertion.

2. **`render()` snapshots** — a small set of canonical states rendered to HTML and snapshot-compared. Canonical states: empty List Mode, List Mode with one Active Task + one idle task + one closed task, List Mode with an expanded card, Detail Mode with several sessions mixed states, Detail Mode with empty sessions. Snapshots catch unintended visual regressions cheaply. Prior art: none in the repo today; this is a new pattern.

3. **`session-actions`** — Stop, Restart, Mark as Done, Remove, Rename against a mocked SessionRepository and TerminalOrchestrator. Assertions: correct repo calls, correct psmux lifecycle calls, confirmation behavior for Remove-on-running. Prior art: `terminal-orchestrator.test.ts` uses a similar mocking style.

4. **`agent-registry`** — given an Agent name, returns the correct spawn command and resume flag; `tackle.defaultAgent` override is respected; unknown Agent name falls back or errors cleanly; `shell` kind bypasses the registry. Pure-function-style tests. No prior art needed.

Out of scope for testing in this PRD: the webview-side JS (DOM wiring, event delegation). We test `render()` as a pure function and trust the webview bootstrap; end-to-end webview tests can be added later if regressions surface.

Existing tests that will need updates:

- `session-tree-provider.test.ts` and `task-tree-provider.test.ts` will be **removed** along with the providers they test.
- `scope-manager.test.ts` will be updated to cover the new `workspaceState` persistence of `activeTaskId`.
- `terminal-orchestrator.test.ts` will be extended for the cwd resolution + Agent auto-launch + stop/restart methods.

## Out of Scope

These were discussed and explicitly deferred:

- **Agent State detection** — the `agent_state` column is added and the Activity Glyph UI is ready, but the actual detection logic (parsing terminal output, hooking Claude session events, wrapper protocols) is deferred. MVP ships with `agent_state` always `idle`.
- **Worktree-per-session provisioning** — `Session.worktree_path` is honored as a cwd if set; the flow that *creates* worktrees (git worktree add on first impl session, branch management, cleanup) is a separate design.
- **Plan Tracker** — the description area in Detail Mode reserves the slot (`has_plan` branch ready) but the plan tracker itself is deferred. For MVP, the area renders `Task.description` as markdown.
- **Keyboard shortcuts** — deferred until the full set of actions is known. The webview will not bind keybindings in MVP (except potentially Esc for Back, lightweight).
- **Task filter UI / pinning / saved filters** — MVP shows all open issues; closed go to the folder; filtering beyond that is future.
- **Change kind, Open worktree, Mark task complete (local), Archive task locally** — future overflow-menu items.
- **Agent Thread (`/clear`, `/branch`) history UI** — MVP captures `prior_claude_session_ids` silently; UI is future.
- **ADO integration** — the `parent_external_id` slot is added and the breadcrumb renders it when non-null, but actual ADO sync logic is separate work.
- **Layout State** — the per-task editor-area grid snapshot is a future feature; MVP persists only the structural sidebar state (mode, expanded cards, active task, closed folder).
- **Drag-to-reorder Sessions** — future.
- **Multi-task terminal visibility** — the **Attached Task** concept exists in the glossary but in MVP is always equal to the Active Task. The secondary accent color is reserved but will not render.

## Further Notes

- CONTEXT.md was rewritten to the canonical Tackle glossary prior to this PRD; it is the source of truth for terminology.
- Four ADRs were written alongside this design:
  - ADR-0005 per-session psmux
  - ADR-0006 sidebar as webview
  - ADR-0008 Active Task decoupled from Detail Mode
  - ADR-0009 default Agent + registry
- The full grilling transcript captured many decisions that are not repeated here; where this PRD is terse, CONTEXT.md and the ADRs are authoritative.
- Agency CC's CLI surface mirrors Claude Code's (`-r` / `--resume` with identical semantics); the registry adapter is trivial.
- The sidebar redesign is explicitly intended as a step toward the "single-task view with plan tracker" long-term direction. List Mode is a great task switcher; Detail Mode is where richer per-task visualization will live as Plan, Phase, and Session Loop become real.
