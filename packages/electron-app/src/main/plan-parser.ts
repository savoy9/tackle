export interface ExtractedPhase {
  name: string;
  description: string;
  sort_order: number;
}

/**
 * Extracts phase structure from plan markdown using template recognition.
 * Supports patterns:
 *   - ### Phase N: Name / ## Phase N: Name (including 1a, 1b variants)
 *   - ## Slice N: Name
 */
export class PlanParser {
  // Matches: ##/### Phase 0: Name, Phase 1a: Name, Slice 1: Name
  private static PHASE_HEADING = /^(#{2,3})\s+(?:Phase\s+\d+[a-z]?|Slice\s+\d+):\s+(.+)$/;

  static extractPhases(markdown: string): ExtractedPhase[] {
    const lines = markdown.split('\n');
    const phases: ExtractedPhase[] = [];
    let currentPhase: { name: string; descLines: string[]; headingLevel: number } | null = null;

    for (const line of lines) {
      const match = line.match(PlanParser.PHASE_HEADING);

      if (match) {
        // Flush previous phase
        if (currentPhase) {
          phases.push({
            name: currentPhase.name,
            description: currentPhase.descLines.join('\n').trim(),
            sort_order: phases.length,
          });
        }

        currentPhase = {
          name: match[2].trim(),
          descLines: [],
          headingLevel: match[1].length,
        };
      } else if (currentPhase) {
        // Check if this is a same-or-higher-level heading (end of phase content)
        const headingMatch = line.match(/^(#{1,3})\s+/);
        if (headingMatch && headingMatch[1].length <= currentPhase.headingLevel) {
          // Same or higher level heading that isn't a phase — flush
          phases.push({
            name: currentPhase.name,
            description: currentPhase.descLines.join('\n').trim(),
            sort_order: phases.length,
          });
          currentPhase = null;
        } else {
          currentPhase.descLines.push(line);
        }
      }
    }

    // Flush last phase
    if (currentPhase) {
      phases.push({
        name: currentPhase.name,
        description: currentPhase.descLines.join('\n').trim(),
        sort_order: phases.length,
      });
    }

    return phases;
  }
}
