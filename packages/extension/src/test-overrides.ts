/**
 * Centralized test-mode escape hatches per ADR-0012.
 *
 * Production code consults these getters instead of reading `process.env`
 * directly. Values are read live on each access, which keeps unit tests
 * that mutate env vars between cases working without re-importing the
 * module. One discoverable surface for the four overrides
 * (`grep TestOverride` finds every consumer).
 *
 * Empty/whitespace-only env values are treated as unset — an empty
 * `TACKLE_TEST_DB` should fall back to the workspace-derived path, not
 * silently open a DB at the host's CWD.
 */

function readEnv(key: string): string | undefined {
  const v = process.env[key];
  if (v === undefined) return undefined;
  const trimmed = v.trim();
  return trimmed === '' ? undefined : trimmed;
}

export const TestOverride = {
  get workspace(): string | undefined {
    return readEnv('TACKLE_TEST_WORKSPACE');
  },
  get db(): string | undefined {
    return readEnv('TACKLE_TEST_DB');
  },
  get psmuxPrefix(): string | undefined {
    return readEnv('TACKLE_TEST_PSMUX_PREFIX');
  },
  get jsonlDir(): string | undefined {
    return readEnv('TACKLE_TEST_JSONL_DIR');
  },
} as const;
