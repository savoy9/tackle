import type { Session } from '@tackle/shared';

export type Glyph = '✳️' | '⏳' | '●' | '○' | '✔️' | '🚫';

/**
 * Per-session glyph. Priority:
 *  - agent_state=waiting → ✳️
 *  - agent_state=working → ⏳
 *  - status=running → ●  (MVP: all running shown as ●)
 *  - status=completed → ✔️
 *  - status=stopped → 🚫
 *  - fallback → ○
 */
export function sessionGlyph(session: Session): Glyph {
  if (session.status === 'running') {
    if (session.agent_state === 'waiting') return '✳️';
    if (session.agent_state === 'working') return '⏳';
    return '●';
  }
  if (session.status === 'completed') return '✔️';
  if (session.status === 'stopped') return '🚫';
  return '○';
}

/**
 * Rollup over sessions for a task, following the documented urgency priority:
 *   ✳️ > ⏳ > ● > ○ > ✔️-only > 🚫-only.
 * Empty list → ○.
 */
export function rollupGlyph(sessions: Session[]): Glyph {
  if (sessions.length === 0) return '○';
  const glyphs = sessions.map(sessionGlyph);
  if (glyphs.includes('✳️')) return '✳️';
  if (glyphs.includes('⏳')) return '⏳';
  if (glyphs.includes('●')) return '●';
  if (glyphs.includes('○')) return '○';
  if (glyphs.includes('✔️')) return '✔️';
  if (glyphs.includes('🚫')) return '🚫';
  return '○';
}
