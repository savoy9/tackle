import type { WorktreeConfigReader } from './worktree-provisioner';

/**
 * Minimal shape of `vscode.workspace.getConfiguration` we depend on. Kept
 * here so this module stays free of a hard `vscode` import and remains
 * unit-testable with a fake.
 */
export type GetConfigurationFn = (section?: string) => {
  get<T>(key: string): T | undefined;
};

/**
 * Build a `WorktreeConfigReader` backed by VS Code's configuration system.
 * Reads `tackle.worktree.baseBranch` and `tackle.worktree.rootPath` on
 * every call so live setting changes are picked up without recreating the
 * provisioner.
 */
export function createVscodeWorktreeConfigReader(
  getConfiguration: GetConfigurationFn,
): WorktreeConfigReader {
  return {
    getBaseBranch(): string | undefined {
      return getConfiguration('tackle').get<string>('worktree.baseBranch');
    },
    getRootPath(): string | undefined {
      return getConfiguration('tackle').get<string>('worktree.rootPath');
    },
  };
}
