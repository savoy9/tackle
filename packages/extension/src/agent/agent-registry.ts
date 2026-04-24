import type { SessionKind } from '@tackle/shared';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentStateDetector } from './agent-state-detector';

/**
 * Identifier for the `AgentStateDetector` implementation an Agent uses.
 *
 * A string tag (rather than an imported constructor) keeps the registry
 * independent of detector wiring: the orchestrator (#43) looks up the
 * detector instance by tag, so this module doesn't need to import
 * detector code or carry its runtime dependencies.
 */
export type DetectorKind = 'ClaudeJsonlDetector';

/**
 * Spawn adapter for a Tackle Agent.
 *
 * `command` is the executable the terminal orchestrator will launch.
 * `resumeFlag(sessionId)` produces the CLI args that resume a previous
 * Claude session id; both `agency-cc` and vanilla `claude` accept
 * `-r <id>` / `--resume <id>`, so the registry exposes this as a
 * uniform contract.
 *
 * `detector` names the `AgentStateDetector` implementation the agent
 * uses to report `idle` / `working` / `waiting` transitions. Both
 * built-in agents are Claude Code under the hood and share
 * `ClaudeJsonlDetector`.
 */
export interface AgentAdapter {
  name: string;
  command: string;
  /**
   * Positional args prepended before the resume flag (and any other
   * orchestrator-supplied args) on every spawn. Used by the `stub` test
   * harness adapter to pass the claude-stub.mjs path to `node`.
   */
  args?: string[];
  resumeFlag(sessionId: string): string[];
  detector: DetectorKind;
}

export interface ConfigReader {
  /**
   * Returns the configured default Agent name (e.g. `tackle.defaultAgent`).
   */
  getDefault(): string;
}

/**
 * Thrown when `resolve(name)` is called with an Agent name that is not
 * registered. We prefer an explicit error over silently falling back to
 * the default: misspelling an Agent name should surface quickly rather
 * than mask itself behind whatever `tackle.defaultAgent` happens to be.
 */
export class UnknownAgentError extends Error {
  constructor(public readonly agentName: string) {
    super(`Unknown agent: ${agentName}`);
    this.name = 'UnknownAgentError';
  }
}

export interface AgentRegistry {
  resolve(agentName?: string | null): AgentAdapter;
  shouldLaunch(kind: SessionKind): boolean;
  /**
   * Returns the shared `AgentStateDetector` instance for the named
   * agent's `DetectorKind`, lazily constructed on first access. The
   * orchestrator (#43) calls this once per Session lifecycle to start
   * and stop watchers; multiple Sessions on the same kind share one
   * detector instance (and one event channel — consumers filter by
   * `sessionId`).
   *
   * Returns `null` when no detector factory is registered for the
   * agent's kind (e.g. a future agent we haven't shipped a detector
   * for, or a `shell`-only configuration).
   */
  getDetector(agentName?: string | null): AgentStateDetector | null;
  /** Dispose every constructed detector instance. */
  disposeDetectors(): void;
}

/**
 * Factory map: `DetectorKind` → constructor producing a fresh
 * `AgentStateDetector`. Injected at registry creation so the registry
 * itself is decoupled from any specific detector implementation
 * (Claude Code today, future agents tomorrow).
 */
export type DetectorFactories = Partial<Record<DetectorKind, () => AgentStateDetector>>;

const BUILTIN_ADAPTERS: Record<string, AgentAdapter> = {
  'agency-cc': {
    name: 'agency-cc',
    command: 'agency-cc',
    resumeFlag: (sessionId: string) => ['-r', sessionId],
    detector: 'ClaudeJsonlDetector',
  },
  claude: {
    name: 'claude',
    command: 'claude',
    resumeFlag: (sessionId: string) => ['-r', sessionId],
    detector: 'ClaudeJsonlDetector',
  },
  // Test-harness adapter (#65). Engaged by setting
  // `tackle.defaultAgent = 'stub'` in test fixtures. The stub script lives
  // alongside the extension package's test fixtures and writes synthetic
  // jsonl files that the real ClaudeJsonlDetector parses unchanged.
  stub: {
    name: 'stub',
    command: 'node',
    args: [path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..', '..', 'test', 'fixtures', 'bin', 'claude-stub.mjs',
    )],
    resumeFlag: () => [],
    detector: 'ClaudeJsonlDetector',
  },
};

export function createAgentRegistry(
  config: ConfigReader,
  detectorFactories: DetectorFactories = {},
): AgentRegistry {
  const detectorInstances = new Map<DetectorKind, AgentStateDetector>();
  const registry: AgentRegistry = {
    resolve(agentName?: string | null): AgentAdapter {
      const name = agentName ?? config.getDefault();
      const adapter = BUILTIN_ADAPTERS[name];
      if (!adapter) throw new UnknownAgentError(name);
      return adapter;
    },
    shouldLaunch(kind: SessionKind): boolean {
      return kind !== 'shell';
    },
    getDetector(agentName?: string | null): AgentStateDetector | null {
      const adapter = registry.resolve(agentName);
      const factory = detectorFactories[adapter.detector];
      if (!factory) return null;
      let inst = detectorInstances.get(adapter.detector);
      if (!inst) {
        inst = factory();
        detectorInstances.set(adapter.detector, inst);
      }
      return inst;
    },
    disposeDetectors(): void {
      for (const d of detectorInstances.values()) d.dispose();
      detectorInstances.clear();
    },
  };
  return registry;
}
