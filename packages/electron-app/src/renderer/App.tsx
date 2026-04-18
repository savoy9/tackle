import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Task } from '@chartroom/shared';
import './types'; // ensure window.chartroom types are loaded

const MIN_PANEL_WIDTH = 200;
const DEFAULT_TASK_WIDTH = 300;
const DEFAULT_REVIEW_WIDTH = 350;

export default function App() {
  const [taskWidth, setTaskWidth] = useState(DEFAULT_TASK_WIDTH);
  const [reviewWidth, setReviewWidth] = useState(DEFAULT_REVIEW_WIDTH);
  const [reviewCollapsed, setReviewCollapsed] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadTasks = useCallback(() => {
    if (window.chartroom?.tasks) {
      window.chartroom.tasks.list().then(setTasks);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleRefresh = useCallback(async () => {
    if (window.chartroom?.sync) {
      await window.chartroom.sync.refresh();
      loadTasks();
    }
  }, [loadTasks]);

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTask(task);
  }, []);

  const startResize = useCallback(
    (panel: 'task' | 'review') => (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startTaskW = taskWidth;
      const startReviewW = reviewWidth;

      const onMouseMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        if (panel === 'task') {
          setTaskWidth(Math.max(MIN_PANEL_WIDTH, startTaskW + delta));
        } else {
          setReviewWidth(Math.max(MIN_PANEL_WIDTH, startReviewW - delta));
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [taskWidth, reviewWidth],
  );

  const effectiveReviewWidth = reviewCollapsed ? 0 : reviewWidth;

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: '#0e0e10',
        color: '#e0e0e0',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Task Panel */}
      <div
        style={{
          width: taskWidth,
          minWidth: MIN_PANEL_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          background: '#16161a',
          borderRight: '1px solid #2a2a2e',
        }}
      >
        <PanelHeader
          title="Tasks"
          action={
            <button onClick={handleRefresh} style={collapseButtonStyle} title="Refresh tasks">
              ↻
            </button>
          }
        />
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
          <TaskList
            tasks={tasks}
            selectedId={selectedTask?.id ?? null}
            onSelect={handleTaskClick}
          />
          {selectedTask && <TaskDetail task={selectedTask} onClose={() => setSelectedTask(null)} />}
        </div>
      </div>

      {/* Divider */}
      <Divider onMouseDown={startResize('task')} />

      {/* Terminal Panel */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          background: '#1a1a1e',
          minWidth: MIN_PANEL_WIDTH,
        }}
      >
        <PanelHeader title="Terminal" />
        <div
          data-testid="terminal-container"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontSize: 14,
          }}
        >
          Terminal will be connected in Phase 4
        </div>
      </div>

      {/* Divider + Review Panel */}
      {!reviewCollapsed && <Divider onMouseDown={startResize('review')} />}
      <div
        style={{
          width: effectiveReviewWidth,
          minWidth: reviewCollapsed ? 0 : MIN_PANEL_WIDTH,
          display: 'flex',
          flexDirection: 'column',
          background: '#16161a',
          borderLeft: reviewCollapsed ? 'none' : '1px solid #2a2a2e',
          overflow: 'hidden',
          transition: reviewCollapsed ? 'width 0.15s ease' : 'none',
        }}
      >
        {!reviewCollapsed && (
          <>
            <PanelHeader
              title="Review"
              action={
                <button
                  onClick={() => setReviewCollapsed(true)}
                  style={collapseButtonStyle}
                  title="Collapse review panel"
                >
                  ›
                </button>
              }
            />
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: 14,
              }}
            >
              Review panel (post-MVP)
            </div>
          </>
        )}
      </div>

      {/* Expand button when collapsed */}
      {reviewCollapsed && (
        <button
          onClick={() => setReviewCollapsed(false)}
          style={{
            ...collapseButtonStyle,
            position: 'absolute',
            right: 8,
            top: 8,
            zIndex: 10,
          }}
          title="Expand review panel"
        >
          ‹
        </button>
      )}
    </div>
  );
}

function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div
      style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        borderBottom: '1px solid #2a2a2e',
        fontSize: 13,
        fontWeight: 600,
        color: '#aaa',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        flexShrink: 0,
      }}
    >
      {title}
      {action}
    </div>
  );
}

function Divider({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        width: 5,
        cursor: 'col-resize',
        background: 'transparent',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => ((e.target as HTMLElement).style.background = '#3a3a4a')}
      onMouseLeave={(e) => ((e.target as HTMLElement).style.background = 'transparent')}
    />
  );
}

function TaskList({
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

function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
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
    </div>
  );
}

const collapseButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #333',
  color: '#aaa',
  cursor: 'pointer',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 16,
  lineHeight: 1,
};
