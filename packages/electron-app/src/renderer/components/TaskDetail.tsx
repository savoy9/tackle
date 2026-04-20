import React, { useState, useEffect } from 'react';
import type { Task, Phase } from '@chartroom/shared';
import type { ManagedSessionInfo } from '../types';
import { PlanTimeline } from './PlanTimeline';

export function TaskDetail({
  task,
  onClose,
  onNewSession,
  selectedPhaseId,
  onSelectPhase,
}: {
  task: Task;
  onClose: () => void;
  onNewSession: (taskId: number) => void;
  selectedPhaseId: number | null;
  onSelectPhase: (phaseId: number | null) => void;
}) {
  const [taskSessions, setTaskSessions] = useState<ManagedSessionInfo[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (window.chartroom?.sessions?.listForTask) {
      window.chartroom.sessions.listForTask(task.id).then((s) => {
        if (!cancelled) setTaskSessions(s);
      });
    }
    if (window.chartroom?.phases?.listForTask) {
      window.chartroom.phases.listForTask(task.id).then((p) => {
        if (!cancelled) setPhases(p);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  const handleLinkPlan = async () => {
    // For MVP: prompt for a file path and read it
    const path = prompt('Path to plan markdown file (relative to repo root):');
    if (!path) return;

    try {
      // Read file content via Node.js (exposed through IPC)
      // For now, use a simple fetch or placeholder
      const content = await window.chartroom?.plans?.link(task.id, path, '').then(() => null);
      // Reload phases
      if (window.chartroom?.phases?.listForTask) {
        const p = await window.chartroom.phases.listForTask(task.id);
        setPhases(p);
      }
    } catch (err) {
      console.error('Failed to link plan:', err);
    }
  };

  const handleUpdateStatus = async (phaseId: number, status: string) => {
    if (window.chartroom?.phases?.updateStatus) {
      await window.chartroom.phases.updateStatus(phaseId, status);
      // Reload phases
      const p = await window.chartroom.phases.listForTask(task.id);
      setPhases(p);
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        background: '#1a1a20',
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 600 }}>{task.title}</span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            fontSize: 16,
          }}
          title="Close details"
        >
          ×
        </button>
      </div>
      <div style={{ color: '#999', marginBottom: 6 }}>
        Status:{' '}
        <span style={{ color: task.status === 'open' ? '#3fb950' : '#8b949e' }}>{task.status}</span>
      </div>
      {task.assignee && (
        <div style={{ color: '#999', marginBottom: 6 }}>
          Assignee: <span style={{ color: '#ccc' }}>{task.assignee}</span>
        </div>
      )}
      {task.description && (
        <div style={{ color: '#bbb', marginTop: 8, lineHeight: 1.5 }}>{task.description}</div>
      )}

      {/* Plan timeline */}
      {phases.length > 0 ? (
        <PlanTimeline
          phases={phases}
          selectedPhaseId={selectedPhaseId}
          onSelectPhase={onSelectPhase}
          onUpdateStatus={handleUpdateStatus}
        />
      ) : (
        <div style={{ marginTop: 12, borderTop: '1px solid #2a2a2e', paddingTop: 8 }}>
          <button
            onClick={handleLinkPlan}
            style={{
              background: 'none',
              border: '1px solid #333',
              color: '#aaa',
              cursor: 'pointer',
              borderRadius: 4,
              padding: '4px 12px',
              fontSize: 11,
            }}
            title="Link a plan markdown file to this task"
          >
            Link Plan
          </button>
        </div>
      )}

      {/* Sessions section */}
      <div style={{ marginTop: 12, borderTop: '1px solid #2a2a2e', paddingTop: 8 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <span style={{ color: '#999', fontSize: 12, textTransform: 'uppercase' }}>Sessions</span>
          <button
            onClick={() => onNewSession(task.id)}
            style={{
              background: 'none',
              border: '1px solid #333',
              color: '#aaa',
              cursor: 'pointer',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: 11,
            }}
            title="New session for task"
          >
            +
          </button>
        </div>
        {taskSessions.length === 0 ? (
          <div style={{ color: '#555', fontSize: 12 }}>No sessions yet</div>
        ) : (
          taskSessions.map((s) => (
            <div
              key={s.id}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                marginBottom: 2,
                fontSize: 12,
                color: s.status === 'running' ? '#e0e0e0' : '#666',
                cursor: 'pointer',
              }}
            >
              {s.name}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
