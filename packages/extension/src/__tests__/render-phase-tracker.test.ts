import { describe, it, expect } from 'vitest';
import type { Task, Phase, Plan } from '@tackle/shared';
import { renderPhaseTracker } from '../sidebar/render-phase-tracker';

const task = (over: Partial<Task> = {}): Task => ({
  id: 1,
  external_id: '42',
  external_system: 'github',
  title: 'T',
  description: '',
  external_status: 'open',
  assignee: null,
  parent_external_id: null,
  worktree_path: null,
  worktree_branch: null,
  worktree_base_branch: null,
  tackle_status: 'not_started',
  synced_at: '',
  created_at: '',
  ...over,
});

const phase = (over: Partial<Phase> = {}): Phase => ({
  id: 10,
  plan_id: 1,
  task_id: 1,
  external_id: '101',
  name: 'Phase A',
  description: '',
  status: 'pending',
  sort_order: 0,
  created_at: '',
  ...over,
});

const plan = (over: Partial<Plan> = {}): Plan => ({
  id: 1,
  task_id: 1,
  source_path: '',
  source_kind: 'markdown',
  source_ref: 'plans/42-foo.md',
  extracted_at: null,
  created_at: '',
  ...over,
});

describe('renderPhaseTracker', () => {
  it('renders an outer container with the slot class', () => {
    const html = renderPhaseTracker({ task: task(), phases: [], plans: [] });
    expect(html).toContain('class="phase-tracker"');
  });

  it('renders a progress bar slot reflecting 0/0 when no phases', () => {
    const html = renderPhaseTracker({ task: task(), phases: [], plans: [] });
    expect(html).toMatch(/class="phase-tracker-progress"[^>]*data-complete="0"[^>]*data-total="0"/);
  });

  it('progress bar reflects complete vs total when phases exist', () => {
    const html = renderPhaseTracker({
      task: task({ tackle_status: 'plan_approved' }),
      phases: [
        phase({ id: 10, status: 'done', sort_order: 0 }),
        phase({ id: 11, external_id: '102', status: 'in_progress', sort_order: 1 }),
        phase({ id: 12, external_id: '103', status: 'pending', sort_order: 2 }),
      ],
      plans: [plan()],
    });
    expect(html).toMatch(
      /class="phase-tracker-progress"[^>]*data-complete="1"[^>]*data-total="3"/,
    );
  });

  it('header includes a Plan Source link when plans[].source_ref is set', () => {
    const html = renderPhaseTracker({
      task: task(),
      phases: [],
      plans: [plan({ source_ref: 'plans/42-foo.md' })],
    });
    expect(html).toContain('class="phase-tracker-source"');
    expect(html).toContain('plans/42-foo.md');
  });

  it('omits Plan Source link when no plan exists for the task', () => {
    const html = renderPhaseTracker({ task: task(), phases: [], plans: [] });
    expect(html).not.toContain('class="phase-tracker-source"');
  });

  it('renders an empty-state region when no phases exist', () => {
    const html = renderPhaseTracker({ task: task(), phases: [], plans: [] });
    expect(html).toContain('class="phase-tracker-empty"');
    expect(html).not.toContain('class="phase-tracker-rows"');
  });

  it('renders a rows region when phases exist', () => {
    const html = renderPhaseTracker({
      task: task(),
      phases: [phase()],
      plans: [plan()],
    });
    expect(html).toContain('class="phase-tracker-rows"');
    expect(html).not.toContain('class="phase-tracker-empty"');
  });

  describe('empty-state buttons', () => {
    it('at not_started: renders [+ Create Plan] and [Link existing plan…]', () => {
      const html = renderPhaseTracker({
        task: task({ tackle_status: 'not_started' }),
        phases: [],
        plans: [],
      });
      expect(html).toMatch(/data-action="createPlan"[^>]*data-task-id="1"/);
      expect(html).toMatch(/data-action="linkExistingPlan"[^>]*data-task-id="1"/);
      expect(html).toContain('Create Plan');
      expect(html).toContain('Link existing plan');
      expect(html).not.toContain('data-action="openPlanSession"');
    });

    it('at plan_started: renders [Open Plan Session →] and [Link existing plan…]', () => {
      const html = renderPhaseTracker({
        task: task({ tackle_status: 'plan_started' }),
        phases: [],
        plans: [],
      });
      expect(html).toMatch(/data-action="openPlanSession"[^>]*data-task-id="1"/);
      expect(html).toMatch(/data-action="linkExistingPlan"[^>]*data-task-id="1"/);
      expect(html).toContain('Open Plan Session');
      expect(html).not.toContain('data-action="createPlan"');
    });

    it('at plan_approved with no phases yet: renders no empty-state buttons', () => {
      const html = renderPhaseTracker({
        task: task({ tackle_status: 'plan_approved' }),
        phases: [],
        plans: [plan()],
      });
      expect(html).not.toContain('data-action="createPlan"');
      expect(html).not.toContain('data-action="openPlanSession"');
    });
  });

  describe('phase rows', () => {
    it('renders one row per phase with glyph, title, and external id', () => {
      const html = renderPhaseTracker({
        task: task(),
        phases: [
          phase({ id: 10, external_id: '101', name: 'Phase A', status: 'done', sort_order: 0 }),
          phase({
            id: 11,
            external_id: '102',
            name: 'Phase B',
            status: 'in_progress',
            sort_order: 1,
          }),
        ],
        plans: [plan()],
      });
      expect(html).toMatch(/class="phase-tracker-row"[^>]*data-phase-id="10"/);
      expect(html).toMatch(/class="phase-tracker-row"[^>]*data-phase-id="11"/);
      expect(html).toContain('Phase A');
      expect(html).toContain('Phase B');
      expect(html).toContain('#101');
      expect(html).toContain('#102');
    });

    it('renders phase glyph reflecting status', () => {
      const html = renderPhaseTracker({
        task: task(),
        phases: [
          phase({ id: 10, external_id: '101', status: 'done', sort_order: 0 }),
          phase({ id: 11, external_id: '102', status: 'in_progress', sort_order: 1 }),
          phase({ id: 12, external_id: '103', status: 'pending', sort_order: 2 }),
          phase({ id: 13, external_id: '104', status: 'failed', sort_order: 3 }),
        ],
        plans: [plan()],
      });
      expect(html).toMatch(/data-phase-id="10"[^>]*data-status="done"/);
      expect(html).toMatch(/data-phase-id="11"[^>]*data-status="in_progress"/);
      expect(html).toMatch(/data-phase-id="12"[^>]*data-status="pending"/);
      expect(html).toMatch(/data-phase-id="13"[^>]*data-status="failed"/);
    });

    it('row click action scrolls Sessions to the phase', () => {
      const html = renderPhaseTracker({
        task: task(),
        phases: [phase({ id: 10, external_id: '101', sort_order: 0 })],
        plans: [plan()],
      });
      expect(html).toMatch(/data-action="scrollToPhaseSession"[^>]*data-phase-id="10"/);
    });

    it('rows are ordered by sort_order ascending', () => {
      const html = renderPhaseTracker({
        task: task(),
        phases: [
          phase({ id: 12, external_id: '103', name: 'Third', sort_order: 2 }),
          phase({ id: 10, external_id: '101', name: 'First', sort_order: 0 }),
          phase({ id: 11, external_id: '102', name: 'Second', sort_order: 1 }),
        ],
        plans: [plan()],
      });
      const i1 = html.indexOf('First');
      const i2 = html.indexOf('Second');
      const i3 = html.indexOf('Third');
      expect(i1).toBeGreaterThan(-1);
      expect(i1).toBeLessThan(i2);
      expect(i2).toBeLessThan(i3);
    });

    it('escapes phase name', () => {
      const html = renderPhaseTracker({
        task: task(),
        phases: [phase({ id: 10, external_id: '101', name: '<script>x</script>' })],
        plans: [plan()],
      });
      expect(html).not.toContain('<script>x</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
