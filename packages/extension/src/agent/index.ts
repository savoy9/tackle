import * as vscode from 'vscode';
import { createAgentRegistry, type AgentRegistry, type ConfigReader } from './agent-registry';

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

export function createVscodeAgentRegistry(): AgentRegistry {
  return createAgentRegistry(vscodeConfigReader);
}

export * from './agent-registry';
