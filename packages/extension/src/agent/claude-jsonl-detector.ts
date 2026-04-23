import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import type { Session } from '@tackle/shared';
import type {
  AgentState,
  AgentStateDetector,
  AgentStateEvent,
} from './agent-state-detector';

/**
 * Resolves a Session to the absolute path of its Claude JSONL file.
 *
 * The default resolver follows Claude Code's on-disk layout:
 * `~/.claude/projects/<workspace-hash>/<claude-session-id>.jsonl`. Tests
 * supply a stub that returns a temp-dir path for fixture-based runs.
 */
export interface JsonlPathResolver {
  resolve(session: Session): string | null;
}

export interface ClaudeJsonlDetectorOptions {
  pathResolver: JsonlPathResolver;
  /**
   * Polling interval (ms) for filesystem changes. fs.watch is used as
   * the primary signal; this fallback covers platforms where watch
   * events are coarse or missed (notably Windows file-rotation cases).
   */
  pollIntervalMs?: number;
}

interface PerSessionState {
  session: Session;
  filePath: string;
  watcher: fs.FSWatcher | null;
  lastSize: number;
  lastState: AgentState | null;
  poll: NodeJS.Timeout | null;
  pendingTimer: NodeJS.Timeout | null;
}

/**
 * Default JSONL path resolver. Mirrors Claude Code's directory layout
 * so the detector can find the file for any live Session that has a
 * `claude_session_id` and a known cwd.
 *
 * Claude Code derives the project hash from the absolute cwd of the
 * agent. For Tackle that's the Session's worktree_path (or the workspace
 * root when null) — but for the MVP we don't yet wire cwd resolution
 * here; tests inject their own resolver. Production wiring (#43) will
 * pass a resolver that knows the orchestrator's cwd.
 */
export function defaultJsonlPathResolver(getCwd: (s: Session) => string | null): JsonlPathResolver {
  return {
    resolve(session: Session): string | null {
      if (!session.claude_session_id) return null;
      const cwd = getCwd(session);
      if (!cwd) return null;
      // Claude Code uses an md5 of the absolute path, lowercased hex.
      const hash = crypto.createHash('md5').update(cwd).digest('hex');
      return path.join(os.homedir(), '.claude', 'projects', hash, `${session.claude_session_id}.jsonl`);
    },
  };
}

const DEFAULT_POLL_MS = 250;

export function createClaudeJsonlDetector(opts: ClaudeJsonlDetectorOptions): AgentStateDetector {
  const sessions = new Map<number, PerSessionState>();
  const listeners = new Set<(e: AgentStateEvent) => void>();
  const pollMs = opts.pollIntervalMs ?? DEFAULT_POLL_MS;

  const emit = (sessionId: number, state: AgentState) => {
    for (const l of listeners) l({ sessionId, state });
  };

  const transition = (st: PerSessionState, next: AgentState) => {
    if (st.lastState === next) return;
    st.lastState = next;
    emit(st.session.id, next);
  };

  const readLastEntry = (filePath: string): unknown | null => {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return null;
    }
    const trimmed = content.trim();
    if (!trimmed) return null;
    const lastNewline = trimmed.lastIndexOf('\n');
    const lastLine = lastNewline >= 0 ? trimmed.slice(lastNewline + 1) : trimmed;
    try {
      return JSON.parse(lastLine);
    } catch {
      return null;
    }
  };

  const reassess = (st: PerSessionState) => {
    let stat: fs.Stats | null = null;
    try {
      stat = fs.statSync(st.filePath);
    } catch {
      stat = null;
    }
    if (!stat) {
      transition(st, 'idle');
      st.lastSize = 0;
      return;
    }
    // Detect truncation/rotation: file shrank → treat as a fresh session.
    if (stat.size < st.lastSize) {
      st.lastSize = 0;
      st.lastState = null; // force re-emit so consumers see the reset
    }
    st.lastSize = stat.size;
    if (stat.size === 0) {
      transition(st, 'idle');
      return;
    }
    const entry = readLastEntry(st.filePath);
    transition(st, deriveStateFromEntry(entry));
  };

  return {
    start(session: Session): void {
      if (sessions.has(session.id)) return;
      const filePath = opts.pathResolver.resolve(session);
      if (!filePath) {
        // No path → conservative: emit idle and stop.
        emit(session.id, 'idle');
        return;
      }
      const st: PerSessionState = {
        session,
        filePath,
        watcher: null,
        lastSize: 0,
        lastState: null,
        poll: null,
        pendingTimer: null,
      };
      sessions.set(session.id, st);

      // Initial state — fires synchronously so consumers always see a
      // baseline before any later transitions.
      reassess(st);

      const onChange = () => {
        // Debounce: filesystem events often arrive in bursts (especially
        // on Windows). Coalesce within a small window before re-reading.
        if (st.pendingTimer) return;
        st.pendingTimer = setTimeout(() => {
          st.pendingTimer = null;
          reassess(st);
        }, 25);
      };

      // Watch the parent directory so we pick up file creation events
      // for sessions that spawned before the JSONL file existed.
      const dir = path.dirname(filePath);
      const base = path.basename(filePath);
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        // best-effort; if we can't create the dir, the watcher will fail loudly
      }
      try {
        st.watcher = fs.watch(dir, (_event, filename) => {
          if (!filename || filename === base) onChange();
        });
      } catch {
        st.watcher = null;
      }
      // Polling backstop for fs.watch flakiness (esp. truncate-then-write).
      st.poll = setInterval(() => reassess(st), pollMs);
    },

    stop(session: Session): void {
      const st = sessions.get(session.id);
      if (!st) return;
      st.watcher?.close();
      if (st.poll) clearInterval(st.poll);
      if (st.pendingTimer) clearTimeout(st.pendingTimer);
      sessions.delete(session.id);
    },

    onChange(listener) {
      listeners.add(listener);
      return {
        dispose() {
          listeners.delete(listener);
        },
      };
    },

    dispose() {
      for (const st of sessions.values()) {
        st.watcher?.close();
        if (st.poll) clearInterval(st.poll);
        if (st.pendingTimer) clearTimeout(st.pendingTimer);
      }
      sessions.clear();
      listeners.clear();
    },
  };
}

/**
 * Translate the last JSONL entry into an agent state.
 *
 * Heuristic (intentionally minimal — extends in #42 for `waiting`):
 *   - `assistant` entries with a tool_use mid-turn → working
 *   - any `assistant` entry that is the turn's final message → idle
 *   - `user` entries (typed prompt or tool_result) → working (agent will respond)
 *   - anything we can't classify → working (conservative; never flip to
 *     waiting in #36's scope, never falsely report idle mid-turn)
 *
 * Claude Code's JSONL fields: `type` is the entry kind; assistant
 * messages carry `message.stop_reason` once the turn is complete. We
 * key on `stop_reason` to distinguish "still streaming" from "turn
 * over", and treat its absence on an assistant entry as still-working.
 */
export function deriveStateFromEntry(entry: unknown): AgentState {
  if (!entry || typeof entry !== 'object') return 'working';
  const e = entry as Record<string, unknown>;
  const type = e.type;

  if (type === 'user') {
    // A new user turn (prompt or tool_result) — agent will be working soon.
    return 'working';
  }

  if (type === 'assistant') {
    const message = e.message as Record<string, unknown> | undefined;
    const stopReason = message?.stop_reason;
    if (stopReason === 'end_turn' || stopReason === 'stop_sequence') {
      return 'idle';
    }
    // No stop_reason yet, or stop_reason indicates a tool call mid-turn:
    // the agent is still mid-turn → working.
    return 'working';
  }

  if (type === 'summary' || type === 'system') {
    // Metadata entries don't change state on their own — but if they're
    // the last line we've never been told the turn is over, so stay
    // conservative.
    return 'working';
  }

  return 'working';
}
