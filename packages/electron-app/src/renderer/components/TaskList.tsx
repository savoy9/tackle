import React from 'react';
import type { Task } from '@chartroom/shared';

export function TaskList({
  tasks,
  selectedId,
  onSelect,
}: {
  tasks: Task[];
  selectedId: number | null;
  onSelect: (task: Task) => void;
}) {
  return (
    <div>
      {tasks.map((task) => (
        <div
          key={task.id}
          onClick={() => onSelect(task)}
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            marginBottom: 4,
            cursor: 'pointer',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: selectedId === task.id ? '#22222a' : 'transparent',
          }}
          onMouseEnter={(e) => {
            if (selectedId !== task.id)
              (e.currentTarget as HTMLElement).style.background = '#22222a';
          }}
          onMouseLeave={(e) => {
            if (selectedId !== task.id)
              (e.currentTarget as HTMLElement).style.background = 'transparent';
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: task.status === 'closed' ? '#8b949e' : '#3fb950',
              flexShrink: 0,
            }}
          />
          {task.title}
        </div>
      ))}
    </div>
  );
}
