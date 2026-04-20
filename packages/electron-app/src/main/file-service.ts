import fs from 'fs';
import path from 'path';

export interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
}

/**
 * File read/write/list scoped to a root directory with path traversal protection.
 */
export class FileService {
  private resolvedRoot: string;

  constructor(rootDir: string) {
    this.resolvedRoot = path.resolve(rootDir);
  }

  private resolveSafe(relativePath: string): string {
    const resolved = path.resolve(this.resolvedRoot, relativePath);
    if (!resolved.startsWith(this.resolvedRoot)) {
      throw new Error(`Path traversal detected: ${relativePath}`);
    }
    return resolved;
  }

  readFile(relativePath: string): string {
    const fullPath = this.resolveSafe(relativePath);
    return fs.readFileSync(fullPath, 'utf-8');
  }

  writeFile(relativePath: string, content: string): void {
    const fullPath = this.resolveSafe(relativePath);
    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  listDirectory(relativePath: string): DirectoryEntry[] {
    const fullPath = this.resolveSafe(relativePath);
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    return entries.map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }));
  }
}
