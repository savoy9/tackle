import type {
  EventSource,
  PhaseCreatedEvent,
  PhaseRemovedEvent,
} from './events/event-bus';

/**
 * The shape of an external child item observed by Sync (a GitHub sub-issue
 * or task-list ref). Plan Discovery is read-only; it only ever consumes
 * this shape from external clients, never mutates the tracker.
 */
export interface ExternalChildItem {
  external_id: string;
  title: string;
  sort_order: number;
}

/**
 * Minimum fields Plan Discovery needs from a local `phases` row to compute
 * its diff. Pass `phasesRepo.listForPlan(...)` results through this shape.
 */
export interface LocalPhaseSnapshot {
  id: number;
  task_id: number;
  plan_id: number;
  external_id: string | null;
  name: string;
  sort_order: number;
}

export interface DiscoverInput {
  task_id: number;
  plan_id: number;
  local: LocalPhaseSnapshot[];
  incoming: ExternalChildItem[];
  source: EventSource;
}

export interface PhaseUpsert {
  phase_id: number;
  name: string;
  sort_order: number;
}

export interface DiscoverOutput {
  events: Array<PhaseCreatedEvent | PhaseRemovedEvent>;
  /**
   * Title / sort_order changes for already-mirrored phases. The caller
   * applies these to the `phases` table directly via the repository — they
   * are pure data corrections, not lifecycle transitions, so they do not
   * route through the Event Bus.
   */
  upserts: PhaseUpsert[];
}

/**
 * Pure diff over Plan Discovery inputs. Given the local phase mirror and the
 * external children just observed, return the events the Event Bus should
 * dispatch (created for net-new, removed for vanished) plus title/order
 * upserts for phases whose external metadata changed.
 *
 * Sub-issue identity is `external_id`.
 */
export function computePhaseDiscoveryEvents(input: DiscoverInput): DiscoverOutput {
  const { task_id, plan_id, local, incoming, source } = input;
  const localByExtId = new Map<string, LocalPhaseSnapshot>();
  for (const p of local) {
    if (p.external_id !== null) localByExtId.set(p.external_id, p);
  }
  const incomingByExtId = new Map<string, ExternalChildItem>();
  for (const c of incoming) incomingByExtId.set(c.external_id, c);

  const events: Array<PhaseCreatedEvent | PhaseRemovedEvent> = [];
  const upserts: PhaseUpsert[] = [];

  // Created or upserted: walk incoming.
  for (const c of incoming) {
    const existing = localByExtId.get(c.external_id);
    if (!existing) {
      events.push({
        type: 'phase.created',
        task_id,
        plan_id,
        external_id: c.external_id,
        name: c.title,
        sort_order: c.sort_order,
        source,
      });
    } else if (existing.name !== c.title || existing.sort_order !== c.sort_order) {
      upserts.push({ phase_id: existing.id, name: c.title, sort_order: c.sort_order });
    }
  }

  // Removed: any local phase whose external_id is no longer present.
  for (const p of local) {
    if (p.external_id === null) continue;
    if (!incomingByExtId.has(p.external_id)) {
      events.push({
        type: 'phase.removed',
        task_id,
        external_id: p.external_id,
        source,
      });
    }
  }

  return { events, upserts };
}
