# Chartroom

A task-scoped workspace manager for AI-assisted development. Chartroom binds all the windows a developer needs for a task into a single switchable workspace — terminals, agent sessions, plans, reviews — so that when you change tasks, everything rearranges. It is not a better terminal, a better issue tracker, or a novel orchestration engine. The core value is linking existing tools together per-task.

## Language

### Work structure

**Task**:
A unit of work synced from an external tracking system (GitHub Issues, ADO Work Items). The anchor for a workspace — selecting a task scopes all panel contents. Every task must exist in the external system; Chartroom does not originate tasks.
_Avoid_: ticket, item, story

**Plan**:
A structured breakdown of a Task into Phases, produced by a planning session (`/prd-to-plan`). The plan markdown file is the source of truth for content. Chartroom extracts phases into a normalized internal format for progress tracking — either via template recognition (token-free, for known patterns) or agent extraction (LLM-based, for non-standard formats).
_Avoid_: roadmap, backlog

**Phase**:
A unit of work within a Plan. Each Phase may have its own git worktree, agent sessions, and a guided build-review-test loop. Phases live in Chartroom. In future versions, a Phase may also be promoted to an external work item.
_Avoid_: step, stage, sprint, milestone

### Sessions and terminals

**Agent Session**:
A chat session in an AI developer tool (e.g. Claude Code) running in a terminal pane. Has rich conversational history, structured output, and trackable artifacts. The primary unit of work execution. Runs as a psmux pane within the task's psmux session.
_Avoid_: conversation, chat, run

**Terminal Tab**:
A non-agent terminal process (dev servers, build watchers, test runners). Displayed alongside Agent Sessions but not tracked with the same richness — no conversation history or structured output. Runs as a pane within the task's psmux session.
_Avoid_: shell, console

**psmux Session**:
A psmux (Windows tmux) session scoped to a single Task. Contains tmux windows (one per Phase, plus task-level windows). Survives Electron crashes. Switching tasks = detach current psmux session, attach target task's session. xterm.js renders the active tmux window.
_Avoid_: terminal session, PTY session

**Pilot**:
A long-lived conversational Agent Session scoped to a Task. Used for thinking, triaging, and organizing — not executing. If a Task is simple enough for a single session, that session is the Pilot. For multi-session work, the Pilot sits above and helps organize the phases.
_Avoid_: controller, supervisor, orchestrator

### Workflow

**Session Loop**:
The guided progression within a Phase: build, review, test. Chartroom suggests the next step when the previous one completes, and can trigger steps automatically via prompt-on-event. The developer can skip steps, reorder, or spawn ad-hoc sessions. Not a rigid state machine.
_Avoid_: pipeline, workflow engine, CI

**Prompt-on-Event**:
The automation mechanism. When a session completes or a phase transitions, Chartroom can automatically start the next Agent Session with an appropriate prompt. Simple and declarative — not a general-purpose workflow engine.
_Avoid_: automation rule, event handler, trigger

### UI structure

**Task Panel**:
The left panel. Shows the task list, task details, and plan visualization with phase progress. Selecting a task scopes the workspace. Selecting a phase filters within it.
_Avoid_: sidebar, nav panel

**Terminal Panel**:
The center panel. Renders the active psmux tmux window via xterm.js. Shows agent sessions and terminal tabs for the selected task/phase. One xterm.js instance connected to the current task's psmux session.
_Avoid_: console panel, shell panel

**Review Panel**:
The right panel (collapsible). A task-scoped file viewer and editor powered by Monaco. Displays plans, docs, code diffs, and can embed browser views (PRs, local builds). Automatically scoped to the selected Task and Phase. The value is that task selection controls what files are shown.
_Avoid_: editor panel, IDE panel

### Agent integration

**CLI (`cr`)**:
A standalone Node.js CLI that reads/writes the same SQLite DB as the Electron app. The primary interface for agents to communicate back to Chartroom — reporting completion, providing summaries, transitioning phases. Surfaced to agents via skills and hooks.
_Avoid_: API, SDK

## Relationships

- A **Task** is always backed by exactly one external work item (GitHub Issue or ADO Work Item)
- A **Task** has exactly one **psmux Session** (created on first interaction, survives crashes)
- A **Task** has at most one **Plan**
- A **Task** has at most one **Pilot** (an Agent Session with a distinguished role)
- A **Plan** contains one or more **Phases** in sequence
- A **Phase** maps to a tmux window within the task's **psmux Session**
- A **Phase** has zero or more **Agent Sessions** and zero or more **Terminal Tabs** (each a psmux pane)
- A **Phase** may have its own git worktree
- The **Session Loop** (build → review → test) is the guided progression within a **Phase**
- Selecting a **Task** scopes the workspace — all three panels change
- Selecting a **Phase** filters within the workspace — shows that phase's sessions/worktrees while keeping task-level items (Plan, Pilot) visible
- No phase selected = see everything for the Task
- The **CLI (`cr`)** is how Agent Sessions communicate back to Chartroom

## Typical workflow

1. Dev syncs tasks from GitHub/ADO
2. Dev selects a Task — panels scope to it, psmux session attaches
3. Dev runs a grilling/domain-modeling session (optional)
4. Dev runs `/write-a-prd` → PRD created
5. Dev runs `/prd-to-plan` → Plan with Phases extracted into Chartroom
6. For each Phase: Session Loop (build → review → test), guided by Chartroom, automated via prompt-on-event where desired
7. Ad-hoc sessions spawned as needed within any phase
8. Dev switches tasks — psmux session swaps, panels update, previous task state preserved

## Example dialogue

> **Dev:** "I just picked up a new **Task** from the backlog. What do I see?"
> **Domain expert:** "You see the **Task** details, an empty **Plan**, and the option to start a **Pilot** session or go straight into building."
>
> **Dev:** "I ran `/prd-to-plan` and got a **Plan** with three **Phases**. Now what?"
> **Domain expert:** "The plan visualization shows the three **Phases**. Click one to filter to it. You can start a build **Agent Session** for that phase — when it completes, Chartroom will suggest running a review session."
>
> **Dev:** "The review found issues. I want to spawn a quick fix session."
> **Domain expert:** "That's an ad-hoc **Agent Session** in the same **Phase**. The **Session Loop** is a guide, not a constraint."
>
> **Dev:** "I need to switch to a different **Task** to check something."
> **Domain expert:** "Click the other **Task**. The psmux session swaps, the panels update to show that task's sessions, plan, and terminals. Your previous task's state is preserved — switch back anytime."

## Flagged ambiguities

- **"session"** was used ambiguously to mean both agent chat sessions and utility terminal processes — resolved: **Agent Session** (tracked, rich history) vs **Terminal Tab** (utility, minimal tracking).
- **"phase" vs external hierarchy** — Phases are local to Chartroom's Plan. ADO's Epic/Feature/PBI/Task hierarchy is separate. In future, a Phase may be promoted to an external work item, but for MVP they are independent. ADO hierarchy sync is a future enhancement.
- **"workspace"** — not a separate persisted concept. "Workspace" is the implicit UI state when a Task is selected. No layout state is stored independently.
- **"plan format"** — Plans are free-form markdown from `/prd-to-plan`. Chartroom extracts phase structure via template recognition or agent extraction. No single standardized plan schema is enforced.
