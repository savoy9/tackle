import React, { useState, useEffect, useCallback } from 'react';
import { PanelHeader, collapseButtonStyle } from '../components/PanelHeader';

interface ReviewPanelProps {
  onCollapse: () => void;
  planPath: string | null;
}

export function ReviewPanel({ onCollapse, planPath }: ReviewPanelProps) {
  const [currentPath, setCurrentPath] = useState<string | null>(planPath);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [dirEntries, setDirEntries] = useState<{ name: string; isDirectory: boolean }[]>([]);
  const [browsingPath, setBrowsingPath] = useState('.');
  const [mode, setMode] = useState<'file' | 'browse'>('browse');
  const [dirty, setDirty] = useState(false);

  // Load directory listing
  useEffect(() => {
    if (mode === 'browse' && window.chartroom?.files) {
      window.chartroom.files
        .list(browsingPath)
        .then(setDirEntries)
        .catch(() => setDirEntries([]));
    }
  }, [browsingPath, mode]);

  // Auto-open plan file when it changes
  useEffect(() => {
    if (planPath && window.chartroom?.files) {
      setCurrentPath(planPath);
      setMode('file');
      window.chartroom.files
        .read(planPath)
        .then(setFileContent)
        .catch(() => setFileContent(null));
    }
  }, [planPath]);

  const openFile = useCallback(async (relativePath: string) => {
    if (!window.chartroom?.files) return;
    try {
      const content = await window.chartroom.files.read(relativePath);
      setCurrentPath(relativePath);
      setFileContent(content);
      setMode('file');
      setDirty(false);
    } catch (err) {
      console.error('Failed to read file:', err);
    }
  }, []);

  const navigateDir = useCallback((name: string) => {
    setBrowsingPath((prev) => (prev === '.' ? name : `${prev}/${name}`));
  }, []);

  const navigateUp = useCallback(() => {
    setBrowsingPath((prev) => {
      const parts = prev.split('/');
      return parts.length <= 1 ? '.' : parts.slice(0, -1).join('/');
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentPath || fileContent === null || !window.chartroom?.files) return;
    await window.chartroom.files.write(currentPath, fileContent);
    setDirty(false);
  }, [currentPath, fileContent]);

  return (
    <>
      <PanelHeader
        title="Review"
        action={
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setMode(mode === 'browse' ? 'file' : 'browse')}
              style={{ ...collapseButtonStyle, fontSize: 11 }}
              title={mode === 'browse' ? 'Back to file' : 'Browse files'}
            >
              {mode === 'browse' ? '📄' : '📁'}
            </button>
            <button onClick={onCollapse} style={collapseButtonStyle} title="Collapse review panel">
              ›
            </button>
          </div>
        }
      />

      {mode === 'browse' ? (
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px', fontSize: 12 }}>
          <div style={{ marginBottom: 8, color: '#999' }}>
            {browsingPath === '.' ? 'Root' : browsingPath}
            {browsingPath !== '.' && (
              <button
                onClick={navigateUp}
                style={{ ...collapseButtonStyle, fontSize: 10, marginLeft: 8, padding: '1px 6px' }}
              >
                ↑
              </button>
            )}
          </div>
          {dirEntries.map((entry) => (
            <div
              key={entry.name}
              onClick={() =>
                entry.isDirectory
                  ? navigateDir(entry.name)
                  : openFile(browsingPath === '.' ? entry.name : `${browsingPath}/${entry.name}`)
              }
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                color: entry.isDirectory ? '#7db4e0' : '#ccc',
                marginBottom: 2,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#22222a')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {entry.isDirectory ? '📁 ' : '  '}
              {entry.name}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {currentPath && (
            <div
              style={{
                padding: '4px 12px',
                fontSize: 11,
                color: '#999',
                borderBottom: '1px solid #2a2a2e',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                {currentPath}
                {dirty ? ' •' : ''}
              </span>
              {dirty && (
                <button
                  onClick={handleSave}
                  style={{ ...collapseButtonStyle, fontSize: 10, padding: '1px 8px' }}
                  title="Save file (Ctrl+S)"
                >
                  Save
                </button>
              )}
            </div>
          )}
          {fileContent !== null ? (
            <textarea
              value={fileContent}
              onChange={(e) => {
                setFileContent(e.target.value);
                setDirty(true);
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                  e.preventDefault();
                  handleSave();
                }
              }}
              style={{
                flex: 1,
                background: '#1a1a1e',
                color: '#e0e0e0',
                border: 'none',
                padding: 12,
                fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
                fontSize: 13,
                lineHeight: 1.6,
                resize: 'none',
                outline: 'none',
              }}
              spellCheck={false}
            />
          ) : (
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
              No file open
            </div>
          )}
        </div>
      )}
    </>
  );
}
