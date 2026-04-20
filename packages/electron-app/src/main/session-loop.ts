export type LoopStep = 'build' | 'review' | 'test';
export type StepStatus = 'pending' | 'done' | 'failed' | 'running';

export interface SessionHistoryEntry {
  kind: string;
  status: string;
}

export interface PhaseProgress {
  build: StepStatus;
  review: StepStatus;
  test: StepStatus;
}

const LOOP_STEPS: LoopStep[] = ['build', 'review', 'test'];

/**
 * Manages the guided build → review → test loop within a phase.
 * Suggests the next step based on session history. Not a state machine —
 * it's advisory. The developer can ignore suggestions.
 */
export class SessionLoop {
  /**
   * Given the session history for a phase, suggest the next loop step.
   * Returns null if the loop is complete or a step is still running.
   */
  suggestNext(history: SessionHistoryEntry[]): LoopStep | null {
    // Filter to only loop-relevant sessions
    const loopSessions = history.filter((s) =>
      LOOP_STEPS.includes(s.kind as LoopStep),
    );

    // If anything is still running, don't suggest
    if (loopSessions.some((s) => s.status === 'running')) {
      return null;
    }

    // Check if the last test failed — loop back to build
    const lastTest = [...loopSessions].reverse().find((s) => s.kind === 'test');
    if (lastTest?.status === 'failed') {
      return 'build';
    }

    // Find the first step that hasn't been completed
    for (const step of LOOP_STEPS) {
      const completed = loopSessions.some(
        (s) => s.kind === step && s.status === 'completed',
      );
      if (!completed) {
        return step;
      }
    }

    // All steps complete
    return null;
  }

  /**
   * Derive the progress of each loop step from session history.
   */
  phaseProgress(history: SessionHistoryEntry[]): PhaseProgress {
    const progress: PhaseProgress = {
      build: 'pending',
      review: 'pending',
      test: 'pending',
    };

    for (const step of LOOP_STEPS) {
      const sessions = history.filter((s) => s.kind === step);
      if (sessions.length === 0) continue;

      const last = sessions[sessions.length - 1];
      if (last.status === 'completed') {
        progress[step] = 'done';
      } else if (last.status === 'running') {
        progress[step] = 'running';
      } else if (last.status === 'failed') {
        progress[step] = 'failed';
      }
    }

    return progress;
  }
}
