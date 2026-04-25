import React from 'react';
import type { Phase } from '@tackle/shared';

interface PlanTimelineProps {
  phases: Phase[];
  selectedPhaseId: number | null;
  onSelectPhase: (phaseId: number | null) => void;
  onUpdateStatus: (phaseId: number, status: Phase['status']) => void;
}

const STATUS_COLORS: Record<Phase['status'], string> = {
  pending: '#555',
  in_progress: '#f0b429',
  done: '#3fb950',
  failed: '#f85149',
};

const STATUS_ICONS: Record<Phase['status'], string> = {
  pending: '○',
  in_progress: '●',
  done: '✓',
  failed: '✗',
};

const NEXT_STATUS: Record<Phase['status'], Phase['status']> = {
  pending: 'in_progress',
  in_progress: 'done',
  done: 'pending',
  failed: 'in_progress',
};

export function PlanTimeline({
  phases,
  selectedPhaseId,
  onSelectPhase,
  onUpdateStatus,
}: PlanTimelineProps) {
  if (phases.length === 0) return null;

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #2a2a2e', paddingTop: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span style={{ color: '#999', fontSize: 12, textTransform: 'uppercase' }}>
          Plan ({phases.filter((p) => p.status === 'done').length}/{phases.length})
        </span>
        {selectedPhaseId !== null && (
          <button
            onClick={() => onSelectPhase(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              fontSize: 11,
              textDecoration: 'underline',
            }}
          >
            Show all
          </button>
        )}
      </div>
      {phases.map((phase) => (
        <div
          key={phase.id}
          onClick={() => onSelectPhase(selectedPhaseId === phase.id ? null : phase.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '4px 8px',
            borderRadius: 4,
            marginBottom: 2,
            fontSize: 12,
            cursor: 'pointer',
            background: selectedPhaseId === phase.id ? '#2a2a3a' : 'transparent',
          }}
        >
          <span
            onClick={(e) => {
              e.stopPropagation();
              onUpdateStatus(phase.id, NEXT_STATUS[phase.status]);
            }}
            style={{
              color: STATUS_COLORS[phase.status],
              fontSize: 14,
              cursor: 'pointer',
              userSelect: 'none',
              width: 16,
              textAlign: 'center',
            }}
            title={`${phase.status} — click to change`}
          >
            {STATUS_ICONS[phase.status]}
          </span>
          <span style={{ color: phase.status === 'done' ? '#666' : '#ccc' }}>{phase.name}</span>
        </div>
      ))}
    </div>
  );
}
