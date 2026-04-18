import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TerminalManager } from '../terminal-manager';

// Mock node-pty — it's a native module that won't load in bun:test
const mockPty = {
  onData: vi.fn(),
  onExit: vi.fn(),
  write: vi.fn(),
  resize: vi.fn(),
  kill: vi.fn(),
  pid: 12345,
};

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => mockPty),
}));

describe('TerminalManager', () => {
  let manager: TerminalManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new TerminalManager();
  });

  afterEach(() => {
    manager.destroyAll();
  });

  it('creates a session and returns its id', () => {
    const session = manager.create();

    expect(session.id).toBeDefined();
    expect(typeof session.id).toBe('string');
    expect(session.status).toBe('running');
  });

  it('lists all sessions', () => {
    manager.create();
    manager.create();

    const sessions = manager.list();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].status).toBe('running');
    expect(sessions[1].status).toBe('running');
  });

  it('writes data to a session', () => {
    const session = manager.create();
    manager.write(session.id, 'ls -la\n');

    expect(mockPty.write).toHaveBeenCalledWith('ls -la\n');
  });

  it('resizes a session', () => {
    const session = manager.create();
    manager.resize(session.id, 120, 40);

    expect(mockPty.resize).toHaveBeenCalledWith(120, 40);
  });

  it('destroys a session', () => {
    const session = manager.create();
    manager.destroy(session.id);

    expect(mockPty.kill).toHaveBeenCalled();
    expect(manager.list()).toHaveLength(0);
  });

  it('returns undefined for unknown session', () => {
    expect(manager.get('nonexistent')).toBeUndefined();
  });

  it('emits data events from pty to listener', () => {
    const dataHandler = vi.fn();
    manager.create();

    // Get the onData callback that was registered
    const onDataCallback = mockPty.onData.mock.calls[0][0];

    manager.onData(manager.list()[0].id, dataHandler);
    onDataCallback('hello from pty');

    expect(dataHandler).toHaveBeenCalledWith('hello from pty');
  });
});
