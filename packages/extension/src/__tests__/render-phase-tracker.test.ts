import { describe, it, expect } from 'vitest';
import type { Task, Phase, Plan, Session } from '@tackle/shared';
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

const sess = (id: number, phase_id: number | null, over: Partial<Session> = {}): Session => ({
  id,
  task_id: 1,
  phase_id,
  name: `s${id}`,
  kind: 'implement',
  status: 'running',
  psmux_name: `p${id}`,
  tab_label: `t${id}`,
  agent: null,
  worktree_path: null,
  sort_order: 0,
  claude_session_id: null,
  agent_state: 'idle',
  prior_claude_session_ids: null,
  started_at: '',
  ended_at: null,
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
    expect(html).toMatch(/class="phase-tracker-progress"[^>]*data-complete="1"[^>]*data-total="3"/);
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

  describe('Approve Plan button', () => {
    it('renders Approve Plan button when tackle_status is plan_awaiting_approval', () => {
      const html = renderPhaseTracker({
        task: task({ tackle_status: 'plan_awaiting_approval' }),
        phases: [phase()],
        plans: [plan()],
      });
      expect(html).toMatch(/data-action="approvePlan"[^>]*data-task-id="1"/);
      expect(html).toContain('Approve Plan');
    });

    it('does NOT render Approve Plan button at other statuses', () => {
      for (const status of ['not_started', 'plan_started', 'plan_approved', 'merged'] as const) {
        const html = renderPhaseTracker({
          task: task({ tackle_status: status }),
          phases: [phase()],
          plans: [plan()],
        });
        expect(html, `status=${status}`).not.toContain('data-action="approvePlan"');
      }
    });
  });

  describe('Implement button', () => {
    it('renders Implement button when tackle_status is plan_approved', () => {
      const html = renderPhaseTracker({
        task: task({ tackle_status: 'plan_approved' }),
        phases: [phase()],
        plans: [plan()],
      });
      expect(html).toMatch(/data-action="startImplementation"[^>]*data-task-id="1"/);
      expect(html).toContain('Implement');
    });

    it('does NOT render Implement button at other statuses', () => {
      for (const status of [
        'not_started',
        'plan_started',
        'plan_awaiting_approval',
        'implementation_started',
        'merged',
      ] as const) {
        const html = renderPhaseTracker({
          task: task({ tackle_status: status }),
          phases: [phase()],
          plans: [plan()],
        });
        expect(html, `status=${status}`).not.toContain('data-action="startImplementation"');
      }
    });
  });

  describe('Phase activity lights (#82)', () => {
    it('marks a phase row as activity=working when it has a running session with agent_state=working', () => {
      const html = renderPhaseTracker({
        task: task(),
        phases: [phase({ id: 10, external_id: '101', sort_order: 0 })],
        plans: [plan()],
        sessions: [sess(1, 10, { agent_state: 'working' })],
      });
      expect(html).toMatch(/data-phase-id="10"[^>]*data-activity="working"/);
    });

    it('marks a phase row as activity=idle when it has no running sessions', () => {
      const html = renderPhaseTracker({
        task: task(),
        phases: [phase({ id: 10, external_id: '101', sort_order: 0 })],
        plans: [plan()],
        sessions: [],
      });
      expect(html).toMatch(/data-phase-id="10"[^>]*data-activity="idle"/);
    });

    it('prefers working > waiting > idle when a phase has multiple running sessions', () => {
      const html = renderPhaseTracker({
        task: task(),
        phases: [phase({ id: 10, external_id: '101', sort_order: 0 })],
        plans: [plan()],
        sessions: [
          sess(1, 10, { agent_state: 'idle' }),
          sess(2, 10, { agent_state: 'waiting' }),
          sess(3, 10, { agent_state: 'working' }),
        ],
      });
      expect(html).toMatch(/data-phase-id="10"[^>]*data-activity="working"/);
    });

    it('ignores non-running sessions when computing activity', () => {
      const html = renderPhaseTracker({
        task: task(),
        phases: [phase({ id: 10, external_id: '101', sort_order: 0 })],
        plans: [plan()],
        sessions: [sess(1, 10, { agent_state: 'working', status: 'stopped' })],
      });
      expect(html).toMatch(/data-phase-id="10"[^>]*data-activity="idle"/);
    });

    it('ignores sessions linked to a different phase', () => {
      const html = renderPhaseTracker({
        task: task(),
        phases: [
          phase({ id: 10, external_id: '101', sort_order: 0 }),
          phase({ id: 11, external_id: '102', sort_order: 1 }),
        ],
        plans: [plan()],
        sessions: [sess(1, 11, { agent_state: 'working' })],
      });
      expect(html).toMatch(/data-phase-id="10"[^>]*data-activity="idle"/);
      expect(html).toMatch(/data-phase-id="11"[^>]*data-activity="working"/);
    });
  });
});
