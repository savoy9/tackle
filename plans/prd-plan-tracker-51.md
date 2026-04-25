## Problem Statement

A developer using Tackle today can plan a Task and create Sessions to work on it, but the tool has no model of *what stage of the work* the Task is in or *how the work decomposes*. Plans live in markdown docs in `./plans/`, child issues live in GitHub, and the developer (or their agent) holds the mapping between them in their head. When several agents are working in parallel — one in TDD on Phase A, one reviewing Phase B — the Detail Mode sidebar can show their Sessions but cannot show *which slice of the plan* each Session is touching, *what is blocking what*, or *whether the agent run for Phase B finished cleanly or halted unexpectedly*. There is no externalized status either: a teammate looking at the GitHub issue board cannot tell that Tackle is mid-implementation on a Task; a PM cannot mark a plan "approved" outside of Tackle and have implementation kick off.

The result is that the plan-first workflow Tackle is built around (`/domain-model` → `/write-a-prd` → `/to-issues` → parallel implementation by sub-agents) is well-supported in the conversation but invisible in the tool — the place that ought to be the dashboard for plan execution is just a Session list.

## Solution

Populate the plan-tracker slot reserved at the top of Detail Mode with a Phase Tracker UI that renders the Task's Phases as a flat vertical list ordered by `sort_order`. Each Phase row shows its title, a link to its backing external child item, and a row of Phase Activity Lights (one per agent activity: `implement`, `review`) that surface the live state of the owning Session using the existing Activity Glyph vocabulary — extended with a new ⚠️ glyph for errors and for `implement` Sessions that unexpectedly halt for user input.

Underpin the tracker with a unified Event Bus through which every Task and Phase status transition flows. Add two orthogonal status dimensions to the Task: an External Status (mirror of the tracker's open/closed) and a Tackle Status describing the plan-first lifecycle:

`not_started → plan_started → plan_awaiting_approval → plan_approved → implementation_started → in_review → pr_created → merged`

Approve Plan is the **human gate post-Materialization** — the moment a Plan has been broken down into external child items and is ready for development. Implement is the post-gate "go" action that fans out across the Phase DAG.

Tackle does not write to the external tracker to create Phase issues. The planning skill (`/to-issues`) creates issues directly via the GitHub API; Tackle's Plan Discovery (read-only, on every Sync) reflects them into the local mirror. This is a meaningful simplification from earlier proposed designs that had Tackle running a "Plan Materialization" parser/writer.

Project Tackle Status and Phase Status to the external tracker as labels — bidirectionally and opt-in, so a teammate adding `plan-approved` in the GitHub UI flows through the same handler pipeline as the in-Tackle button. Adopt the repo's existing label convention rather than imposing a `tackle:` prefix. Surface unacknowledged Phase errors as a sticky ⚠️ on the Task Card glyph in List Mode and a `[n/total]` Phase progress chip on Task Card line 2.

## User Stories

1. As a developer planning a new feature, I want to see the Detail Mode of a Task without a Plan and have a clear "no plan yet" state with `[+ Create Plan]` and `[Link existing plan…]` buttons, so that I can start planning with one click.
2. As a developer with a plan Session already open, I want the empty-state to show `[Open Plan Session →]` so I can resume planning, plus `[Link existing plan…]` for the case where I'm pointing at an old doc.
3. As a developer who has just written a PRD in `plans/<external-id>-<slug>.md`, I want Tackle to detect that file as my Task's Plan Source automatically on the next Sync, so that I do not have to point the tool at it manually.
4. As a developer whose Plan narrative lives in the issue body itself, I want Tackle to recognize the issue as the Plan Source, so that lightweight planning workflows are supported.
5. As a developer with a detected Plan Source, I want the Phase Tracker header to show the source as a clickable link, so I can verify what Tackle is tracking.
6. As a developer, I want Plan Source detection to be informational only (no Tackle Status change), so that detection happening before Phases exist doesn't prematurely move the lifecycle.
7. As a developer running `/to-issues`, I want the skill itself to create Phase issues directly via the GitHub API (not Tackle), so that I keep refinement interactivity in the agent conversation rather than in a Tackle dialog.
8. As a developer, I want Tackle Status to advance to `plan_awaiting_approval` automatically the moment Phase rows exist in the local DB (mirrored from external children), so that no extra click is needed after `/to-issues` completes.
9. As a developer working with a teammate, I want the teammate's manually-created sub-issue (one not in my Plan Source) to show up as a first-class Phase in my tracker with a "no source" chip I can acknowledge, so that the tracker reflects the truth of the external system without nagging me forever.
10. As a developer, I want a Pilot notification recorded when Plan Discovery finds an external Phase with no Source heading, so that there is a durable record even if I dismiss the inline chip.
11. As a developer with a Plan, I want to see my Phases as a vertical list ordered by my authoring order, so that the tracker matches how I conceptualized the breakdown.
12. As a developer with a DAG of dependencies between Phases, I want execution to respect the DAG (sub-agents work unblocked Phases in parallel) but I do *not* want the UI to visualize the DAG, so that the Detail Mode stays vertical and uncluttered.
13. As a developer, I want each Phase row to show separate status lights for `implement` and `review` activities, so that I can see at a glance which activity is active or has failed.
14. As a developer, I want clicking a Phase Activity Light to take me to the owning Session's terminal, so that I can investigate what the agent is doing.
15. As a developer running TDD-driven implementation, I do *not* want a separate `test` activity light per Phase, because TDD runs tests inline within the implement loop.
16. As a developer or PM, I want a one-click `[Approve Plan]` button at `plan_awaiting_approval` that just flips the lifecycle, with no preview dialog, so that the human gate is lightweight.
17. As a power-user developer who wants approve-and-go in one click, I want to set `tackle.implement.autoStartOnApprove = true` and have the button relabel to `[Approve Plan and Implement]`, so that the optional automation is honest about what it does.
18. As a developer, I want to click `[Implement]` on a Task at `plan_approved` and have Tackle spawn `implement` Sessions for every unblocked Phase, so that I do not start each Phase manually.
19. As a developer, I want subsequent Phases to spawn automatically when their dependencies complete, so that the DAG executes end-to-end without my intervention.
20. As a developer, I want the Implement button to be idempotent on re-click — if I Stopped a Session and want to restart it, clicking Implement again should re-spawn just the missing one.
21. As a developer, I want manually creating an `implement` Session to require selecting a Phase, defaulting to unblocked-only with a "Show all" toggle, and auto-skipping the step when only one unblocked Phase exists, so that attribution is unambiguous.
22. As a power-user developer, I want `tackle.implement.autoSelectPhase = true` to skip the Phase selection entirely (auto-pick first unblocked by `sort_order`) for fully automated flows.
23. As a developer running a whole-Task review after all Phases complete, I want the `review` Session's New Session QuickPick to offer "Whole Task" as the default first option, so that cross-Phase review is the easy path post-Phase-completion.
24. As a developer debugging after manual acceptance testing, I want `debug` Sessions to be allowed at Task scope via the same "Whole Task" affordance, so that post-PR debugging is not forced into a Phase.
25. As a developer, I want the Tackle Status of my Task to advance through `plan_started → plan_awaiting_approval → plan_approved → …` as I work, so that the tracker is a live record of my progress.
26. As a developer, I want re-planning to add a new Phase without regressing the Task's Tackle Status, so that "I forgot a component" does not whiplash my dashboard.
27. As a developer, I want the new Phase to enter at `not_started` and surface in the tracker as net-new, so that I can decide whether to spawn its `implement` Session.
28. As a developer, I want a Task-level progress bar at the top of the Phase Tracker showing the proportion of Phases at `complete`, so that I have a quick sense of how far along I am.
29. As a developer in List Mode, I want each Task Card with Phases to show a `[n/total]` progress chip on line 2, so that I can prioritize across Tasks without entering Detail Mode.
30. As a developer, I want the Activity Glyph on a Task Card to surface ⚠️ when a Phase has had an error that I have not acknowledged, so that errors do not silently disappear when the Session ends.
31. As a developer, I want a per-Phase-row "Acknowledge errors" affordance to clear the sticky ⚠️ for that Phase, so that the glyph stops following me around once I have decided to move on.
32. As a developer, I want a halted-for-input `implement` Session to surface ⚠️ instead of ✳️ live (clearing when the Session moves out of `waiting`), because if the plan, Phases, and prompts were aligned the agent should not need user input.
33. As a developer, I want a halted-for-input `plan` or `pilot` Session to keep showing ✳️, because user input is the expected behavior for those kinds.
34. As a teammate without Tackle installed, I want to see a `plan-approved` label on the GitHub issue when the Tackle user has approved their plan, so that I know the work is moving forward.
35. As a PM, I want to add a `plan-approved` label to a GitHub issue myself and have Tackle pick it up on the next Sync, treating it as authoritative, so that I can approve plans outside the tool.
36. As a developer, I want Status Label Projection to be **opt-in** via `Tackle: Configure Labels`, so that Tackle does not write to GitHub without my explicit consent.
37. As a developer in a repo that already uses `status:in-review`-style labels, I want Tackle to adopt that convention rather than create parallel `tackle:in-review` labels, so that my issue board does not end up with two label families.
38. As a developer, I want the configure-labels command to inspect my repo's labels, generate a comment-rich `.tackle/config.json` with proposed mappings, and open it in the editor for review, so that initial configuration is fast and editable.
39. As a developer in a repo with no relevant labels, I want sensible defaults (bare slugs like `plan-approved`) auto-created on first use, so that I am not blocked by config.
40. As a developer who does *not* want a label for every transition, I want to map states to `null` in my config, so that label noise stays low.
41. As a developer working from the GitHub issue UI, I want to see at most one Tackle status label per dimension on a given issue, so that the label set is unambiguous.
42. As a developer, I want every status transition — whether triggered by a button click, a Sync diff, or the future CLI — to flow through the same handler so that downstream effects (auto-spawn, audit, notification, label projection) happen consistently.
43. As a developer, I want a complete audit log of status transitions in the local DB, so that I can answer "when did this Task move to `plan_awaiting_approval`?" without grep through git history.
44. As a developer, I want External Status changes (issue closed externally) to flow through the same Event Bus as Tackle Status changes, so that the architecture has one shape, not two.
45. As a developer, I want a Task closed externally while my Sessions are still running to write a Pilot notification (durable record), surface the existing subtle Detail Mode indicator, and *not* auto-stop my Sessions, so that I have signal without disruption.
46. As a developer, I want every Session Row in Detail Mode to show a Phase chip when the Session is Phase-scoped, so that I can see which Phase I am looking at.
47. As a developer, I want clicking a Phase row to scroll the Sessions section to that Phase's Sessions, so that the connection between the two regions is interactive.
48. As a developer, I want my `plan` Sessions and `pilot` Sessions to never be Phase-scoped (always `phase_id = null`), because planning is about the Plan as a whole.
49. As a developer who is replanning mid-stream, I want the Task's Tackle Status to *not* regress just because I opened a new `plan` Session, so that lifecycle stays a forward record.
50. As a future maintainer reading the codebase, I want a clear ADR explaining why all status writes go through an Event Bus instead of direct repository methods, so that the indirection makes sense.
51. As a future maintainer, I want a clear ADR explaining why GitHub label projection is bidirectional rather than write-only, so that the choice to honor external label changes is recorded.

## Implementation Decisions

**Lifecycle (locked):**

- `tasks.tackle_status` enum: `not_started`, `plan_started`, `plan_awaiting_approval`, `plan_approved`, `implementation_started`, `in_review`, `pr_created`, `merged`. Forward-only.
- `phases.status` enum: `not_started`, `implementing`, `reviewing`, `complete`.
- The earlier-proposed `plan_complete` state was dropped; detection of a Plan Source is informational, and the lifecycle skips to `plan_awaiting_approval` once Phase rows exist locally.
- The `Materialize` concept is dropped entirely. Phase issues are created by the planning skill via the GitHub API; Tackle reads them in via Plan Discovery on Sync.

**New shared modules (in `@tackle/shared`):**

- An **Event Bus** module: a synchronous in-process `dispatch(event)` function with a typed event union and a handler registry. Sole writer of `tasks.tackle_status`, `tasks.external_status`, and `phases.status`. Each handler validates the transition, mutates the row, writes an audit row to the existing `events` table, and emits a webview-refresh signal. Every event carries a `source` field (`'sync' | 'cli' | 'ui' | 'skill'`).
- A **Status Transition** module: pure functions over status values (legal-transition rules, mutex resolution, "more advanced state" comparison for label-conflict recovery). No DB or VS Code dependency.
- **Repository extensions** for plans and phases: a `phase_dependencies` join table, columns for `plans.source_kind` / `plans.source_ref`, a `phases.last_error_at` and `phases.error_acknowledged_at` pair, a `tasks.tackle_status` column.
- A **Pilot Notifications** repository (minimal): a queue-style table that handlers can write to, the Pilot can read from, and a CLI dismiss command will eventually mutate. Full Pilot redesign is out of scope; this is the minimum surface.

**New extension modules:**

- **Plan Discovery**: a read-only walker that, on every Sync, inspects a Task's external children (GitHub sub-issues + task-list refs in the body, ADO child items later) and reflects them into the local `phases` table via Event Bus events. Also detects Plan Source presence (markdown file under `plans/<external-id>*.md` in the Task's worktree, or Phase-shaped content in the issue body). Records discrepancies (external Phase with no matching Plan Source heading) as `pilot_notifications` and surfaces an inline "no source" chip on the Phase row.
- **Status Label Projection**: writes labels to external work items as transitions fire (when configured), and contributes label-derived events back to the Event Bus on Sync. Mutex-enforced per dimension. Driven by `.tackle/config.json`. Opt-in: no-ops entirely without config.
- **Label Config & Configure command**: loader for `.tackle/config.json`, plus the `Tackle: Configure Labels` Command Palette command that inspects the repo's existing labels, generates a comment-rich config file, and opens it in the editor.
- **Implement Action / DAG executor**: an evaluator over Phase Status + dependency edges that decides which Phases are unblocked. Triggered by the Implement button (UI), the Pilot, or `phase.completed` events. Spawns `implement` Sessions for unblocked Phases via the existing session-creation flow. Idempotent on re-click.
- **Phase Tracker Renderer**: a webview rendering module producing the Phase Tracker HTML (header with Tackle Status badge + Plan Source link + progress bar + state-appropriate primary action button; Phase rows with title/link/Activity Lights/source chip/error acknowledge affordance). Slots into the reserved Detail Mode region.

**Modified modules:**

- **Sidebar render** (`render-detail.ts`, `render-card.ts`, `render-session-row.ts`): Detail Mode gains the Phase Tracker; Task Card line 2 gains the `[n/total]` chip; Session Row gains a Phase chip. Activity Glyph vocabulary expands to include ⚠️.
- **Sync** (`task-service.ts`): extends the GitHub fetch to include sub-issues, task-list refs, and labels. Computes diffs and dispatches Event Bus events.
- **Repositories** (`sqlite-repositories.ts`): existing `setStatus`-style methods become handler-only or are removed.
- **New Session flow** (`new-session-flow.ts`, `pick-kind.ts`): kind-aware Phase scoping — `plan`/`pilot`/`shell` skip the Phase step; `implement` requires a Phase when Phases exist (auto-select when only one unblocked, or always when `autoSelectPhase = true`); `review`/`debug`/`test` offer "Whole Task" first, then Phases.
- **Database** (`database.ts`): migrations for new columns and the `phase_dependencies` join table.

**Settings (in `.tackle/config.json`):**

- `tackle.implement.autoStartOnApprove` (boolean, default `false`) — when true, the Approve button at `plan_awaiting_approval` relabels to `[Approve Plan and Implement]` and the click both approves and runs Implement Action.
- `tackle.implement.autoSelectPhase` (boolean, default `false`) — when true, manual `implement` Session creation skips the Phase QuickPick step and auto-selects the first unblocked Phase by `sort_order`.
- Status label mapping (per dimension, value-by-value) — see Status Label Projection.

**Architectural decisions captured in ADR-0013:**

- Synchronous in-process Event Bus, not async or queue-based.
- Bidirectional label projection, not write-only.
- Per-repo configurable label naming, not a forced `tackle:` prefix.
- Forward-only Tackle Status (re-planning surfaces new Phases; it does not regress the Task lifecycle).
- DAG-aware execution but flat-list UI.

**Schema-level commitments:**

- `tasks` gains `tackle_status` and `external_status` (the latter renaming/normalizing the existing `status` field).
- `phases` gains `last_error_at`, `error_acknowledged_at`.
- `phase_dependencies(phase_id, blocks_phase_id)` join table.
- `plans` source columns clarified (`source_kind`, `source_ref`).
- `pilot_notifications` table (minimal) for discrepancy queue.
- Existing `events` table becomes the audit log produced by handlers.

**Pilot scope:** the existing CONTEXT.md definition of Pilot as "scoped to a Task" is now stale. The Pilot is workspace-global. The full redesign is **deferred to the Tackle CLI work (#52)**; this PRD only requires the minimal notifications surface. A separate roadmap issue (#73) tracks a unified setup wizard / skill across all configurable surfaces.

## Testing Decisions

A good test exercises the **observable behavior** of a module through its public interface and asserts on outcomes a caller can see — not on internal data structures, log lines, private method calls, or implementation choices that could change without changing behavior. Tests should fail when behavior breaks and only when behavior breaks.

**Unit tests (vitest, deepest payoff):**

- **Event Bus**: dispatching events runs the right handler, runs synchronously, and exposes the audit row written by the handler.
- **Status Transition rules**: pure functions for legal-transition checks and "more advanced state" comparison; trivially testable with table-driven cases.
- **Plan Discovery**: with a fake external client returning a fixed sub-issue list, asserts the local `phases` mirror reaches the right shape after Sync — including Plan Source detection and discrepancy notification dispatch.
- **Status Label Projection**: with a fake external client tracking labels, asserts mutex enforcement, label-derived event synthesis on read, idempotency when local already matches, conflict resolution when multiple in-dimension labels appear, and the no-op behavior when no config is present.
- **Implement Action / DAG executor**: pure planner over a Phase set with dependency edges; given a snapshot, returns the set of Phases to spawn. Table-driven. Idempotent re-evaluation.
- **Activity Glyph rollup**: extended urgency priority including ⚠️; the sticky-error rule (Phase with `last_error_at > error_acknowledged_at` contributes ⚠️ even when no Session is currently running); the "implement-Session-in-`waiting`-state surfaces ⚠️" rule.
- **Label config loader**: parsing, validation, default-fallback rules, mutual collision detection.

**Visual snapshot tests (existing surface, extended):**

- Detail Mode renders the Phase Tracker correctly across no-Plan / Plan-no-Phases / Plan-with-Phases / approved / implementing / reviewing / complete states.
- Phase rows render Activity Lights using the right glyph.
- Task Cards render the `[n/total]` chip when Phases exist; do not render it when they do not.
- Session Rows render the Phase chip when `phase_id` is non-null.
- Empty-state buttons (`[+ Create Plan]`, `[Open Plan Session →]`, `[Link existing plan…]`) appear in the right Tackle Status states.
- Approve button label is correct under both `autoStartOnApprove` settings.

**Integration tests (mocha + `@vscode/test-electron`, Windows):**

- Approve Plan command end-to-end: writes Tackle Status, dispatches Event Bus events, observes the right side effects, projects labels when configured.
- Implement Action end-to-end: pressing the button spawns the right number of `implement` Sessions with the right `phase_id` values; subsequent `phase.completed` events spawn downstream Sessions.
- Bidirectional label sync: simulate an external label change between syncs and assert the local Task transitions through the bus.

**Prior art in the codebase:** existing tests in `packages/extension/src/__tests__/` cover sidebar render snapshots, task-remove flow, session actions, and new-session flow. The Phase Tracker rendering tests follow the same shape as the existing render-detail snapshot tests. The Event Bus / Plan Discovery tests are a new shape — pure-logic unit tests in `@tackle/shared/__tests__/` alongside the existing `db.test.ts`.

## Out of Scope

- **Tackle-side issue creation.** Phase issues are created by the planning skill via the GitHub API; Tackle never writes to the external tracker to materialize Phases.
- **Full Pilot redesign.** Only the minimum notifications surface (queue table + repo, write-side dispatch from handlers) lands here. The Pilot's UI, persistence, prompt-frame context-passing, and workspace-vs-install-global boundary are deferred to the Tackle CLI work (#52).
- **Tackle CLI itself (#52).** This PRD assumes the CLI does not yet exist. CLI-driven Event Bus dispatches and the Pilot dismiss command are designed-for but not built.
- **Unified setup wizard (#73).** Each feature in this PRD ships its own minimum command (e.g., `Tackle: Configure Labels`); the unified wizard is roadmap.
- **Cross-repo / multi-repo Phases.** ADO theoretically supports children across repos; #51 does not address this.
- **ADO Status projection.** GitHub-only. ADO's workflows let it carry Tackle Status as a real state (not a label), but the integration lands with broader ADO sync work.
- **Session Loop (#55) and Prompt-on-Event (#56).** They plug into the Event Bus by adding handlers; not built here.
- **PR-internal modeling.** `pr_created → merged` is a thin mirror of the external PR's lifecycle. CI status, review comments, and approvals stay opaque.
- **Manual acceptance testing as a state.** Intentionally not modeled; varies too much across teams.
- **DAG visualization.** UI is flat-list-by-`sort_order`. The DAG is real in data and execution, invisible in the tracker.
- **Per-Task Sync.** Today's global Sync is fast enough; per-Task is a future optimization.

## Further Notes

This PRD captures the design tree walked in the `/domain-model` session for issue #51. The terms `Plan`, `Phase`, `Plan Source`, `Tackle Status`, `External Status`, `Phase Tracker`, `Phase Activity Light`, `Implement Action`, `Plan Discovery`, `Status Label Projection`, and `Event Bus` are now defined in `CONTEXT.md`. ADR-0013 records the Event Bus and bidirectional label projection decisions.

The work fans out into ~5 deep modules (`Event Bus`, `Status Transition`, `Plan Discovery`, `Status Label Projection`, `Implement Action`) plus one wide rendering surface (Phase Tracker / Task Card chip / Session Row chip). The Event Bus is built first and is the seam every other module hangs off.

Slice breakdown (filed as child issues):

1. Event Bus skeleton + Tackle Status schema + `plan_started` transition + status badge in Detail Mode header.
2. External Status migration through the bus.
3. Plan Discovery (read sub-issues) + Phase Tracker render + empty-state buttons + Plan Source link.
4. Plan Source detection + `plan_started → plan_awaiting_approval` transition rule.
5. `[Approve Plan]` button (with `autoStartOnApprove` setting variant) + transition handler.
6. Label Config + `Tackle: Configure Labels` Command + write-side Status Label Projection.
7. Bidirectional Status Label Projection (read side).
8. Implement Action + DAG executor + `phase_dependencies` table + kind-aware Phase scoping in New Session + `autoSelectPhase` setting.
9. Phase Activity Lights + ⚠️ glyph rule + sticky-error acknowledgment + `pilot_notifications` minimal table + List Mode `[n/total]` chip + Discovery discrepancy chip + external-close notification.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
