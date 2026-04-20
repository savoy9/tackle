import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Task } from '@chartroom/shared';
import type { ManagedSessionInfo } from './types';
import { Divider, collapseButtonStyle } from './components/PanelHeader';
import { TaskPanel } from './panels/TaskPanel';
import { TerminalPanel } from './panels/TerminalPanel';
import { ReviewPanel } from './panels/ReviewPanel';
import './types';

const MIN_PANEL_WIDTH = 200;
const DEFAULT_TASK_WIDTH = 300;
const DEFAULT_REVIEW_WIDTH = 350;

export default function App() {
  const [taskWidth, setTaskWidth] = useState(DEFAULT_TASK_WIDTH);
  const [reviewWidth, setReviewWidth] = useState(DEFAULT_REVIEW_WIDTH);
  const [reviewCollapsed, setReviewCollapsed] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [sessions, setSessions] = useState<ManagedSessionInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [planPath, setPlanPath] = useState<string | null>(null);

  const handleSelectPhase = useCallback(async (phaseId: number | null) => {
    setSelectedPhaseId(phaseId);
    if (window.chartroom?.workspace) {
      if (phaseId !== null) {
        await window.chartroom.workspace.ensurePhaseWindow(phaseId);
      }
      await window.chartroom.workspace.selectPhase(phaseId);
    }
  }, []);

  const loadTasks = useCallback(() => {
    if (window.chartroom?.tasks) {
      window.chartroom.tasks.list().then(setTasks);
    }
  }, []);

  const loadSessions = useCallback(() => {
    if (window.chartroom?.sessions) {
      window.chartroom.sessions.list().then(setSessions);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    loadSessions();

    const unsub = window.chartroom?.sync?.onCompleted?.(() => {
      loadTasks();
    });
    return () => unsub?.();
  }, [loadTasks, loadSessions]);

  const handleNewSession = useCallback(
    async (options?: { name?: string; taskId?: number }) => {
      if (window.chartroom?.sessions) {
        const session = await window.chartroom.sessions.create(options);
        setActiveSessionId(session.id);
        loadSessions();
      }
    },
    [loadSessions],
  );

  const handleRefresh = useCallback(async () => {
    if (window.chartroom?.sync) {
      await window.chartroom.sync.refresh();
      loadTasks();
    }
  }, [loadTasks]);

  const handleTaskClick = useCallback(async (task: Task) => {
    setSelectedTask(task);
    setSelectedPhaseId(null); // Reset phase filter on task switch
    // Switch workspace — swaps psmux session and scopes everything to this task
    if (window.chartroom?.workspace) {
      await window.chartroom.workspace.switchTask(task.id);
    }
    // Load plan path for review panel
    if (window.chartroom?.plans) {
      const plan = await window.chartroom.plans.getForTask(task.id);
      setPlanPath(plan?.source_path ?? null);
    }
    loadSessions();
  }, [loadSessions]);

  // --- Resize logic ---
  const widthsRef = useRef({ taskWidth, reviewWidth });
  useEffect(() => {
    widthsRef.current = { taskWidth, reviewWidth };
  }, [taskWidth, reviewWidth]);

  const startResize = useCallback(
    (panel: 'task' | 'review') => (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const { taskWidth: startTaskW, reviewWidth: startReviewW } = widthsRef.current;

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
    [],
  );

  const effectiveReviewWidth = reviewCollapsed ? 0 : reviewWidth;

  return (
    <div
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
        <TaskPanel
          tasks={tasks}
          selectedTask={selectedTask}
          selectedPhaseId={selectedPhaseId}
          onSelectTask={handleTaskClick}
          onDeselectTask={() => setSelectedTask(null)}
          onRefresh={handleRefresh}
          onNewSession={(taskId) =>
            handleNewSession({ name: `Task ${taskId} session`, taskId })
          }
          onSelectPhase={handleSelectPhase}
        />
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
        <TerminalPanel
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewSession={() => handleNewSession()}
        />
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
          <ReviewPanel onCollapse={() => setReviewCollapsed(true)} planPath={planPath} />
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
