# Tackle

A task-scoped workspace manager for AI-assisted development, delivered as a VS Code extension. Tackle binds the windows a developer needs for a task — terminals, agent sessions, plans, reviews — into a single switchable workspace inside VS Code. When you change tasks, terminals reattach and the sidebar scopes so you're back where you left off. Session life is decoupled from session visibility: closing a VS Code terminal does not kill the underlying psmux session.

## Language

### Work structure

**Task**:
A unit of work synced from an external tracking system (GitHub Issues, ADO Work Items). The anchor for a workspace — every Session is scoped to exactly one Task. Every Task must exist in the external system; Tackle does not originate tasks.
_Avoid_: ticket, item, story

**Parent Item**:
The external-system work item that a Task is a child of — e.g., an ADO Epic, Feature, or PBI above a Task. Null for flat hierarchies (typical GitHub Issues). Surfaced in the Detail Mode breadcrumb and on line 2 of Task Cards when present. Stored as `Task.parent_external_id`.
_Avoid_: ancestor, parent work item, container

**Plan** _(Future)_:
A structured breakdown of a Task into Phases, produced by a planning session. The plan markdown file is the source of truth for content; Tackle extracts phase structure via template recognition or a silent agent call. Not in MVP — the Detail Mode description area reserves a slot for the plan tracker.
_Avoid_: roadmap, backlog

**Phase** _(Future)_:
A unit of work within a Plan. May own a git worktree and a set of Sessions. Sessions carry a nullable `phase_id` column in schema today; the UI surface is deferred.
_Avoid_: step, stage, sprint, milestone

### Sessions and terminals

**Session**:
A unit of work execution backed by exactly one psmux session and rendered as one VS Code editor-area terminal tab. Has a kind (agent or shell), a Session Status, an Agent State, and optionally a worktree. The primary workhorse concept of Tackle.
_Avoid_: terminal, pane, conversation (each refers to one facet of a Session)

**Session Kind**:
The role and behavior profile of a Session. One of: `plan`, `implement`, `review`, `debug`, `test`, `pilot`, `shell`. Determines the Activity Glyph in the card, the default Agent launch behavior, and future prompt-on-event rules. `shell` is the only kind that does not auto-launch an Agent.
_Avoid_: type, session type

**Session Status**:
The lifecycle dimension of a Session. Values: `running` (psmux alive), `completed` (finished cleanly), `stopped` (terminated by user or error). Orthogonal to Agent State.
_Avoid_: state (too ambiguous — reserved for the combined view)

**Agent State**:
The conversational-readiness dimension of a Session, meaningful when Session Status is `running`. Values: `idle` (no activity), `working` (agent producing output), `waiting` (agent has paused on a prompt, user input required). Drives the Activity Glyph. Detection is deferred post-MVP; the column is added in MVP and stays `idle` until wired.
_Avoid_: status (reserved for lifecycle)

**Agent**:
The specific coding-agent CLI backing a Session. MVP ships `agency-cc` (default, Microsoft-internal Claude wrapper with WorkIQ / ES Chat MCPs) and `claude` (vanilla Claude Code). An adapter registry maps Agent name → `{ command, resumeFlag }`. Stored as `Session.agent`.
_Avoid_: CLI, tool

**psmux Session**:
The tmux-equivalent session backing a single Tackle Session (one psmux per Session, not per Task). Session life is decoupled from visibility — disposing the VS Code terminal does not kill the psmux session; the psmux session is only killed when the Session is Stopped, Marked Done, or Removed. Survives VS Code restarts.
_Avoid_: terminal session, PTY session

**Pilot** _(Future)_:
A long-lived conversational Agent Session scoped to a Task, used for thinking and organizing rather than execution. A distinguished role, not a separate Session Kind — today encoded as `Session.kind='pilot'`. Pinned across future phase switches.
_Avoid_: controller, supervisor, orchestrator

**Worktree**:
A git worktree directory bound to a Session via `Session.worktree_path`. When non-null, New Session spawns its psmux with that path as cwd; otherwise cwd falls back to the VS Code workspace root. Worktree-per-session provisioning (the flow that creates and assigns these paths) is designed separately from the sidebar redesign.
_Avoid_: branch dir, checkout

### Task lifecycle states

**Active Task**:
The Task whose terminals are currently open in the editor area — the focal task. At most one at a time in MVP. Marked in List Mode by the primary left-edge accent bar. Entering Detail Mode on a task makes it the Active Task (opens its terminals); clicking Back does not deactivate it (editor state is independent of sidebar navigation).
_Avoid_: focused task, selected task, current task

**Attached Task** _(Secondary)_:
A Task with at least one Session whose psmux terminal is attached to a VS Code terminal. In MVP this is equivalent to the Active Task (single-task terminal visibility). Reserved as a concept for future multi-task terminal visibility; may render with a subtle secondary accent when the feature lands.
_Avoid_: live task, running task

**Viewed Task**:
Informal alias for "the Task currently rendered in Detail Mode." Always equal to the Active Task under MVP semantics (Detail Mode entry activates). Kept as a distinct concept because the two could decouple in the future (e.g., a read-only "peek" mode).
_Avoid_: detail task

### Sidebar

**Tackle Activity Bar**:
The custom Activity Bar container registered by the extension. Holds a single view: the Tackle Sidebar.
_Avoid_: nav panel

**Tackle Sidebar**:
The single `WebviewView` that replaces the previous three TreeViews (Tasks, Plan, Sessions). Has two modes and a fixed visual grammar of cards and rows. `retainContextWhenHidden: true`.
_Avoid_: tree, panel

**List Mode**:
The task-switcher mode of the Tackle Sidebar. Shows a header (counts + sync + search slot), all open-status Task Cards sorted by activity, and a Closed Issues Folder at the bottom.
_Avoid_: task list, home mode

**Detail Mode**:
The single-task mode of the Tackle Sidebar. Shows a header (Back + title + overflow), a Parent Item breadcrumb when present, an identity subhead (`#id · status · assignee`), a primary branch line, a scrollable description (markdown-rendered `Task.description`; plan-tracker slot reserved), a pinned Sessions section, and a Task Footer.
_Avoid_: task page, focus mode

**Task Card**:
The rendering of a Task in List Mode. Three-line dense format: (1) Activity Glyph + title + inline actions; (2) external-system icon + `#id` + Parent Item; (3) session rollup icons + branch — or a `+ New session` link when empty. A single-click on the body toggles expansion; a click on the title enters Detail Mode; an Activate button appears on non-Active cards; an overflow `⋯` opens the task menu.
_Avoid_: row, entry

**Session Row**:
The rendering of a Session inside an expanded Task Card or in Detail Mode's Sessions section. Single line: kind icon + `tab_label` + Activity Glyph + smart branch display + always-visible Stop icon + always-visible Mark as Done icon + overflow `⋯`. Row click attaches the terminal and activates the parent Task.
_Avoid_: session item, session line

**Task Footer**:
The bottom strip of Detail Mode. Vertical list of other Tasks sorted by activity (current Task excluded), ~5 visible with internal scroll, each row showing Activity Glyph + title + `#id`. Single-click switches Detail to that Task.
_Avoid_: quick-switcher, sibling list

**Closed Issues Folder**:
The collapsed bottom section of List Mode holding Tasks with an external status in the closed set (`closed`, `done`, `completed`, `resolved`, `removed`, case-insensitive). Expanded rows are compressed single-line (title + `#id` + closed_at); row click enters Detail Mode.
_Avoid_: archive, done folder

**Activity Glyph**:
The emoji indicating a Session's current state on a Session Row, or the highest-urgency state across a Task's Sessions on a Task Card. Vocabulary: ✳️ waiting for input, ⏳ working, ● idle attached, ○ idle detached, ✔️ completed, 🚫 stopped. Urgency priority: ✳️ > ⏳ > ● > ○ > ✔️-only > 🚫-only. No animation.
_Avoid_: dot, status icon

**Mark as Done**:
A Session Row action that sets Session Status to `completed` AND kills the underlying psmux session. One-click "work finished, clean up" — equivalent to Stop followed by a status flip. Icon is always visible on the Session Row, alongside Stop.
_Avoid_: close session, complete

### Sync and persistence

**Sync**:
Pulling tasks from the external system (GitHub Issues for MVP, ADO later) via `vscode.authentication`. Global only — no per-task sync (the external API is a single paginated call). Triggered from the List Mode header button.
_Avoid_: refresh, pull

**Workspace State**:
VS Code's per-workspace key-value store (`ExtensionContext.workspaceState`). Tackle persists: sidebar mode, expanded Task Card set, Active Task id, Closed Issues Folder expansion. Not persisted: scroll positions (webview keeps them in memory via `retainContextWhenHidden`).
_Avoid_: settings, config

### Future concepts (deferred post-MVP)

**Layout State** _(Future)_:
A per-Task snapshot of the editor-area grid shape, terminal placements, review files open in secondary groups, and focused terminal. Restoring Layout State on task switch would recreate the full editor arrangement. Not in MVP; the term is reserved.
_Avoid_: workspace state (see Workspace State above), window state

**Session Loop** _(Future)_:
A guided progression within a Phase: build → review → test. Tackle suggests the next step when the previous completes; the developer can skip, reorder, or spawn ad-hoc Sessions. Not a rigid state machine. Requires Plan/Phase to exist first.
_Avoid_: pipeline, workflow engine

**Prompt-on-Event** _(Future)_:
The automation mechanism. On Session completion or Phase transition, Tackle can automatically start a next Session with an appropriate prompt. Declarative, not a general-purpose workflow engine.
_Avoid_: automation rule, trigger

**Agent Thread** _(Future)_:
A single Claude/agent conversation thread. A Session hosts multiple Agent Threads over its lifetime as the user invokes `/clear` or `/branch`. MVP keeps 1:1 Session↔current-thread and captures history as `Session.prior_claude_session_ids` (JSON column) for later UI to mine.
_Avoid_: conversation, run

**CLI (`tackle`)** _(Future)_:
A standalone Node.js CLI that reads/writes the same SQLite DB as the VS Code extension. The interface for agents to report completion, summaries, and phase transitions back to Tackle. Not in MVP.
_Avoid_: API, SDK

## Relationships

- A **Task** is backed by exactly one external work item (GitHub Issue or ADO Work Item).
- A **Task** has zero or more **Sessions**.
- A **Task** optionally has a **Parent Item** (null for flat GitHub, populated for ADO hierarchy).
- A **Session** is backed by exactly one **psmux Session** — a one-to-one binding captured by `Session.psmux_name`.
- A **Session** has a **Session Status** (lifecycle) and an **Agent State** (conversational readiness). These are orthogonal: a `running` Session may be `idle`, `working`, or `waiting`.
- A **Session** may have a **Worktree**; if so, New Session spawns cwd there.
- The **Active Task** is the single Task whose terminals are open in the editor area. Entering **Detail Mode** on a Task makes it Active; **Back** does not deactivate.
- **List Mode** → **Detail Mode** is a mutation of the Tackle Sidebar, not a new pane. Detail Mode's **Task Footer** enables switching without returning to List Mode.
- The **Closed Issues Folder** holds Tasks whose external status is in the closed set.
- **Task Cards** and **Session Rows** share the **Activity Glyph** vocabulary — a Task Card's glyph rolls up its Sessions' states by urgency priority.
- **Sync** is global (one GitHub API call). There is no per-task Sync.
- **Mark as Done** on a Session Row both flips `status=completed` and kills the psmux session.

## Typical workflow

1. Dev opens VS Code in a repo, runs `Tackle: Activate`.
2. Tackle syncs Tasks from GitHub via `vscode.authentication`; the **Tackle Sidebar** opens in **List Mode**.
3. Dev scans the Task Cards — Activity Glyphs show which Tasks have Sessions needing attention (✳️ waiting) or in progress (⏳ working).
4. Dev clicks a Task's title → **Detail Mode**; the Task becomes the **Active Task** and its Sessions' terminals open.
5. Dev clicks `+ New session` → QuickPick for Session Kind → a new Session spawns with cwd = `worktree_path ?? workspaceRoot` and auto-launches the configured Agent (default `agency-cc`, skipped for `shell` kind).
6. Dev works in the terminal. When the agent finishes, dev clicks **Mark as Done** on the Session Row.
7. Dev clicks a row in the **Task Footer** to switch Detail to another Task. Terminals swap; the new Task becomes Active.
8. Dev clicks **Back** to return to List Mode. Editor terminals stay attached to the (still-Active) Task.

## Example dialogue

> **Dev:** "I'm in List Mode and I see a ✳️ on one of the Task Cards. What does it mean?"
> **Domain expert:** "That's the **Activity Glyph**, rolled up from the Task's Sessions. One of its Sessions is in **Agent State** `waiting` — the agent has paused on a prompt. Click the Task title to enter **Detail Mode** and you'll see which Session it is."
>
> **Dev:** "I clicked the Task and I'm in Detail Mode now. Is this Task 'active'?"
> **Domain expert:** "Yes. Entering Detail Mode makes a Task the **Active Task** and opens its Sessions' terminals in the editor area. If you click **Back**, the Task stays Active — the terminals don't close. Back is just navigation."
>
> **Dev:** "I spawned a new Session and didn't pick a worktree. Where does it run?"
> **Domain expert:** "`Session.worktree_path` is null, so cwd falls back to the VS Code workspace root. The **Agent** (default `agency-cc`) launches automatically after cd."
>
> **Dev:** "I hit **Mark as Done** on a Session. What happens?"
> **Domain expert:** "Session Status flips to `completed` and the **psmux Session** is killed. The Session Row stays visible in the Sessions section, below the divider that separates active from completed."
>
> **Dev:** "The Task I'm viewing got closed on GitHub while I had it open. What happens?"
> **Domain expert:** "The Task drops into the **Closed Issues Folder** in List Mode on the next Sync. Its Sessions keep running; no auto-stop. Detail Mode surfaces a subtle 'externally closed' indicator if Sessions are still running."

## Flagged ambiguities

- **"session"** — Tackle has one first-class **Session** type. The **Session Kind** (e.g., `shell`, `implement`) differentiates behavior; it replaces the older split between "Agent Session" and "Terminal Tab."
- **"state" vs "status"** — **Session Status** is lifecycle (`running` | `completed` | `stopped`); **Agent State** is conversational (`idle` | `working` | `waiting`). When a doc says just "state," treat it as ambiguous and ask which dimension.
- **"active" vs "attached"** — **Active Task** is singular and equals the Task currently shown in Detail Mode (or last-viewed, for accent purposes). **Attached Task** is any Task with live terminals; in MVP it's equal to the Active Task, but the concept is reserved for future multi-task terminal visibility.
- **"psmux session" granularity** — one psmux session per Tackle Session (NOT per Task). Any older doc language saying "psmux session per Task with tmux windows per Phase" is stale; see ADR-0005.
- **"Layout State"** — defined as a future concept. The MVP persistence surface is small (`workspaceState` keys), not a per-Task grid snapshot.
- **"phase"** — Plans and Phases are deferred. A `phase_id` column exists on Sessions but is always null in MVP. ADO hierarchy (Epic / Feature / PBI) is modeled separately via **Parent Item**.
- **"agent" capitalization** — capital-A **Agent** is the backing CLI (e.g., `agency-cc`). Lowercase "agent" in running prose refers to the same thing; treat as equivalent.
