import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  dialog.showErrorBox('Chartroom Error', err.stack || err.message);
});

interface GitHubConfig {
  owner: string;
  repo: string;
  token?: string;
}

function getGhCliToken(): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile('gh', ['auth', 'token'], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(undefined);
      const token = stdout.trim();
      resolve(token || undefined);
    });
  });
}

async function loadGitHubConfig(): Promise<GitHubConfig | null> {
  const owner = process.env.CHARTROOM_GITHUB_OWNER;
  const repo = process.env.CHARTROOM_GITHUB_REPO;
  if (owner && repo) {
    return { owner, repo, token: process.env.CHARTROOM_GITHUB_TOKEN };
  }

  const configPath = path.join(app.getPath('userData'), 'config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw);
    if (config.github?.owner && config.github?.repo) {
      return {
        owner: config.github.owner,
        repo: config.github.repo,
        token: config.github.token,
      };
    }
  } catch {
    // No config file or malformed — fall through
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || (await getGhCliToken());
  if (!token) return null;
  return { owner: 'savoy9', repo: 'chartroom', token };
}

async function main() {
  const [
    { createDatabase },
    { TaskRepository },
    { registerTaskHandlers, registerSyncHandlers, registerSessionHandlers, registerTerminalHandlers, registerWorkspaceHandlers, registerPlanHandlers, registerFileHandlers },
    { GitHubSyncService },
    { Octokit },
    { PsmuxManager },
    { PsmuxAttachment },
    { WorkspaceManager },
    { PlanRepository },
    { PhaseRepository },
    { PlanService },
    { FileService },
  ] = await Promise.all([
    import('./db'),
    import('./task-repository'),
    import('./ipc-handlers'),
    import('./github-sync'),
    import('@octokit/rest'),
    import('./psmux-manager'),
    import('./psmux-attachment'),
    import('./workspace-manager'),
    import('./plan-repository'),
    import('./phase-repository'),
    import('./plan-service'),
    import('./file-service'),
  ]);

  const dbPath = path.join(app.getPath('userData'), 'chartroom.db');
  const db = createDatabase(dbPath);
  const taskRepo = new TaskRepository(db);

  const ghConfig = await loadGitHubConfig();
  let syncService: InstanceType<typeof GitHubSyncService> | null = null;

  if (ghConfig) {
    const octokit = new Octokit(ghConfig.token ? { auth: ghConfig.token } : {});
    syncService = new GitHubSyncService(octokit, taskRepo, ghConfig.owner, ghConfig.repo);
  }

  const psmuxManager = new PsmuxManager();
  const attachment = new PsmuxAttachment();
  const workspace = new WorkspaceManager(db, psmuxManager);
  const planRepo = new PlanRepository(db);
  const phaseRepo = new PhaseRepository(db);
  const planService = new PlanService(planRepo, phaseRepo);
  const fileService = new FileService(process.cwd());

  // Default psmux session — used until a task is selected
  const defaultSessionName = 'chartroom-default';
  if (!psmuxManager.hasSession(defaultSessionName)) {
    psmuxManager.createSession(defaultSessionName);
  }

  registerTaskHandlers(taskRepo);
  registerSyncHandlers(syncService);
  registerSessionHandlers(workspace);
  registerTerminalHandlers(attachment, psmuxManager, defaultSessionName);
  registerWorkspaceHandlers(workspace, attachment);
  registerPlanHandlers(planService, phaseRepo);
  registerFileHandlers(fileService);

  function createWindow() {
    const mainWindow = new BrowserWindow({
      width: 1600,
      height: 900,
      title: 'Chartroom',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    } else {
      mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
    }

    if (syncService) {
      void syncService.sync().then((result: { success: boolean }) => {
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
