import { describe, it, expect, afterEach } from 'vitest';
import { PsmuxManager } from '../psmux-manager';

describe('PsmuxManager', () => {
  const manager = new PsmuxManager();
  const testSessions: string[] = [];

  afterEach(() => {
    // Clean up any sessions created during tests
    for (const name of testSessions) {
      try {
        manager.killSession(name);
      } catch {
        // ignore - session may already be dead
      }
    }
    testSessions.length = 0;
  });

  it('creates a named session and lists it', () => {
    const name = `chartroom-test-${Date.now()}`;
    testSessions.push(name);

    manager.createSession(name);

    const sessions = manager.listSessions();
    expect(sessions).toContain(name);
  });

  it('reports whether a session exists', () => {
    const name = `chartroom-test-${Date.now()}`;
    testSessions.push(name);

    expect(manager.hasSession(name)).toBe(false);
    manager.createSession(name);
    expect(manager.hasSession(name)).toBe(true);
  });

  it('kills a session', () => {
    const name = `chartroom-test-${Date.now()}`;
    testSessions.push(name);

    manager.createSession(name);
    expect(manager.hasSession(name)).toBe(true);

    manager.killSession(name);
    expect(manager.hasSession(name)).toBe(false);
  });

  it('creates a pane in an existing session', () => {
    const name = `chartroom-test-${Date.now()}`;
    testSessions.push(name);

    manager.createSession(name);
    const panes = manager.listPanes(name);
    expect(panes.length).toBe(1); // initial pane

    manager.createPane(name);
    const panesAfter = manager.listPanes(name);
    expect(panesAfter.length).toBe(2);
  });

  it('creates named windows for phases', () => {
    const name = `chartroom-test-${Date.now()}`;
    testSessions.push(name);

    manager.createSession(name);
    manager.createWindow(name, 'phase-1-auth');
    manager.createWindow(name, 'phase-2-api');

    const windows = manager.listWindows(name);
    expect(windows.length).toBe(3); // default + 2 phase windows
    expect(windows.some((w) => w.name === 'phase-1-auth')).toBe(true);
    expect(windows.some((w) => w.name === 'phase-2-api')).toBe(true);
  });

  it('switches active window', () => {
    const name = `chartroom-test-${Date.now()}`;
    testSessions.push(name);

    manager.createSession(name);
    manager.createWindow(name, 'phase-1');

    manager.selectWindow(name, 'phase-1');
    const windows = manager.listWindows(name);
    const active = windows.find((w) => w.active);
    expect(active?.name).toBe('phase-1');
  });
});
