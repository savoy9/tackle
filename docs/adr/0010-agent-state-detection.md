# Agent state is detected by watching the Agent's on-disk transcript

Tackle surfaces a per-Session `agent_state` of `idle` / `working` / `waiting` so the sidebar can render the Activity Glyph without the user switching into each terminal. The state is derived from the Claude Code JSONL transcript at `~/.claude/projects/<md5-of-cwd>/<claude-session-id>.jsonl`, watched with `fs.watch` and polled as a backstop.

## Considered options

- **Ask the Agent directly over IPC** — cleanest semantics, but neither `agency-cc` nor vanilla `claude` exposes a stable state channel. Would require forking the Agent or adding a hook we don't own.
- **Scrape the terminal PTY** — the content Tackle would need is already rendered there, but psmux terminals are shared across reattach cycles and the output is formatted for humans; parsing would be brittle and locale-dependent.
- **Watch the JSONL transcript (chosen)** — Claude Code writes an append-only JSON-Lines log of every turn. The on-disk shape is stable enough to classify, file-watching is cheap, and the file survives VS Code restarts so we can recover state on activation.

## Decision

- `AgentStateDetector` is an interface (`start(session)` / `stop(session)` / `onChange(listener)` / `dispose()`), registered per-agent via `DetectorKind` in `agent-registry.ts`. Multiple Sessions share one detector instance; consumers filter by `sessionId`.
- `ClaudeJsonlDetector` locates the JSONL via `md5(cwd)` — the same hash Claude Code itself uses — then watches the parent directory (so the watcher fires on file creation for sessions that pre-date the JSONL), with a polling interval (default 250 ms) as a backstop for `fs.watch` flakiness on Windows and truncate-then-write rotations.
- State is derived from the last line of the JSONL by `deriveStateFromEntry`:
  - `assistant` entry containing an `AskUserQuestion` tool_use → **waiting** (precedence over `stop_reason`).
  - `system` entry with `subtype` in the tool-approval set → **waiting**.
  - `assistant` with `stop_reason` of `end_turn` / `stop_sequence` (and no pending question) → **idle**.
  - `user` entry, mid-turn `assistant`, or anything ambiguous → **working**.
- A size-unchanged guard short-circuits polls on quiescent sessions; a size-shrunk check handles rotation by resetting `lastSize` / `lastState`.
- `TerminalOrchestrator.resumeRunningDetectors` re-attaches detectors at activation for any Session row still marked `running`, so the glyph keeps updating after VS Code restarts. It's fire-and-forget so activation is not blocked.

## Consequences

- The detector is coupled to Claude Code's on-disk format. Schema drift in the JSONL will silently regress state (with `working` as the conservative fallback). We guard the two non-working triggers on explicit strings and document the assumed shapes in `claude-jsonl-detector.ts`.
- Agents whose state surface is not a JSONL transcript will need a new `DetectorKind` and factory; the registry contract stays the same.
- `shell`-kind Sessions skip detection entirely — `agent_state` stays at the default `idle`.
- File-watch handles and poll timers are per-Session; `disposeAll` on the orchestrator and `deactivate()` in `extension.ts` release them on shutdown.
