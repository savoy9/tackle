import React, { useState, useCallback, useRef } from 'react';

const MIN_PANEL_WIDTH = 200;
const DEFAULT_TASK_WIDTH = 300;
const DEFAULT_REVIEW_WIDTH = 350;

export default function App() {
  const [taskWidth, setTaskWidth] = useState(DEFAULT_TASK_WIDTH);
  const [reviewWidth, setReviewWidth] = useState(DEFAULT_REVIEW_WIDTH);
  const [reviewCollapsed, setReviewCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    [taskWidth, reviewWidth]
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
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
        <PanelHeader title="Tasks" />
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
          <TaskPlaceholder />
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

function PanelHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
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
      onMouseEnter={(e) =>
        ((e.target as HTMLElement).style.background = '#3a3a4a')
      }
      onMouseLeave={(e) =>
        ((e.target as HTMLElement).style.background = 'transparent')
      }
    />
  );
}

function TaskPlaceholder() {
  const items = [
    { title: 'Phase 1: Scaffold monorepo', status: 'open' },
    { title: 'Phase 2: SQLite + task list', status: 'open' },
    { title: 'Phase 3: GitHub Issues sync', status: 'open' },
    { title: 'Phase 4: Terminal session', status: 'open' },
    { title: 'Phase 5: Agent session lifecycle', status: 'open' },
    { title: 'Phase 6: Tasks + sessions linked', status: 'open' },
  ];

  return (
    <div>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            marginBottom: 4,
            cursor: 'pointer',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = '#22222a')
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = 'transparent')
          }
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#3fb950',
              flexShrink: 0,
            }}
          />
          {item.title}
        </div>
      ))}
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
