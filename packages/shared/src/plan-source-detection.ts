// Plan Source detection (#77).
//
// Given a Task's external_id, the listing of `plans/` directory entries, and
// the Task description, decide which Plan Source to record:
//
//   - If a file `plans/{external_id}-*.md` exists, it wins.
//     `source_kind = 'markdown'`, `source_ref = 'plans/<file>'`.
//   - Otherwise, the Task description (issue body) is the source of truth.
//     `source_kind = 'issue_body'`, `source_ref = null`.
//
// Pure function. The caller is responsible for reading the directory.

import type { PlanSourceKind } from './index';

export interface DetectPlanSourceInput {
  /** Task.external_id (the GitHub issue number, as a string). */
  external_id: string;
  /**
   * Filenames in the `plans/` directory (basenames only — `42-foo.md`, not
   * `plans/42-foo.md`). Order does not matter; the first match wins.
   */
  planFiles: string[];
  /** Task.description (the GitHub issue body). */
  description: string;
}

export interface DetectPlanSourceOutput {
  source_kind: PlanSourceKind;
  source_ref: string | null;
}

export function detectPlanSource(input: DetectPlanSourceInput): DetectPlanSourceOutput {
  const id = input.external_id;
  const match = input.planFiles.find(
    (f) => (f === `${id}.md` || f.startsWith(`${id}-`)) && f.endsWith('.md'),
  );
  if (match) {
    return { source_kind: 'markdown', source_ref: `plans/${match}` };
  }
  return { source_kind: 'issue_body', source_ref: null };
}
