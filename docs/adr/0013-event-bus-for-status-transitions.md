# Event Bus for Task and Phase status transitions

All status mutations on Tasks (Tackle Status, External Status) and Phases (Phase Status) flow through a single synchronous in-process Event Bus with a typed event union and a handler registry. Callers — Sync, the Sidebar UI, the future Tackle CLI, future skill hooks — dispatch events; handlers validate the transition, mutate the row, write an audit row to the `events` table, and signal the webview. Nothing writes those status columns directly.

## Considered options

- **Direct mutation API** (`taskRepo.setStatus(id, newStatus)`). Simplest. Each call site decides whether to write an audit row, validate the transition, refresh the UI. Adding a downstream effect (e.g., auto-spawn a Session on `plan_approved`) means grepping every call site and adding the new behavior — easy to miss one. Rejected.
- **Async event queue / message bus.** Decouples producers and consumers across processes. Overkill for an in-process VS Code extension and introduces eventual-consistency bugs when the DB read after a status change races the handler. Rejected.
- **Synchronous in-process Event Bus (chosen).** One `dispatch(event)` function. Handler runs in the same tick as the call. DB writes are synchronous within the handler. The `events` table is an audit log, not a source of truth — replaying it should reproduce current state, but Tackle reads the live columns for rendering.

## Decision

- One `EventBus` module, synchronous, in-process. `dispatch(event)` runs the registered handler for `event.type` and returns when the handler returns.
- The handler is the only writer of `tasks.tackle_status`, `tasks.external_status`, and `phases.status`. Direct repository methods that mutate those columns are removed (or kept private to the bus's handlers).
- Every event carries a `source` field (`'sync' | 'cli' | 'ui' | 'skill'`) and any contextual IDs needed for the audit row.
- Sync synthesizes events from external state diffs rather than writing the External Status column directly. Symmetry across all status dimensions.
- The `events` table (already in the schema) is the audit log produced by handlers. Live state lives in `tasks` / `phases` columns.

## Consequences

- Adding a downstream effect to a transition (auto-spawn a Session, fire a Pilot notification, close an external issue) is a one-line change to the relevant handler — every dispatcher gets it for free.
- A single seam to test: handler tests cover validation + DB write + audit; caller tests assert "the right event was dispatched."
- The future Tackle CLI (#52) writes events into the bus from outside the extension process via the same shape — likely by inserting into a queue table that the extension polls. Designing the polling loop is easier when the payload is already a typed event.
- Future Prompt-on-Event (#56) and Session Loop (#55) both depend on this seam — they are extra handler logic, not new dispatch sites.
- Callers must remember to dispatch through the bus rather than touching repositories directly. Lint rule or repository encapsulation enforces this.

## Status Label Projection (bidirectional)

Tackle Status (Task) and Phase Status (Phase) are also projected to the external tracker as **GitHub labels** (and ADO equivalents later). Projection is **bidirectional**: Tackle writes labels as transitions fire AND reads labels on every Sync, synthesizing events for external label changes that don't match local state. The same handlers run; `source: 'sync'` carries label-derived events alongside open/closed events.

Why bidirectional rather than write-only:

- The whole point of externalizing status is so other people / tools / the GitHub UI can interact with it. A write-only projection means external interactions get silently overwritten by Tackle on the next transition — exactly the dynamic that makes managed tools obnoxious.
- A PM clicking `plan-approved` in the GitHub UI is a legitimate, expected workflow. Tackle should treat it as authoritative, not as drift to suppress.
- The Event Bus already supports multiple sources; adding a label-diff source is incremental.

Label naming is **per-repo configurable** via `.tackle/config.json` rather than a hard-coded `tackle:` prefix. The Tackle setup command inspects the repo's existing label vocabulary and proposes a mapping that adopts it. Rationale:

- Status labels aren't really Tackle's — they're the team's convention; Tackle just drives them. A `tackle:` prefix would visually segregate them and create duplicates against existing `status:in-review`-style labels.
- Teams with established label conventions don't have to migrate; teams without them get sensible defaults.
- States mapped to `null` are skipped; not every transition needs to leak outward.
- The fallback `tackle:` prefix is reserved for collision cases — when an existing label means something different, the setup command proposes a prefixed alternative for that one state.

Mutex within each dimension is enforced on Tackle's side (GitHub labels are a flat namespace with no built-in workflow). On Sync, if a work item carries multiple configured labels for the same dimension, Tackle picks the most-advanced state and removes the others — recovering from concurrent-edit race conditions between Tackle's two-call "remove old, add new" sequence and a teammate's manual edit.
