import { describe, it, expect } from 'vitest';
import { SessionLoop } from '../session-loop';

describe('SessionLoop', () => {
  const loop = new SessionLoop();

  it('suggests "build" as the first step for a new phase', () => {
    const next = loop.suggestNext([]);
    expect(next).toBe('build');
  });

  it('suggests "review" after a completed build session', () => {
    const next = loop.suggestNext([{ kind: 'build', status: 'completed' }]);
    expect(next).toBe('review');
  });

  it('suggests "test" after a completed review session', () => {
    const next = loop.suggestNext([
      { kind: 'build', status: 'completed' },
      { kind: 'review', status: 'completed' },
    ]);
    expect(next).toBe('test');
  });

  it('suggests null (done) after all three steps complete', () => {
    const next = loop.suggestNext([
      { kind: 'build', status: 'completed' },
      { kind: 'review', status: 'completed' },
      { kind: 'test', status: 'completed' },
    ]);
    expect(next).toBeNull();
  });

  it('suggests "build" again after a failed test (loop back)', () => {
    const next = loop.suggestNext([
      { kind: 'build', status: 'completed' },
      { kind: 'review', status: 'completed' },
      { kind: 'test', status: 'failed' },
    ]);
    expect(next).toBe('build');
  });

  it('ignores ad-hoc sessions (not build/review/test)', () => {
    const next = loop.suggestNext([
      { kind: 'build', status: 'completed' },
      { kind: 'debug', status: 'completed' }, // ad-hoc
    ]);
    expect(next).toBe('review');
  });

  it('suggests retrying the current step if it is still running', () => {
    const next = loop.suggestNext([{ kind: 'build', status: 'running' }]);
    expect(next).toBeNull(); // wait, don't suggest anything
  });

  it('derives phase progress from session history', () => {
    const progress = loop.phaseProgress([
      { kind: 'build', status: 'completed' },
      { kind: 'review', status: 'completed' },
    ]);
    expect(progress.build).toBe('done');
    expect(progress.review).toBe('done');
    expect(progress.test).toBe('pending');
  });

  it('marks a step as failed in progress', () => {
    const progress = loop.phaseProgress([
      { kind: 'build', status: 'completed' },
      { kind: 'review', status: 'completed' },
      { kind: 'test', status: 'failed' },
    ]);
    expect(progress.test).toBe('failed');
  });
});
