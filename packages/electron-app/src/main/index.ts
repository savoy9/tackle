import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { createDatabase } from './db';
import { TaskRepository } from './task-repository';
import { registerTaskHandlers, registerSyncHandlers } from './ipc-handlers';
import { GitHubSyncService } from './github-sync';
import { Octokit } from '@octokit/rest';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Initialize database
const dbPath = path.join(app.getPath('userData'), 'chartroom.db');
const db = createDatabase(dbPath);
const taskRepo = new TaskRepository(db);

// Load GitHub config
interface GitHubConfig {
  owner: string;
  repo: string;
  token?: string;
}

function loadGitHubConfig(): GitHubConfig | null {
  // Check env vars first
  const owner = process.env.CHARTROOM_GITHUB_OWNER;
  const repo = process.env.CHARTROOM_GITHUB_REPO;
  if (owner && repo) {
    return { owner, repo, token: process.env.CHARTROOM_GITHUB_TOKEN };
  }

  // Check config file
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

  // Default: dogfood with this repo
  return { owner: 'savoy9', repo: 'chartroom', token: process.env.GITHUB_TOKEN };
}

// Create sync service
const ghConfig = loadGitHubConfig();
let syncService: GitHubSyncService | null = null;

if (ghConfig) {
  const octokit = new Octokit(ghConfig.token ? { auth: ghConfig.token } : {});
  syncService = new GitHubSyncService(octokit, taskRepo, ghConfig.owner, ghConfig.repo);
}

// Register IPC handlers
registerTaskHandlers(taskRepo);
registerSyncHandlers(syncService);

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

  // Auto-sync on launch
  if (syncService) {
    syncService.sync().catch(console.error);
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
