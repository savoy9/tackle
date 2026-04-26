import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

// Mock vscode
const mockShowErrorMessage = vi.fn();
const mockWorkspaceFolders = { value: undefined as any[] | undefined };

vi.mock('vscode', () => ({
  workspace: {
    get workspaceFolders() {
      return mockWorkspaceFolders.value;
    },
  },
  window: {
    showErrorMessage: (...args: any[]) => mockShowErrorMessage(...args),
  },
}));

import {
  checkSingleRootWorkspace,
  ensureTackleDir,
  resolveWorkspaceRoot,
} from '../guards/workspace-guard';

describe('checkSingleRootWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false and shows error for no workspace', async () => {
    mockWorkspaceFolders.value = undefined;
    const result = await checkSingleRootWorkspace();
    expect(result).toBe(false);
    expect(mockShowErrorMessage).toHaveBeenCalledWith('Tackle requires an open workspace');
  });

  it('returns false and shows error for empty workspace folders', async () => {
    mockWorkspaceFolders.value = [];
    const result = await checkSingleRootWorkspace();
    expect(result).toBe(false);
    expect(mockShowErrorMessage).toHaveBeenCalledWith('Tackle requires an open workspace');
  });

  it('returns false and shows error for multi-root workspace', async () => {
    mockWorkspaceFolders.value = [{ uri: { fsPath: '/a' } }, { uri: { fsPath: '/b' } }];
    const result = await checkSingleRootWorkspace();
    expect(result).toBe(false);
    expect(mockShowErrorMessage).toHaveBeenCalledWith(
      'Tackle requires a single-root workspace. Multi-root workspaces are not supported.',
    );
  });

  it('returns true for single-root workspace', async () => {
    mockWorkspaceFolders.value = [{ uri: { fsPath: '/a' } }];
    const result = await checkSingleRootWorkspace();
    expect(result).toBe(true);
    expect(mockShowErrorMessage).not.toHaveBeenCalled();
  });
});

describe('resolveWorkspaceRoot', () => {
  beforeEach(() => {
    delete process.env.TACKLE_TEST_WORKSPACE;
    mockWorkspaceFolders.value = [{ uri: { fsPath: '/real/workspace' } }];
  });

  afterEach(() => {
    delete process.env.TACKLE_TEST_WORKSPACE;
  });

  it('returns TACKLE_TEST_WORKSPACE when set', () => {
    process.env.TACKLE_TEST_WORKSPACE = '/tmp/override-ws';
    expect(resolveWorkspaceRoot()).toBe('/tmp/override-ws');
  });

  it('falls back to vscode workspaceFolders[0] when env var unset', () => {
    expect(resolveWorkspaceRoot()).toBe('/real/workspace');
  });

  it('returns undefined when env var unset and no workspace folder', () => {
    mockWorkspaceFolders.value = undefined;
    expect(resolveWorkspaceRoot()).toBeUndefined();
  });
});

describe('ensureTackleDir', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tackle-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('creates .tackle/ directory when missing', async () => {
    await ensureTackleDir(tmpDir);
    const stat = await fs.stat(path.join(tmpDir, '.tackle'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('creates .gitignore with .tackle/ when .gitignore missing', async () => {
    await ensureTackleDir(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toBe('.tackle/\n');
  });

  it('appends .tackle/ to existing .gitignore that does not have it', async () => {
    await fs.writeFile(path.join(tmpDir, '.gitignore'), 'node_modules/\n');
    await ensureTackleDir(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf-8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.tackle/');
  });

  it('does not duplicate .tackle/ entry on repeated calls', async () => {
    await ensureTackleDir(tmpDir);
    await ensureTackleDir(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf-8');
    const matches = content.match(/\.tackle\//g);
    expect(matches).toHaveLength(1);
  });

  it('handles .gitignore that already contains .tackle/', async () => {
    await fs.writeFile(path.join(tmpDir, '.gitignore'), 'node_modules/\n.tackle/\n');
    await ensureTackleDir(tmpDir);
    const content = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf-8');
    const matches = content.match(/\.tackle\//g);
    expect(matches).toHaveLength(1);
  });
});
