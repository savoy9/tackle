import type { Plan, Phase } from '@tackle/shared';
import type { PlanRepository } from './plan-repository';
import type { PhaseRepository } from './phase-repository';
import { PlanParser } from './plan-parser';

export interface LinkPlanResult {
  plan: Plan;
  phases: Phase[];
}

export class PlanService {
  constructor(
    private planRepo: PlanRepository,
    private phaseRepo: PhaseRepository,
  ) {}

  /**
   * Link a plan markdown file to a task and extract phases.
   * If a plan already exists for the task, it is replaced.
   */
  linkPlan(taskId: number, sourcePath: string, markdownContent: string): LinkPlanResult {
    // Remove existing plan and phases for this task
    this.phaseRepo.deleteForTask(taskId);
    this.planRepo.deleteForTask(taskId);

    // Create the plan
    const plan = this.planRepo.create({ task_id: taskId, source_path: sourcePath });

    // Extract phases from markdown
    const extracted = PlanParser.extractPhases(markdownContent);

    // Store phases
    const phases: Phase[] = extracted.map((ep) =>
      this.phaseRepo.create({
        plan_id: plan.id,
        task_id: taskId,
        name: ep.name,
        description: ep.description,
        sort_order: ep.sort_order,
      }),
    );

    return { plan, phases };
  }

  getPhasesForTask(taskId: number): Phase[] {
    return this.phaseRepo.listForTask(taskId);
  }

  getPlanForTask(taskId: number): Plan | undefined {
    return this.planRepo.getForTask(taskId);
  }
}
