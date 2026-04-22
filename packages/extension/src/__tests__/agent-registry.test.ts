import { describe, it, expect } from 'vitest';
import vscodeModule, { resetMocks } from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

import { createAgentRegistry, UnknownAgentError } from '../agent/agent-registry';
import { createVscodeAgentRegistry } from '../agent';

describe('agent-registry', () => {
  describe('resolve', () => {
    it('returns the default agent when no name is provided', () => {
      const registry = createAgentRegistry({ getDefault: () => 'agency-cc' });
      const adapter = registry.resolve();
      expect(adapter.command).toBe('agency-cc');
    });

    it('explicit name wins over the configured default', () => {
      const registry = createAgentRegistry({ getDefault: () => 'agency-cc' });
      const adapter = registry.resolve('claude');
      expect(adapter.command).toBe('claude');
    });

    it('throws UnknownAgentError for an unregistered agent name', () => {
      const registry = createAgentRegistry({ getDefault: () => 'agency-cc' });
      expect(() => registry.resolve('not-a-real-agent')).toThrow(UnknownAgentError);
    });
  });

  describe('resumeFlag', () => {
    const registry = createAgentRegistry({ getDefault: () => 'agency-cc' });

    it('agency-cc produces -r <id>', () => {
      expect(registry.resolve('agency-cc').resumeFlag('abc-123')).toEqual(['-r', 'abc-123']);
    });

    it('claude produces -r <id>', () => {
      expect(registry.resolve('claude').resumeFlag('abc-123')).toEqual(['-r', 'abc-123']);
    });
  });

  describe('shouldLaunch', () => {
    const registry = createAgentRegistry({ getDefault: () => 'agency-cc' });

    it('is false for shell-kind sessions', () => {
      expect(registry.shouldLaunch('shell')).toBe(false);
    });

    it('is true for agent-launching kinds (e.g. implement)', () => {
      expect(registry.shouldLaunch('implement')).toBe(true);
    });
  });

  describe('createVscodeAgentRegistry', () => {
    it('reads the default agent from tackle.defaultAgent configuration', async () => {
      resetMocks();
      await vscodeModule.workspace.getConfiguration('tackle').update('defaultAgent', 'claude');
      const registry = createVscodeAgentRegistry();
      expect(registry.resolve().command).toBe('claude');
    });

    it('falls back to agency-cc when the setting is unset', () => {
      resetMocks();
      const registry = createVscodeAgentRegistry();
      expect(registry.resolve().command).toBe('agency-cc');
    });
  });
});
