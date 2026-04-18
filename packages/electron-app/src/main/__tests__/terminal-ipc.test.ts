import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerTerminalHandlers } from '../ipc-handlers';
import type { TerminalManager } from '../terminal-manager';

// Mock ipcMain
const handlers = new Map<string, (...args: any[]) => any>();
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: any) => {
      handlers.set(channel, handler);
    }),
  },
}));

describe('terminal IPC handlers', () => {
  const mockManager = {
    create: vi.fn(() => ({ id: 'abc-123', status: 'running' as const, pid: 999 })),
    list: vi.fn(() => []),
    write: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
    onData: vi.fn(),
  } as unknown as TerminalManager;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    registerTerminalHandlers(mockManager);
  });

  it('registers terminal:create handler', () => {
    expect(handlers.has('terminal:create')).toBe(true);
  });

  it('terminal:create calls manager.create', () => {
    const handler = handlers.get('terminal:create')!;
    const result = handler({});

    expect(mockManager.create).toHaveBeenCalled();
    expect(result).toEqual({ id: 'abc-123', status: 'running', pid: 999 });
  });

  it('terminal:write calls manager.write', () => {
    const handler = handlers.get('terminal:write')!;
    handler({}, 'abc-123', 'hello');

    expect(mockManager.write).toHaveBeenCalledWith('abc-123', 'hello');
  });

  it('terminal:resize calls manager.resize', () => {
    const handler = handlers.get('terminal:resize')!;
    handler({}, 'abc-123', 120, 40);

    expect(mockManager.resize).toHaveBeenCalledWith('abc-123', 120, 40);
  });

  it('terminal:list calls manager.list', () => {
    const handler = handlers.get('terminal:list')!;
    handler({});

    expect(mockManager.list).toHaveBeenCalled();
  });

  it('terminal:destroy calls manager.destroy', () => {
    const handler = handlers.get('terminal:destroy')!;
    handler({}, 'abc-123');

    expect(mockManager.destroy).toHaveBeenCalledWith('abc-123');
  });
});
