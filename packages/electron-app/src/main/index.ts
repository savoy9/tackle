import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
declare const MAIN_WINDOW_PRELOAD_VITE_ENTRY: string;

// Catch-all for unhandled errors
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  dialog.showErrorBox('Chartroom Error', err.stack || err.message);
});

function getGhCliToken(): string | undefined {
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

async function main() {
  // Dynamic imports so errors are catchable
  const { createDatabase } = await import('./db');
  const { TaskRepository } = await import('./task-repository');
  const {
    registerTaskHandlers,
    registerSyncHandlers,
    registerTerminalHandlers,
    registerSessionHandlers,
  } = await import('./ipc-handlers');
  const { GitHubSyncService } = await import('./github-sync');
  const { Octokit } = await import('@octokit/rest');

  // These may fail if native modules aren't built for Electron's Node version
  let TerminalManager: any = null;
  let SessionManager: any = null;
  try {
    const termMod = await import('./terminal-manager');
    TerminalManager = termMod.TerminalManager;
    const sessMod = await import('./session-manager');
    SessionManager = sessMod.SessionManager;
  } catch (err) {
    console.warn('Terminal/session modules unavailable (native module ABI mismatch?):', err);
  }

  // Initialize database
  const dbPath = path.join(app.getPath('userData'), 'chartroom.db');
  console.log('DB path:', dbPath);
  const db = createDatabase(dbPath);
  const taskRepo = new TaskRepository(db);

  // Load GitHub config
  interface GitHubConfig {
    owner: string;
    repo: string;
    token?: string;
  }

  function loadGitHubConfig(): GitHubConfig | null {
    const owner = process.env.CHARTROOM_GITHUB_OWNER;
    const repo = process.env.CHARTROOM_GITHUB_REPO;
    if (owner && repo) {
      return { owner, repo, token: process.env.CHARTROOM_GITHUB_TOKEN };
    }

    const configPath = path.join(app.getPath('userData'), 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.github?.owner && config.github?.repo) {
          return {
            owner: config.github.owner,
            repo: config.github.repo,
            token: config.github.token,
          };
        }
      } catch {
        // Ignore malformed config
      }
    }

    // Try to get token from gh CLI, env vars, etc.
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || getGhCliToken();
    return { owner: 'savoy9', repo: 'chartroom', token };
  }

  const ghConfig = loadGitHubConfig();
  let syncService: GitHubSyncService | null = null;

  if (ghConfig) {
    const octokit = new Octokit(ghConfig.token ? { auth: ghConfig.token } : {});
    syncService = new GitHubSyncService(octokit, taskRepo, ghConfig.owner, ghConfig.repo);
  }

  // Terminal manager (may fail if node-pty ABI mismatch)
  let terminalManager: any = null;
  let sessionManager: any = null;
  if (TerminalManager) {
    try {
      terminalManager = new TerminalManager();
      sessionManager = new SessionManager(db, terminalManager);
    } catch (err) {
      console.warn('Terminal manager unavailable:', err);
    }
  }

  // Register IPC handlers
  registerTaskHandlers(taskRepo);
  registerSyncHandlers(syncService);
  if (terminalManager) registerTerminalHandlers(terminalManager);
  if (sessionManager) registerSessionHandlers(sessionManager);

  function createWindow() {
    const mainWindow = new BrowserWindow({
      width: 1600,
      height: 900,
      title: 'Chartroom',
      webPreferences: {
        preload: MAIN_WINDOW_PRELOAD_VITE_ENTRY,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    }

    // Auto-sync on launch — notify renderer when done
    if (syncService) {
      syncService.sync().then((result) => {
        console.log('GitHub sync result:', result);
        if (result.success) {
          mainWindow.webContents.send('sync:completed');
        }
      });
    }
  }

  app.whenReady().then(createWindow);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

main().catch((err) => {
  console.error('FATAL:', err);
  dialog.showErrorBox('Chartroom Fatal Error', err.stack || err.message);
  app.quit();
});
