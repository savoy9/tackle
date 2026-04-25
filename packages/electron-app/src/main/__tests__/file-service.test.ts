import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileService } from '../file-service';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('FileService', () => {
  let tmpDir: string;
  let service: FileService;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chartroom-test-'));
    service = new FileService(tmpDir);

    // Create some test files
    fs.mkdirSync(path.join(tmpDir, 'plans'));
    fs.writeFileSync(
      path.join(tmpDir, 'plans', 'auth.md'),
      '# Auth Plan\n\n### Phase 1: Build\n\nDetails.',
    );
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Project');
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'console.log("hello");');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads a file by relative path', () => {
    const content = service.readFile('plans/auth.md');
    expect(content).toContain('# Auth Plan');
    expect(content).toContain('Phase 1');
  });

  it('lists files in a directory', () => {
    const entries = service.listDirectory('.');
    const names = entries.map((e) => e.name);
    expect(names).toContain('plans');
    expect(names).toContain('README.md');
    expect(names).toContain('src');
  });

  it('lists files with type info', () => {
    const entries = service.listDirectory('.');
    const plans = entries.find((e) => e.name === 'plans');
    const readme = entries.find((e) => e.name === 'README.md');
    expect(plans?.isDirectory).toBe(true);
    expect(readme?.isDirectory).toBe(false);
  });

  it('writes a file', () => {
    service.writeFile('plans/auth.md', '# Updated\n\nNew content.');
    const content = service.readFile('plans/auth.md');
    expect(content).toContain('# Updated');
  });

  it('throws on path traversal attempt', () => {
    expect(() => service.readFile('../../../etc/passwd')).toThrow();
    expect(() => service.writeFile('../../../tmp/evil', 'hack')).toThrow();
  });
});
