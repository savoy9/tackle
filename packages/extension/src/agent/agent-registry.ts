import type { SessionKind } from '@tackle/shared';

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
}

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
};

export function createAgentRegistry(config: ConfigReader): AgentRegistry {
  return {
    resolve(agentName?: string | null): AgentAdapter {
      const name = agentName ?? config.getDefault();
      const adapter = BUILTIN_ADAPTERS[name];
      if (!adapter) throw new UnknownAgentError(name);
      return adapter;
    },
    shouldLaunch(kind: SessionKind): boolean {
      return kind !== 'shell';
    },
  };
}
