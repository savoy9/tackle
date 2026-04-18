import { app, BrowserWindow } from 'electron';
import path from 'path';
import { createDatabase } from './db';
import { TaskRepository } from './task-repository';
import { registerTaskHandlers } from './ipc-handlers';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Initialize database
const dbPath = path.join(app.getPath('userData'), 'chartroom.db');
const db = createDatabase(dbPath);
const taskRepo = new TaskRepository(db);

// Seed dev data if tasks table is empty
const count = db.prepare<{ count: number }>('SELECT COUNT(*) as count FROM tasks').get();
if (count && count.count === 0) {
  const seed = [
    { id: '1', title: 'Phase 1: Scaffold monorepo', desc: 'Bootstrap the monorepo and Electron app', status: 'open' },
    { id: '2', title: 'Phase 2: SQLite + task list', desc: 'Wire up SQLite and task panel', status: 'open' },
    { id: '3', title: 'Phase 3: GitHub Issues sync', desc: 'Connect to GitHub API', status: 'open' },
    { id: '4', title: 'Phase 4: Terminal session', desc: 'Embed xterm.js with psmux', status: 'open' },
    { id: '5', title: 'Phase 5: Agent session lifecycle', desc: 'Spawn and manage Claude Code sessions', status: 'open' },
    { id: '6', title: 'Phase 6: Tasks + sessions linked', desc: 'Connect tasks and sessions', status: 'open' },
  ];
  for (const s of seed) {
    taskRepo.upsert({
      external_id: s.id,
      external_system: 'github',
      title: s.title,
      description: s.desc,
      status: s.status,
      assignee: null,
    });
  }
}

// Register IPC handlers
registerTaskHandlers(taskRepo);

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
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
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
