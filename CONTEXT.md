# Tackle

A task-scoped workspace manager for AI-assisted development, delivered as a VS Code extension. Tackle binds the windows a developer needs for a task — terminals, agent sessions, plans, reviews — into a single switchable workspace inside VS Code. When you change tasks, terminals reattach and the sidebar scopes so you're back where you left off. Session life is decoupled from session visibility: closing a VS Code terminal does not kill the underlying psmux session.

## Language

### Work structure

**Task**:
A unit of work synced from an external tracking system (GitHub Issues, ADO Work Items). The anchor for a workspace — every Session is scoped to exactly one Task (except the Pilot, which is workspace-global). Every Task must exist in the external system; Tackle does not originate tasks. Carries two orthogonal status dimensions: an **External Status** (mirror of the external work item's open/closed state) and a **Tackle Status** (Plan-first lifecycle).
_Avoid_: ticket, item, story

**Parent Item**:
The external-system work item that a Task is a child of — e.g., an ADO Epic, Feature, or PBI above a Task. Null for flat hierarchies (typical GitHub Issues). Surfaced in the Detail Mode breadcrumb and on line 2 of Task Cards when present. Stored as `Task.parent_external_id`. Tackle does not model Epics/themes as a first-class tier; the Parent Item is read-only context surfaced from the external tracker.
_Avoid_: ancestor, parent work item, container

**Tackle Status** _(Future)_:
The Plan-first lifecycle of a Task, orthogonal to External Status. Forward-only progression (does not regress on re-planning):
`not_started` → `plan_started` (a `plan` Session has been opened) → `plan_awaiting_approval` (Phases exist as external child items in the tracker; ready for human gate) → `plan_approved` (user clicked Approve Plan) → `implementation_started` (any Phase moved out of `not_started`) → `in_review` (all Phases are `complete`; agent-driven cross-Task verification underway, **not** PR review) → `pr_created` → `merged`. Stored as `tasks.tackle_status`. Every transition is dispatched through the Event Bus; nothing writes the column directly. `pr_created → merged` is a thin mirror of the external PR's lifecycle — Tackle does not model PR internals (CI, reviews, approvals). Manual acceptance testing is intentionally not modeled. Re-planning after `plan_awaiting_approval` does not regress the Task; new Phases enter at `not_started` and surface in the Phase Tracker as net-new.
_Avoid_: status, state, lifecycle (each ambiguous on its own)

**External Status**:
A Task's open/closed state in the external tracker, mirrored by Tackle on Sync. Drives Closed Issues Folder placement. Stored as `tasks.external_status`. Updated only via Event Bus events synthesized by Sync; Tackle never writes the column directly. Orthogonal to Tackle Status.
_Avoid_: status, state

**Plan** _(Future)_:
A Task's decomposition into Phases, materialized as child work items in the external tracker (GitHub sub-issues, ADO child items). The external hierarchy is the durable source of truth for Phase identity; Tackle's `plans` / `phases` tables are a local mirror. Every Plan is anchored to a **Plan Source** — a Task without a Plan Source cannot have a Plan. Phase issues are created by the planning skill (e.g., `/to-issues`) directly via the GitHub API; Tackle does not write to the external tracker to materialize Phases. Plan Discovery (a read-only pass on every Sync) reflects external children into the local mirror. Tackle is built for a plan-first workflow.
_Avoid_: roadmap, backlog

**Plan Source** _(Future)_:
The authoritative narrative a Plan is derived from. One of: (a) a markdown file in the Task's worktree, conventionally under `plans/`, produced by `/domain-model` → `/write-a-prd` → `/to-issues`; (b) the Task's external issue itself when its description contains the plan narrative. Stored as `plans.source_kind` + `plans.source_ref`. Required for a Plan to exist. Surfaced in the Phase Tracker header as a clickable link as soon as Discovery detects it. Tackle does not parse the Source for Phase content — that's the planning skill's job.
_Avoid_: plan doc, PRD (these are instances, not synonyms)

**Phase** _(Future)_:
A unit of work within a Plan, backed 1:1 by a child work item in the external tracker (GitHub sub-issue, ADO child). May scope a set of Sessions via `sessions.phase_id`. Phases do not own a worktree — they inherit the Task's worktree under ADR-0011. Phase status progresses `not_started → implementing → reviewing → complete`, dispatched through the Event Bus. `reviewing` is unattended agent verification of the Phase's output and provides the hook for future Session Loop automation. Phases may declare dependencies on other Phases via the `phase_dependencies` join table; execution respects this DAG (sub-agents work unblocked Phases in parallel) but the **Phase Tracker UI renders Phases as a flat vertical list ordered by `sort_order`** — the DAG is not visualized. A separate `test` activity is intentionally not modeled at the Phase level; TDD-driven implementation runs tests inline.
_Avoid_: step, stage, sprint, milestone

### Sessions and terminals

**Session**:
A unit of work execution backed by exactly one psmux session and rendered as one VS Code editor-area terminal tab. Has a kind (agent or shell), a Session Status, an Agent State, and optionally a worktree. The primary workhorse concept of Tackle.
_Avoid_: terminal, pane, conversation (each refers to one facet of a Session)

**Session Kind**:
The role and behavior profile of a Session. One of: `plan`, `implement`, `review`, `debug`, `test`, `pilot`, `shell`. Determines the Activity Glyph in the card, the default Agent launch behavior, and future prompt-on-event rules. `shell` is the only kind that does not auto-launch an Agent. Phase scoping (`Session.phase_id`) is kind-aware: `plan`, `pilot`, `shell` are always Task-scoped (`phase_id = null`); `implement` is always Phase-scoped (required when Phases exist) and is predominantly machine-spawned via the Implement Action — manual creation is supported but exceptional; `review`, `debug`, `test` are scope-flexible — the New Session QuickPick offers "Whole Task" as the first option followed by Phases, defaulting to Whole Task.
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
A long-lived, **workspace-global** conversational Agent Session — Tackle's chat interface to the workspace itself. Used for triage ("what should we work on?"), backlog reasoning, repo setup ("set up Tackle for this repo"), config walkthroughs, plan-discrepancy resolution, and any free-form "talk to me about my project" interaction that would otherwise need a dedicated UI or Command Palette entry. Singleton per workspace; not Task-scoped. Created eagerly on `Tackle: Activate` (its row is ensured to exist whenever the workspace is in Tackle Mode); the backing psmux session is spawned lazily on first attach. Modeled as an ordinary row in the `sessions` table with `kind='pilot'` and `task_id IS NULL`, uniqueness enforced by a partial index `WHERE kind='pilot'`. It reuses Session-Kind machinery (Activity Glyph, Agent State, psmux backing, `Mark as Done`) — Pilot-ness is purely a kind discriminator. Notifications addressed to the Pilot live in a separate **Pilot Inbox** table; the Pilot row itself does not carry them.
_Avoid_: controller, supervisor, orchestrator

**Pilot Inbox** _(Future)_:
A queue of notifications dispatched to the Pilot by the Event Bus (e.g., Plan Discovery finds an external Phase with no Source heading; a Task is closed externally while Sessions are running). Backed by a `pilot_inbox` table with status `unread | read | dismissed`. Read and dismissed via the Tackle CLI; written only by Event Bus handlers, never directly.
_Avoid_: pilot notifications, alerts

**Tackle Skill** _(Future)_:
A Claude Code skill (a packaged set of agent instructions + companion docs, loaded on demand) that teaches an Agent how to use the `tackle` CLI and Tackle's domain. Installed into every Session's worktree by the extension at Session creation time, alongside the **Standing Orders** in CLAUDE.md. The Pilot's agent file/prompt is what makes the Pilot _rely_ on the skill for its conversational repertoire (triage, repo setup, config walkthroughs); other Session Kinds have the skill available but their prompts steer them toward narrower jobs. Skill scoping by Session Kind (e.g., not loading review-specific skills into an `implement` Session) is a future optimization for token-footprint reasons, not a security boundary — the CLI is the single source of authority and is identical for all callers.
_Avoid_: tool, plugin, MCP server (Tackle deliberately does not use MCP for the agent surface; skills win on ergonomics and token footprint)

**Pilot Tab** _(Future)_:
The Pilot's editor tab in **Editor Group 1** (Terminal Zone). Pinned and leftmost — always visible while Tackle Mode is on, never disposed by task-switching. Task-switch logic that disposes/reattaches Active Task terminals explicitly skips the Pilot Tab. The Pilot's psmux session is spawned lazily on first attach with cwd = workspace root (no dedicated worktree — the Pilot operates directly on the user's working tree, since its job is workspace-level setup, triage, and config, not isolated feature work). The tab itself is ensured to exist on `Tackle: Activate`.
_Avoid_: pilot pane, pilot window

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
The single-task mode of the Tackle Sidebar. Shows a header (Back + title + overflow), a Parent Item breadcrumb when present, an identity subhead (`#id · status · assignee`), a primary branch line, a scrollable description (markdown-rendered `Task.description`; the **Phase Tracker** occupies the reserved slot at the top of this region when the Task has a Plan), a pinned Sessions section, and a Task Footer.
_Avoid_: task page, focus mode

**Task Card**:
The rendering of a Task in List Mode. Three-line dense format: (1) Activity Glyph + title + inline actions; (2) external-system icon + `#id` + Phase progress chip (`[n/total]`, only when Phases exist) + Parent Item; (3) session rollup icons + branch — or a `+ New session` link when empty. A single-click on the body toggles expansion; a click on the title enters Detail Mode; an Activate button appears on non-Active cards; an overflow `⋯` opens the task menu.
_Avoid_: row, entry

**Session Row**:
The rendering of a Session inside an expanded Task Card or in Detail Mode's Sessions section. Single line: kind icon + `tab_label` + Activity Glyph + Phase chip (when `phase_id` is non-null) + smart branch display + Stop icon + Mark as Done icon + overflow `⋯`. Action button visibility is **surface-dependent**: in **expanded-in-list** rows (under an expanded Task Card in List Mode) the Stop / Mark as Done / overflow icons are **always visible** — the row itself is already a hover-revealed surface, so further hover-gating would be unfindable. In **Detail Mode** rows the same buttons are **hidden by default and fade in on row hover** (120 ms ease-out, instant under `prefers-reduced-motion`); Detail Mode rows render as full-width pills (`border-radius 12px`, `4px × 10px` padding). Row click attaches the terminal and activates the parent Task.
_Avoid_: session item, session line

**Task Footer**:
The bottom strip of Detail Mode. Vertical list of other Tasks sorted by activity (current Task excluded), ~5 visible with internal scroll, each row showing Activity Glyph + title + `#id`. Single-click switches Detail to that Task.
_Avoid_: quick-switcher, sibling list

**Closed Issues Folder**:
The collapsed bottom section of List Mode holding Tasks with an external status in the closed set (`closed`, `done`, `completed`, `resolved`, `removed`, case-insensitive). Expanded rows are compressed single-line (title + `#id` + closed_at); row click enters Detail Mode.
_Avoid_: archive, done folder

**Activity Glyph**:
The emoji indicating a Session's current state on a Session Row, or the highest-urgency state across a Task's Sessions (and unacknowledged Phase errors) on a Task Card. Vocabulary: ⚠️ error / unexpected halt, ✳️ waiting for input, ⏳ working, ● idle attached, ○ idle detached, ✔️ completed, 🚫 stopped. ⚠️ is also produced when an `implement` Session enters Agent State `waiting` — implement Sessions should not need user input if the plan, Phases, and prompts are aligned, so a wait is treated as a failure signal. ⚠️ from a *currently waiting* implement Session is live (clears when the Session moves out of `waiting`); ⚠️ from a historical error (Phase has `last_error_at > error_acknowledged_at`) is sticky until the user dismisses it. Urgency priority: ⚠️ > ✳️ > ⏳ > ● > ○ > ✔️-only > 🚫-only. No animation.
_Avoid_: dot, status icon

**Mark as Done**:
A Session Row action that sets Session Status to `completed` AND kills the underlying psmux session. One-click "work finished, clean up" — equivalent to Stop followed by a status flip. Icon is always visible on the Session Row, alongside Stop.
_Avoid_: close session, complete

### Sync and persistence

**Sync**:
Pulling tasks (and, when Plan Discovery is built, sub-issues / labels) from the external system (GitHub Issues for MVP, ADO later) via `vscode.authentication`. Global only — no per-task sync. Triggered from the List Mode header button.
_Avoid_: refresh, pull

**Workspace State**:
VS Code's per-workspace key-value store (`ExtensionContext.workspaceState`). Tackle persists: sidebar mode, expanded Task Card set, Active Task id, Closed Issues Folder expansion. Not persisted: scroll positions (webview keeps them in memory via `retainContextWhenHidden`).
_Avoid_: settings, config

### Future concepts (deferred post-MVP)

**Event Bus** _(Future)_:
The single API surface for status transitions on Tasks and Phases, and for cross-cutting notifications. A synchronous in-process `dispatch(event)` function with a typed event union and a handler registry. Every status mutation — Tackle Status, Phase Status, External Status — flows through the bus; nothing writes those columns directly. Sources include Sync (synthesizing events from external state diffs), the future Tackle CLI, the Sidebar UI, and future skill hooks. Each handler validates the transition, mutates the relevant row, writes an audit row to the `events` table, and signals the webview to refresh. Future behaviors (Prompt-on-Event #56, Session Loop #55, Implement Action) extend handlers, not callers — the caller never knows about downstream effects. The `events` table is an audit log; the live state lives in `tasks` / `phases` columns.
_Avoid_: event queue, message bus (the bus is synchronous and in-process, not asynchronous)

**Plan Discovery** _(Future)_:
The read-only walker that runs on every Sync. Walks the Task's external children (GitHub sub-issues and task-list refs, ADO child items) and reflects them into the local `phases` table — creating, updating, and removing rows to match the external truth. Also detects whether a Plan Source exists (markdown file under `plans/<external-id>*.md` in the worktree, or Phase-shaped content in the Task's issue body) and records `plans.source_kind` / `plans.source_ref`. Pure read on the external side; never writes to GitHub/ADO. When a discovered external Phase has no matching Plan Source heading, Discovery records a `pilot_notifications` entry and the Phase row gets an inline "no source" chip the user can acknowledge.
_Avoid_: plan parser, plan sync

**Status Label Projection** _(Future)_:
The mechanism by which Tackle Status (Task-level) and Phase Status (Phase-level) are mirrored to the external tracker as labels on the backing work items. **Bidirectional**: Tackle writes labels as transitions fire, and reads labels back on every Sync — externally-applied label changes synthesize events into the Event Bus, so a teammate clicking a label in the GitHub UI flows through the same pipeline as an in-Tackle action. Mutex-enforced within each dimension (a Task carries at most one configured Task-status label; a Phase carries at most one configured Phase-status label). Idempotent: incoming label-derived events that match local state are no-ops. **Opt-in**: projection no-ops entirely when `.tackle/config.json` does not include a label mapping. Configuration via the `Tackle: Configure Labels` Command Palette command, which inspects the repo's existing labels, generates a comment-rich config, and opens it in the editor for review. Label naming is **per-repo configurable**; states can be mapped to `null` to skip; the `tackle:` prefix is a fallback used only when an existing label means something different.
_Avoid_: status labels (ambiguous), label sync

**Phase Tracker** _(Future)_:
The Detail Mode UI for a Task's Plan, occupying the reserved slot at the top of the Description region (above the markdown-rendered `Task.description`). Renders a flat vertical list of Phases ordered strictly by `sort_order`; the underlying Phase DAG is not visualized. Header shows the Tackle Status badge, a clickable Plan Source link (when detected), a Task-level progress bar (proportion of Phases at `complete`), and the state-appropriate primary action button (`[+ Create Plan]` / `[Open Plan Session →]` / `[Approve Plan]` / `[Approve Plan and Implement]` / `[Implement]`). Each Phase row shows: status glyph + Phase title + `#id` link to the external child item + a row of **Phase Activity Lights** + an optional "no source" chip (acknowledgable) + an "Acknowledge errors" affordance when `last_error_at > error_acknowledged_at`. Clicking a Phase title scrolls the Sessions section to Sessions scoped to that Phase. List Mode Task Cards gain a `[n/total]` progress chip on line 2 when Phases exist; the rolled-up Activity Glyph also surfaces ⚠️ for unacknowledged Phase errors (sticky until dismissed).
_Avoid_: plan widget, phase list

**Phase Activity Light** _(Future)_:
A single status indicator per (Phase, agent activity) pair, rendered next to the Phase title in the Phase Tracker. Reuses the Activity Glyph vocabulary — when an activity has an owning Session, the light is the Session's current Activity Glyph (⚠️/✳️/⏳/●/○/✔️/🚫); when no Session has yet been spawned for that activity, the light is ○ (idle detached). The light is a clickable link to its **owning Session**. Activities are derived from the Phase status progression: the `implement` light tracks `implementing`; the `review` light tracks `reviewing`. A separate `test` light is intentionally not modeled — TDD-driven implementation runs tests inline.
_Avoid_: traffic light, phase pill

**Implement Action** _(Future)_:
A Detail Mode action on a Task with `plan_approved` status that kicks off implementation by spawning `implement` Sessions across the Phase DAG. Sessions are spawned strictly for Phases whose dependencies are `complete`; as Phases finish, downstream Sessions are spawned automatically via the same evaluator. Idempotent on re-click — only spawns Sessions for Phases that don't currently have a running `implement` Session. The button label is **`[Approve Plan and Implement]`** at `plan_awaiting_approval` when `tackle.implement.autoStartOnApprove = true` (combining Approve + Implement into one click); otherwise `[Approve Plan]` at `plan_awaiting_approval` and `[Implement]` at `plan_approved`. Driven by the Event Bus: `task.plan_approved` (with autoStart) → spawn unblocked Phase Sessions; each `phase.completed` → re-evaluate and spawn newly unblocked.
_Avoid_: run plan, kickoff, execute

**Pilot Notifications** _(Future)_:
A minimal queue table (`pilot_notifications`) that handlers write to and the Pilot will eventually consume. Sources include: Plan Discovery discrepancies (external Phase without Plan Source heading), External Status changes while Sessions are running, Phase errors. Acknowledgment writes a `acknowledged_at` timestamp; idempotent on re-detection. UI surfaces are inline (chips on Phase rows, subtle Detail Mode indicators) — not toasts — so Sync is never noisy. The Pilot's own consumer / dismiss UX is deferred to the Tackle CLI work (#52).
_Avoid_: notification, alert

**Layout State** _(Future)_:
A per-Task snapshot of the editor-area grid shape, terminal placements, review files open in secondary groups, and focused terminal. Restoring Layout State on task switch would recreate the full editor arrangement. Not in MVP; the term is reserved.
_Avoid_: workspace state (see Workspace State above), window state

**Session Loop** _(Future)_:
A guided progression within a Phase: build → review → test. Tackle suggests the next step when the previous completes; the developer can skip, reorder, or spawn ad-hoc Sessions. Not a rigid state machine. Requires Plan/Phase to exist first.
_Avoid_: pipeline, workflow engine

**Prompt-on-Event** _(Future)_:
The automation mechanism. On Session completion or Phase transition, Tackle can automatically start a next Session with an appropriate prompt. Declarative, not a general-purpose workflow engine. Implemented as additional handlers on the Event Bus.
_Avoid_: automation rule, trigger

**Agent Thread** _(Future)_:
A single Claude/agent conversation thread. A Session hosts multiple Agent Threads over its lifetime as the user invokes `/clear` or `/branch`. MVP keeps 1:1 Session↔current-thread and captures history as `Session.prior_claude_session_ids` (JSON column) for later UI to mine.
_Avoid_: conversation, run

**CLI (`tackle`)** _(Future)_:
A standalone Node.js CLI that reads/writes the same SQLite DB as the VS Code extension. The interface for agents to dispatch Event Bus events from outside the extension process — reporting completion, summaries, dismissing notifications, advancing Phase status. Not in MVP.
_Avoid_: API, SDK

**CLI Invocation Context** _(Future)_:
The set of identifiers the `tackle` CLI uses to know which workspace, Session, Task, and Phase it is acting on, without the agent having to pass them explicitly on every call. Provided via env vars injected by the extension at psmux spawn time: `TACKLE_DB` (absolute path to `tackle.db`), `TACKLE_SESSION_ID`, `TACKLE_TASK_ID`, `TACKLE_PHASE_ID`, `TACKLE_WORKTREE_ROOT`. Each is overridable via an explicit flag (`--db`, `--session`, etc.) for human use and tests. `TACKLE_DB` falls back to a cwd-walk for `.tackle/tackle.db`; commands that require Session context error out cleanly if neither env nor flag is set.
_Avoid_: CLI environment, CLI config

**CLI Command Surface** _(Future)_:
The set of `tackle` subcommands shipped by issue #52, partitioned by side-effect class.

_Read (pure DB queries)_: `task list`, `task show`, `session list`, `session show`, `phase list`, `phase show`, `plan show`, `pilot inbox list`, `config show`.

_Write (each dispatches an Event Bus event in-process via the shared library)_: `task status`, `session complete`, `session summary`, `phase update`, `pilot inbox read`, `pilot inbox dismiss`.

_Setup / introspection_: `init` (scaffold `.tackle/`), `config set`, `doctor`.

_Explicitly out of scope for #52, deferred_: `sync` (Sync stays extension-owned), `session new` (requires psmux/extension coordination), and any command that talks to GitHub/ADO directly. External-tracker mutation is the perview of dedicated GitHub/ADO skills the agent loads independently — the Tackle Skill never reaches into the external tracker.
_Avoid_: API endpoints, RPC surface

## Relationships

- A **Task** is backed by exactly one external work item (GitHub Issue or ADO Work Item).
- A **Task** has zero or more **Sessions**.
- A **Task** optionally has a **Parent Item** (null for flat GitHub, populated for ADO hierarchy). Tackle does not model the Parent Item tier as first-class — it is read-only context.
- A **Task** has two orthogonal status dimensions: **External Status** (mirrored from the tracker) and **Tackle Status** (Plan-first lifecycle). _(Future)_
- A **Task** has at most one **Plan**; a Plan has one or more **Phases**. _(Future)_
- A **Plan** is anchored to exactly one **Plan Source** (markdown file or external issue body). _(Future)_
- A **Phase** is backed 1:1 by a child work item in the external tracker; the external hierarchy is the source of truth for Phase identity. _(Future)_
- **Phases** declare execution dependencies via the `phase_dependencies` join table (a DAG). The Phase Tracker UI does not visualize the DAG — it renders Phases linearly by `sort_order`. _(Future)_
- A **Session** is backed by exactly one **psmux Session** — a one-to-one binding captured by `Session.psmux_name`.
- A **Session** has a **Session Status** (lifecycle) and an **Agent State** (conversational readiness). These are orthogonal: a `running` Session may be `idle`, `working`, or `waiting`.
- A **Session** may have a **Worktree**; if so, New Session spawns cwd there.
- A **Session**'s `phase_id` is constrained by **Session Kind**: `plan` / `pilot` / `shell` are always Task-scoped (null); `implement` is Phase-scoped when Phases exist; `review` / `debug` / `test` are scope-flexible.
- The **Pilot** is workspace-global, not Task-scoped — exactly one per workspace; receives Event Bus notifications. _(Future)_
- The **Active Task** is the single Task whose terminals are open in the editor area. Entering **Detail Mode** on a Task makes it Active; **Back** does not deactivate.
- **List Mode** → **Detail Mode** is a mutation of the Tackle Sidebar, not a new pane. Detail Mode's **Task Footer** enables switching without returning to List Mode.
- The **Closed Issues Folder** holds Tasks whose external status is in the closed set.
- **Task Cards** and **Session Rows** share the **Activity Glyph** vocabulary — a Task Card's glyph rolls up its Sessions' states by urgency priority, plus an unacknowledged Phase error sticky flag.
- **Sync** is global (one GitHub API call). There is no per-task Sync today; the global call is fast enough.
- **Mark as Done** on a Session Row both flips `status=completed` and kills the psmux session.
- All status transitions on **Tasks** and **Phases** flow through the **Event Bus**; nothing writes status columns directly. _(Future)_

## Typical workflow

1. Dev opens VS Code in a repo, runs `Tackle: Activate`.
2. Tackle syncs Tasks from GitHub; the **Tackle Sidebar** opens in **List Mode**.
3. Dev clicks a Task's title → **Detail Mode**; the **Phase Tracker** at the top of the Description region renders. For a fresh Task, it shows `[+ Create Plan]` and `[Link existing plan…]`.
4. Dev clicks `[+ Create Plan]` → spawns a `plan` Session. Tackle Status advances to `plan_started`.
5. Dev runs `/domain-model` → `/write-a-prd` → `/to-issues` in the plan Session. The skill creates Phase issues directly via the GitHub API, with parent-child links to the Task.
6. Dev clicks the global Sync button (or it auto-fires). Plan Discovery picks up the new sub-issues; Phase rows appear. Tackle Status advances to `plan_awaiting_approval`.
7. Dev (or PM, peer reviewer) clicks `[Approve Plan]`. Tackle Status advances to `plan_approved`.
8. Dev clicks `[Implement]`. Implement Action spawns `implement` Sessions for unblocked Phases. As Phases complete, downstream Sessions auto-spawn.
9. When all Phases are `complete`, Tackle Status advances to `in_review`. Dev spawns Whole-Task `review` Sessions.
10. Dev opens a PR. External tooling (CI, review) takes over; Tackle mirrors `pr_created` → `merged` from the external PR's lifecycle.

## Example dialogue

> **Dev:** "I'm in List Mode and I see a ⚠️ on one of the Task Cards. What does it mean?"
> **Domain expert:** "That's the **Activity Glyph**. ⚠️ means at least one **Phase** on that Task has had an error you haven't acknowledged, OR an `implement` Session is currently waiting for input (which is a failure signal for that kind). Click into Detail Mode and look at the Phase Tracker — the offending Phase row will show the source."
>
> **Dev:** "I authored a plan markdown file but the Phase Tracker still shows the empty state."
> **Domain expert:** "Tackle's **Plan Discovery** detects Plan Sources on Sync, but the Tracker only renders Phase rows once Phase issues exist in GitHub. Run `/to-issues` in your plan Session — the skill will create the issues, then on next Sync the rows will appear and Tackle Status advances to `plan_awaiting_approval`."
>
> **Dev:** "Why is the button at `plan_awaiting_approval` saying 'Approve Plan and Implement'?"
> **Domain expert:** "You've got `tackle.implement.autoStartOnApprove = true` in your `.tackle/config.json`. That collapses the two-click flow (Approve, then Implement) into one button. Click once, the Plan is approved AND the Implement Action runs. If you turn the setting off, you'll see two separate buttons."
>
> **Dev:** "I just clicked Implement and three Sessions spawned, but my Plan has seven Phases."
> **Domain expert:** "Implement Action only spawns Sessions for Phases whose dependencies are `complete`. The other four are blocked by the three you just started. As they finish, downstream Sessions auto-spawn — you don't need to click again. If you want to start a blocked one manually, use New Session → `implement` → 'Show all Phases'."

## Flagged ambiguities

- **"session"** — Tackle has one first-class **Session** type. The **Session Kind** (e.g., `shell`, `implement`) differentiates behavior; it replaces the older split between "Agent Session" and "Terminal Tab."
- **"state" vs "status"** — **Session Status** is lifecycle (`running` | `completed` | `stopped`); **Agent State** is conversational (`idle` | `working` | `waiting`); **Tackle Status** is the granular Task lifecycle; **External Status** mirrors the tracker's open/closed; **Phase Status** is the Phase progression. When a doc says just "state" or "status," treat it as ambiguous and ask which dimension.
- **"active" vs "attached"** — **Active Task** is singular and equals the Task currently shown in Detail Mode (or last-viewed, for accent purposes). **Attached Task** is any Task with live terminals; in MVP it's equal to the Active Task, but the concept is reserved for future multi-task terminal visibility.
- **"psmux session" granularity** — one psmux session per Tackle Session (NOT per Task). Any older doc language saying "psmux session per Task with tmux windows per Phase" is stale; see ADR-0005.
- **"Layout State"** — defined as a future concept. The MVP persistence surface is small (`workspaceState` keys), not a per-Task grid snapshot.
- **"phase"** — Plans and Phases are deferred. A `phase_id` column exists on Sessions but is always null in MVP. ADO hierarchy (Epic / Feature / PBI) is modeled separately via **Parent Item** and is _not_ Tackle's notion of Phase. _(Future)_ Phases are children of a Task in the external tracker, not lifecycle steps.
- **"parent item" vs "parent task"** — **Parent Item** is the external tracker's parent of the Task (Epic / Feature / PBI in ADO; null in flat GitHub). It is _not_ the Task itself relative to its Phases. When discussing Phase ownership, the parent is the **Task**, not the Parent Item.
- **"materialize"** — earlier designs had Tackle creating Phase issues itself ("Plan Materialization"). That role now belongs to the planning skill (`/to-issues`), which calls the GitHub API directly. Tackle never writes to the external tracker to create Phases. Plan Discovery (read-only, on Sync) is the only Tackle-side parsing.
- **"Pilot scope"** — capital-P **Pilot** is **workspace-global**, not Task-scoped. Earlier definitions describing the Pilot as "scoped to a Task" / "pinned across phase switches" are stale; the global redefinition is pending finalization in the Tackle CLI work (#52).
- **"plan_complete"** — was an earlier proposed Tackle Status state; **dropped** before locking the lifecycle. The states between `plan_started` and `plan_approved` are: just `plan_awaiting_approval`. Detection of a Plan Source does not advance Tackle Status; only Phase rows existing locally does.
- **"agent" capitalization** — capital-A **Agent** is the backing CLI (e.g., `agency-cc`). Lowercase "agent" in running prose refers to the same thing; treat as equivalent.
