import type { Session } from '@tackle/shared';

/**
 * The agent state vocabulary the sidebar consumes.
 *
 * `waiting` is reserved for #42's tool-approval / human-input detection.
 * #36 only ships `idle` and `working`; conservative defaults prefer
 * `working` over `waiting` for ambiguous inputs.
 */
export type AgentState = 'idle' | 'working' | 'waiting';

export interface AgentStateEvent {
  sessionId: number;
  state: AgentState;
}

/**
 * A pluggable per-Session state detector.
 *
 * `start(session)` begins observing whatever signal the implementation
 * uses (file watcher, OSC sniffer, …) and produces transitions on the
 * `onChange` channel. `stop(session)` tears down resources for one
 * Session. The channel is shared across all Sessions managed by a
 * single detector instance — consumers filter by `sessionId`.
 */
export interface AgentStateDetector {
  start(session: Session): void;
  stop(session: Session): void;
  onChange(listener: (event: AgentStateEvent) => void): { dispose(): void };
  dispose(): void;
}
