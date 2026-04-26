#!/usr/bin/env node
import { createDatabase, SqliteTaskRepository, SqliteSessionRepository } from '@tackle/shared';
import { findDatabasePath } from './find-db';
import { taskList, taskShow, sessionList, sessionComplete } from './commands';

export const version = '0.1.0';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--version' || args[0] === '-v') {
    console.log(`tackle v${version}`);
    return;
  }

  const dbPath = findDatabasePath();
  if (!dbPath) {
    console.error('No .tackle/tackle.db found in current or parent directories.');
    process.exit(1);
  }

  const db = createDatabase(dbPath);
  const taskRepo = new SqliteTaskRepository(db);
  const sessionRepo = new SqliteSessionRepository(db);

  const [cmd, sub, ...rest] = args;

  try {
    if (cmd === 'task' && sub === 'list') {
      console.log(await taskList(taskRepo));
    } else if (cmd === 'task' && sub === 'show') {
      const id = Number(rest[0]);
      if (!id) {
        console.error('Usage: tackle task show <id>');
        process.exit(1);
      }
      console.log(await taskShow(taskRepo, id));
    } else if (cmd === 'session' && sub === 'list') {
      const taskIdx = rest.indexOf('--task');
      const taskId = taskIdx >= 0 ? Number(rest[taskIdx + 1]) : NaN;
      if (!taskId) {
        console.error('Usage: tackle session list --task <id>');
        process.exit(1);
      }
      console.log(await sessionList(sessionRepo, taskId));
    } else if (cmd === 'session' && sub === 'complete') {
      const id = Number(rest[0]);
      if (!id) {
        console.error('Usage: tackle session complete <id>');
        process.exit(1);
      }
      console.log(await sessionComplete(sessionRepo, id));
    } else {
      console.error(`Unknown command: ${cmd} ${sub ?? ''}`);
      process.exit(1);
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
