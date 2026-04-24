import vscodeModule, { mockExtensionContext, executeCommandCalls, resetMocks } from './vscode-mock';

vi.mock('vscode', () => vscodeModule);

vi.mock('@tackle/shared', () => ({
  createDatabase: vi.fn(() => ({ close: vi.fn() })),
  PsmuxBridge: { hasExecutable: vi.fn(() => true) },
}));

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
}));

import { ModeManager } from '../mode/mode-manager';
import { createDatabase } from '@tackle/shared';
import type * as vscode from 'vscode';

describe('ModeManager', () => {
  let manager: ModeManager;

  beforeEach(() => {
    resetMocks();
    manager = new ModeManager(mockExtensionContext as unknown as vscode.ExtensionContext);
  });

  describe('isActive', () => {
    it('returns false initially', () => {
      expect(manager.isActive()).toBe(false);
    });

    it('returns true after activate', async () => {
      await manager.activate();
      expect(manager.isActive()).toBe(true);
    });

    it('returns false after deactivate', async () => {
      await manager.activate();
      await manager.deactivate();
      expect(manager.isActive()).toBe(false);
    });
  });

  describe('settings save/restore', () => {
    it('saves settings to globalState on activate and restores on deactivate', async () => {
      // Set some initial config values
      const config = vscodeModule.workspace.getConfiguration();
      await config.update('defaultLocation', 'bottom');
      await config.update('showTabs', 'multiple');

      await manager.activate();

      // Verify settings were saved
      const saved = mockExtensionContext.globalState.get<Record<string, unknown>>(
        'tackle.savedSettings',
      );
      expect(saved).toBeDefined();

      // Verify tackle settings were applied
      expect(config.update).toHaveBeenCalledWith('defaultLocation', 'editor', 1);

      // Verify setContext was called
      const setContextCall = executeCommandCalls.find((c) => c[0] === 'setContext');
      expect(setContextCall).toEqual(['setContext', 'tackle.active', true]);

      await manager.deactivate();

      // Verify context cleared
      const clearCall = executeCommandCalls.find(
        (c) => c[0] === 'setContext' && c[2] === false,
      );
      expect(clearCall).toEqual(['setContext', 'tackle.active', false]);
    });
  });

  describe('database', () => {
    it('is undefined before activate', () => {
      expect(manager.getDatabase()).toBeUndefined();
    });

    it('is created on activate', async () => {
      await manager.activate();
      const expectedPath = require('node:path').join('/tmp/test-workspace', '.tackle', 'tackle.db');
      expect(createDatabase).toHaveBeenCalledWith(expectedPath);
      expect(manager.getDatabase()).toBeDefined();
    });

    it('is undefined after deactivate', async () => {
      await manager.activate();
      await manager.deactivate();
      expect(manager.getDatabase()).toBeUndefined();
    });

    it('uses TACKLE_TEST_DB env var when set', async () => {
      const prev = process.env.TACKLE_TEST_DB;
      try {
        process.env.TACKLE_TEST_DB = '/tmp/override-tackle.db';
        await manager.activate();
        expect(createDatabase).toHaveBeenCalledWith('/tmp/override-tackle.db');
      } finally {
        if (prev === undefined) delete process.env.TACKLE_TEST_DB;
        else process.env.TACKLE_TEST_DB = prev;
      }
    });
  });
});
