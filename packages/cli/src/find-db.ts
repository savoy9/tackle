import { existsSync } from 'fs';
import { join, dirname } from 'path';

export function findDatabasePath(startDir?: string): string | null {
  let dir = startDir ?? process.cwd();
  while (true) {
    const candidate = join(dir, '.tackle', 'tackle.db');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
