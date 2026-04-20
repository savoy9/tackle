import React from 'react';
import type { Task } from '@chartroom/shared';
import { PanelHeader, collapseButtonStyle } from '../components/PanelHeader';
import { TaskList } from '../components/TaskList';
import { TaskDetail } from '../components/TaskDetail';

interface TaskPanelProps {
  tasks: Task[];
  selectedTask: Task | null;
  selectedPhaseId: number | null;
  onSelectTask: (task: Task) => void;
  onDeselectTask: () => void;
  onRefresh: () => void;
  onNewSession: (taskId: number) => void;
  onSelectPhase: (phaseId: number | null) => void;
}

export function TaskPanel({
  tasks,
  selectedTask,
  selectedPhaseId,
  onSelectTask,
  onDeselectTask,
  onRefresh,
  onNewSession,
  onSelectPhase,
}: TaskPanelProps) {
  return (
    <>
      <PanelHeader
        title="Tasks"
        action={
          <button onClick={onRefresh} style={collapseButtonStyle} title="Refresh tasks">
            ↻
          </button>
        }
      />
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        <TaskList
          tasks={tasks}
          selectedId={selectedTask?.id ?? null}
          onSelect={onSelectTask}
        />
        {selectedTask && (
          <TaskDetail
            task={selectedTask}
            onClose={onDeselectTask}
            onNewSession={onNewSession}
            selectedPhaseId={selectedPhaseId}
            onSelectPhase={onSelectPhase}
          />
        )}
      </div>
    </>
  );
}
