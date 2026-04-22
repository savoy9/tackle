# Active Task is decoupled from Detail Mode view

Entering Detail Mode on a Task makes it the Active Task (opens its Sessions' terminals). Clicking **Back** returns the Sidebar to List Mode but does **not** deactivate the Task — terminals stay open, the Active Task does not change, and the Task retains its primary left-edge accent bar in List Mode.

## Considered options

- **Back = deactivate + navigate** — one-action exit: leaving Detail Mode releases terminals and clears Active Task. Simpler lifecycle model. Rejected because a user who only wants to peek back at the List should not incur a terminal teardown/restore cycle.
- **Back = navigation only (chosen)** — Active Task is a lifecycle concept tied to editor-area terminal attachment; Detail Mode / List Mode is a navigation concept tied to sidebar content. The two dimensions can move independently. Deactivation is an explicit action in the Detail Mode overflow menu.

## Consequences

- List Mode must visibly mark the Active Task even though it isn't being shown in Detail — the left-edge accent bar serves this role, answering "which Task has my terminals open right now?" at a glance.
- The glossary distinguishes **Active Task** (has terminals), **Viewed Task** (currently in Detail Mode, equal to Active Task under MVP semantics), and **Attached Task** (reserved for future multi-task terminal visibility).
- Entering Detail Mode on a non-Active Task performs a terminal swap (close old Task's terminals, attach new Task's); entering Detail Mode on the already-Active Task is a pure navigation operation.
