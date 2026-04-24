import * as vscode from 'vscode';
import { createAgentRegistry, type AgentRegistry, type ConfigReader, type DetectorFactories } from './agent-registry';
import { createClaudeJsonlDetector, defaultJsonlPathResolver } from './claude-jsonl-detector';

/**
 * Thin VS Code shim around the injectable ConfigReader: reads
 * `tackle.defaultAgent` from the workspace configuration each call so
 * that live setting changes are picked up without recreating the
 * registry.
 */
const vscodeConfigReader: ConfigReader = {
  getDefault(): string {
    return vscode.workspace.getConfiguration('tackle').get<string>('defaultAgent') ?? 'agency-cc';
  },
};

/**
 * VS Code-flavored detector factories. The Claude JSONL detector needs
 * to know each Session's effective cwd to derive the JSONL path: the
 * same logic as `resolveCwd` in the orchestrator. We compute it lazily
 * from the live workspace folder so it picks up workspace switches.
 */
function vscodeDetectorFactories(): DetectorFactories {
  return {
    ClaudeJsonlDetector: () => createClaudeJsonlDetector({
      pathResolver: defaultJsonlPathResolver((session) => {
        if (session.worktree_path) return session.worktree_path;
        return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
      }),
    }),
  };
}

export function createVscodeAgentRegistry(): AgentRegistry {
  return createAgentRegistry(vscodeConfigReader, vscodeDetectorFactories());
}

export * from './agent-registry';
export * from './agent-state-detector';
export * from './claude-jsonl-detector';
