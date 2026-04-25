#!/usr/bin/env node
/**
 * Format the perf-results.json into a PR-comment markdown body.
 *
 * Usage: node scripts/format-perf-comment.js path/to/perf-results.json
 *
 * Emits the markdown body to stdout. The CI workflow pipes the output
 * into a file consumed by `peter-evans/create-or-update-comment@v4`.
 *
 * The `<!-- perf-comment -->` marker on the first line keys the
 * comment so repeat CI runs update it in place.
 */
const fs = require('node:fs');
const path = require('node:path');

const inputPath = process.argv[2] || path.resolve(process.cwd(), 'perf-results.json');
if (!fs.existsSync(inputPath)) {
  console.error(`perf-results.json not found at ${inputPath}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

function fmt(n) {
  return Number.isFinite(n) ? `${Math.round(n)} ms` : 'n/a';
}

const lines = [];
lines.push('<!-- perf-comment -->');
lines.push('## Tackle perf measurement');
lines.push('');
lines.push(
  `_Generated ${data.generatedAt} · ${data.iterations} runs per scenario · ` +
    `goal-line: **${data.goalLineMs} ms t_responsive** (informational only — see ADR-0012)._`,
);
lines.push('');
lines.push('### Results');
lines.push('');
lines.push('| Scenario | t_responsive (min / mean / max) | t_visible (min / mean / max) |');
lines.push('| --- | --- | --- |');
for (const s of data.scenarios) {
  const r = s.t_responsive;
  const v = s.t_visible;
  if (s.runs === 0) {
    lines.push(`| \`${s.scenario}\` | _failed — see job log_ | _failed — see job log_ |`);
    continue;
  }
  lines.push(
    `| \`${s.scenario}\` | ${fmt(r.min)} / ${fmt(r.mean)} / ${fmt(r.max)} | ` +
      `${fmt(v.min)} / ${fmt(v.mean)} / ${fmt(v.max)} |`,
  );
}
lines.push('');
lines.push('> **Goal-line (informational, NOT a pass/fail criterion):** ');
lines.push(
  `> Per ADR-0012, ${data.goalLineMs} ms is the target ceiling for \`t_responsive\` ` +
    'when activating a task. This perf job is **advisory** — a regression beyond the ' +
    'goal-line does not block merge. Use it to spot trends across PRs, not as a gate.',
);
lines.push('');
lines.push('Raw JSON is uploaded as the `perf-results` artifact for this run.');

process.stdout.write(lines.join('\n') + '\n');
