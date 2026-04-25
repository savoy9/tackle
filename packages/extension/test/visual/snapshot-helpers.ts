// Snapshot read/write/assert helpers for the visual suite.
//
// Snapshots live under packages/extension/test/visual/snapshots/<state>.html.
// The compiled test runner reads them at runtime; we resolve relative to the
// SOURCE directory so `UPDATE_SNAPSHOTS=1` writes back into the repo, not into
// `out-test/`.

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as assert from 'node:assert';
import { normalize } from './normalize';

// Resolve snapshot dir back to source. The compiled file lives at
// out-test/visual/snapshot-helpers.js. The source snapshots live at
// test/visual/snapshots relative to the extension root.
function resolveSnapshotsDir(): string {
  // process.argv[1] points at out-test/runner/run-visual.js when launched.
  // walk to the extension root, then test/visual/snapshots.
  // But the simplest reliable path: env var set by the runner pointing at
  // the package root, with a sensible fallback.
  if (process.env.TACKLE_EXT_ROOT) {
    return path.resolve(process.env.TACKLE_EXT_ROOT, 'test', 'visual', 'snapshots');
  }
  // Fallback: from the compiled file's directory (out-test/visual/),
  // walk up two levels to the extension root, then into
  // test/visual/snapshots.
  const compiledDir = path.dirname(__filename);
  return path.resolve(compiledDir, '..', '..', 'test', 'visual', 'snapshots');
}

const SNAPSHOTS_DIR = resolveSnapshotsDir();

function snapshotPath(name: string): string {
  return path.join(SNAPSHOTS_DIR, `${name}.html`);
}

function shouldUpdate(name: string): boolean {
  if (process.env.UPDATE_SNAPSHOTS === '1') return true;
  const target = process.env.UPDATE_SNAPSHOT_NAME;
  return target !== undefined && target === name;
}

/**
 * Assert that `html` (raw, un-normalized) matches the on-disk snapshot named
 * `name`. If `UPDATE_SNAPSHOTS=1` (or `UPDATE_SNAPSHOT_NAME=<name>`) the
 * snapshot is rewritten on disk instead.
 */
export function assertSnapshot(name: string, html: string): void {
  const normalized = normalize(html);
  const file = snapshotPath(name);

  if (shouldUpdate(name)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, normalized + '\n', 'utf8');
    return;
  }

  if (!fs.existsSync(file)) {
    // First run: write the snapshot and fail loudly so the human notices.
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, normalized + '\n', 'utf8');
    assert.fail(
      `Snapshot ${name} did not exist; wrote initial snapshot. Re-run to confirm.`,
    );
  }

  const expected = fs.readFileSync(file, 'utf8').trimEnd();
  if (expected !== normalized) {
    // Write a side-by-side diff payload to out-test/visual-diffs/<name>.* so
    // the CI artifact builder has something to upload.
    writeDiffArtifact(name, expected, normalized);
    assert.strictEqual(
      normalized,
      expected,
      `Visual snapshot mismatch for "${name}". See visual-diffs/${name}.*`,
    );
  }
}

function diffsDir(): string {
  if (process.env.TACKLE_EXT_ROOT) {
    return path.resolve(process.env.TACKLE_EXT_ROOT, 'out-test', 'visual-diffs');
  }
  const compiledDir = path.dirname(__filename);
  return path.resolve(compiledDir, '..', 'visual-diffs');
}

function writeDiffArtifact(name: string, before: string, after: string): void {
  const dir = diffsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.before.html`), before, 'utf8');
  fs.writeFileSync(path.join(dir, `${name}.after.html`), after, 'utf8');
  fs.writeFileSync(
    path.join(dir, `${name}.diff.html`),
    sideBySideDiffPage(name, before, after),
    'utf8',
  );
}

function sideBySideDiffPage(name: string, before: string, after: string): string {
  // Each side is rendered inside an iframe srcdoc so the diff page is a
  // self-contained, openable HTML file.
  const escapeAttr = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>visual diff — ${name}</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; background: #1a1f26; color: #eee; }
  header { padding: 8px 12px; background: #2c3540; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; height: calc(100vh - 38px); }
  .pane { display: flex; flex-direction: column; min-width: 0; }
  .pane h2 { margin: 0; padding: 4px 8px; font-size: 12px; background: #232a33; }
  iframe { flex: 1; border: 0; background: #fff; }
</style></head><body>
<header>visual snapshot diff — <code>${name}</code></header>
<div class="pair">
  <div class="pane"><h2>before (committed snapshot)</h2>
    <iframe srcdoc="${escapeAttr(before)}"></iframe></div>
  <div class="pane"><h2>after (current run)</h2>
    <iframe srcdoc="${escapeAttr(after)}"></iframe></div>
</div></body></html>`;
}
