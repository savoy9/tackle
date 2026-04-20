import React from 'react';

export const collapseButtonStyle: React.CSSProperties = {
  background: 'none',
  border: '1px solid #333',
  color: '#aaa',
  cursor: 'pointer',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 16,
  lineHeight: 1,
};

export function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
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

export function Divider({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
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
