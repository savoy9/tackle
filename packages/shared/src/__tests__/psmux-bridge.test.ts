import { describe, it, expect, beforeAll } from 'vitest';
import { PsmuxBridge } from '../psmux/psmux-bridge';

describe('PsmuxBridge', () => {
  describe('generateSessionName', () => {
    it('produces correct format', () => {
      expect(PsmuxBridge.generateSessionName('gh', '42', 'implement', 1)).toBe(
        'tackle-gh-42-implement1',
      );
    });

    it('handles different sources and kinds', () => {
      expect(PsmuxBridge.generateSessionName('ado', '99', 'plan', 0)).toBe('tackle-ado-99-plan0');
    });

    it('handles special characters in taskId', () => {
      expect(PsmuxBridge.generateSessionName('gh', 'ABC-123', 'debug', 3)).toBe(
        'tackle-gh-ABC-123-debug3',
      );
    });

    it('honors prefix override when provided', () => {
      expect(PsmuxBridge.generateSessionName('gh', '42', 'implement', 1, 'tackletest-')).toBe(
        'tackletest-gh-42-implement1',
      );
    });

    it('default prefix unchanged when prefix arg omitted', () => {
      expect(PsmuxBridge.generateSessionName('gh', '42', 'implement', 1)).toBe(
        'tackle-gh-42-implement1',
      );
    });
  });

  describe('generateTabLabel', () => {
    it('produces correct format without label', () => {
      expect(PsmuxBridge.generateTabLabel('42', 'fix-auth', 'implement', 1)).toBe(
        '42-fix-auth|implement1',
      );
    });

    it('produces correct format with label', () => {
      expect(PsmuxBridge.generateTabLabel('42', 'fix-auth', 'implement', 1, 'backend')).toBe(
        '42-fix-auth|implement1-backend',
      );
    });

    it('handles empty label same as no label', () => {
      expect(PsmuxBridge.generateTabLabel('42', 'fix-auth', 'implement', 1, '')).toBe(
        '42-fix-auth|implement1',
      );
    });
  });

  describe('hasExecutable', () => {
    it('returns a boolean without throwing', () => {
      const result = PsmuxBridge.hasExecutable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('session lifecycle (requires tmux)', () => {
    let bridge: PsmuxBridge;
    let tmuxAvailable = false;

    beforeAll(() => {
      bridge = new PsmuxBridge();
      tmuxAvailable = PsmuxBridge.hasExecutable();
    });

    it('createSession / hasSession / listSessions / killSession', () => {
      if (!tmuxAvailable) {
        console.log('Skipping: tmux not available');
        return;
      }

      const name = 'tackle-test-lifecycle-0';

      // create
      bridge.createSession(name);
      expect(bridge.hasSession(name)).toBe(true);

      // list
      const sessions = bridge.listSessions();
      expect(sessions).toContain(name);

      // kill
      bridge.killSession(name);
      expect(bridge.hasSession(name)).toBe(false);
    });

    it('sendKeys does not throw on valid session', () => {
      if (!tmuxAvailable) {
        console.log('Skipping: tmux not available');
        return;
      }

      const name = 'tackle-test-sendkeys-0';
      bridge.createSession(name);
      try {
        expect(() => bridge.sendKeys(name, 'echo hello')).not.toThrow();
      } finally {
        bridge.killSession(name);
      }
    });
  });
});
