// Build an index.html for the visual-diffs artifact. Run after the visual
// suite fails so the uploaded zip has a single landing page.
//
// Invoked from CI as:  node out-test/visual/build-diff-index.js
// Reads:  out-test/visual-diffs/*.diff.html
// Writes: out-test/visual-diffs/index.html

import * as fs from 'node:fs';
import * as path from 'node:path';

function main(): void {
  const dir = process.env.TACKLE_DIFFS_DIR ?? path.resolve(__dirname, '..', 'visual-diffs');
  if (!fs.existsSync(dir)) {
    // Nothing to index; create an empty marker so the artifact upload step
    // can still succeed conditionally.
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'index.html'),
      '<!doctype html><meta charset="utf-8"><title>visual diffs</title><p>No diffs.</p>',
      'utf8',
    );
    return;
  }
  const diffs = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.diff.html'))
    .sort();
  const items = diffs
    .map((f) => {
      const name = f.replace(/\.diff\.html$/, '');
      return `<li><a href="${f}">${name}</a> <small>(<a href="${name}.before.html">before</a> · <a href="${name}.after.html">after</a>)</small></li>`;
    })
    .join('\n');
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>visual snapshot diffs</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 32px auto; padding: 0 16px; }
  h1 { font-size: 18px; }
  li { margin: 6px 0; }
  small { color: #666; }
</style></head><body>
<h1>Visual snapshot diffs (${diffs.length})</h1>
<ul>
${items}
</ul>
</body></html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  console.log(`[visual] wrote diff index for ${diffs.length} state(s)`);
}

main();
