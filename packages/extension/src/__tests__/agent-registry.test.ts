import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

  describe('detector', () => {
    const registry = createAgentRegistry({ getDefault: () => 'agency-cc' });

    it('agency-cc declares ClaudeJsonlDetector', () => {
      expect(registry.resolve('agency-cc').detector).toBe('ClaudeJsonlDetector');
    });

    it('claude declares ClaudeJsonlDetector', () => {
      expect(registry.resolve('claude').detector).toBe('ClaudeJsonlDetector');
    });
  });

  describe('stub agent (test harness)', () => {
    const ORIGINAL_STUB_PATH = process.env.TACKLE_TEST_STUB_PATH;
    beforeAll(() => {
      // Production builds drop the stub adapter unless the harness opts in.
      process.env.TACKLE_TEST_STUB_PATH = '/tmp/fixtures/claude-stub.mjs';
    });
    afterAll(() => {
      if (ORIGINAL_STUB_PATH === undefined) delete process.env.TACKLE_TEST_STUB_PATH;
      else process.env.TACKLE_TEST_STUB_PATH = ORIGINAL_STUB_PATH;
    });

    it('is registered when TACKLE_TEST_STUB_PATH is set', () => {
      const registry = createAgentRegistry({ getDefault: () => 'agency-cc' });
      const adapter = registry.resolve('stub');
      expect(adapter.name).toBe('stub');
      expect(adapter.command).toBe('node');
    });

    it('passes the claude-stub.mjs path as a positional arg', () => {
      const registry = createAgentRegistry({ getDefault: () => 'agency-cc' });
      const adapter = registry.resolve('stub');
      expect(adapter.args).toBeDefined();
      expect(adapter.args!.length).toBe(1);
      expect(adapter.args![0]).toMatch(/claude-stub\.mjs$/);
    });

    it('emits an empty resumeFlag (the stub does not honor session ids)', () => {
      const registry = createAgentRegistry({ getDefault: () => 'agency-cc' });
      const adapter = registry.resolve('stub');
      expect(adapter.resumeFlag('whatever')).toEqual([]);
    });

    it('declares ClaudeJsonlDetector so the existing detector path is exercised', () => {
      const registry = createAgentRegistry({ getDefault: () => 'agency-cc' });
      expect(registry.resolve('stub').detector).toBe('ClaudeJsonlDetector');
    });

    it('is NOT registered when TACKLE_TEST_STUB_PATH is unset (production builds)', () => {
      delete process.env.TACKLE_TEST_STUB_PATH;
      const registry = createAgentRegistry({ getDefault: () => 'agency-cc' });
      expect(() => registry.resolve('stub')).toThrow(UnknownAgentError);
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
