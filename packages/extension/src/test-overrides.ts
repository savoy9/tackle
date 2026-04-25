/**
 * Centralized test-mode escape hatches per ADR-0012.
 *
 * Production code consults these getters instead of reading `process.env`
 * directly. Values are read live on each access, which keeps unit tests
 * that mutate env vars between cases working without re-importing the
 * module. One discoverable surface for the four overrides
 * (`grep TestOverride` finds every consumer).
 */

export const TestOverride = {
  get workspace(): string | undefined {
    return process.env.TACKLE_TEST_WORKSPACE;
  },
  get db(): string | undefined {
    return process.env.TACKLE_TEST_DB;
  },
  get psmuxPrefix(): string | undefined {
    return process.env.TACKLE_TEST_PSMUX_PREFIX;
  },
  get jsonlDir(): string | undefined {
    return process.env.TACKLE_TEST_JSONL_DIR;
  },
} as const;
