import type { SessionKind } from '@tackle/shared';

/**
 * Spawn adapter for a Tackle Agent.
 *
 * `command` is the executable the terminal orchestrator will launch.
 * `resumeFlag(sessionId)` produces the CLI args that resume a previous
 * Claude session id; both `agency-cc` and vanilla `claude` accept
 * `-r <id>` / `--resume <id>`, so the registry exposes this as a
 * uniform contract.
 */
export interface AgentAdapter {
  command: string;
  resumeFlag(sessionId: string): string[];
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
    command: 'agency-cc',
    resumeFlag: (sessionId: string) => ['-r', sessionId],
  },
  claude: {
    command: 'claude',
    resumeFlag: (sessionId: string) => ['-r', sessionId],
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
