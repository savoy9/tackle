import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import type { Task } from '@chartroom/shared';

const mockTasks: Task[] = [
  {
    id: 1,
    external_id: '1',
    external_system: 'github',
    title: 'Build the scaffold',
    description: 'Set up the monorepo',
    status: 'open',
    assignee: 'alice',
    synced_at: '2026-04-18T00:00:00Z',
    created_at: '2026-04-18T00:00:00Z',
  },
  {
    id: 2,
    external_id: '2',
    external_system: 'github',
    title: 'Wire up SQLite',
    description: 'Add database layer',
    status: 'closed',
    assignee: null,
    synced_at: '2026-04-18T00:00:00Z',
    created_at: '2026-04-18T00:00:00Z',
  },
];

beforeEach(() => {
  // Mock the chartroom API on window
  window.chartroom = {
    version: '0.1.0',
    tasks: {
      list: vi.fn().mockResolvedValue(mockTasks),
      get: vi
        .fn()
        .mockImplementation((id: number) => Promise.resolve(mockTasks.find((t) => t.id === id))),
    },
    sync: {
      refresh: vi.fn().mockResolvedValue({ success: true, synced: 2 }),
    },
  };
});

describe('3-panel layout', () => {
  it('renders all three panel headers', () => {
    render(<App />);

    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Terminal')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('can collapse the review panel', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('Review')).toBeInTheDocument();

    await user.click(screen.getByTitle('Collapse review panel'));
    expect(screen.queryByText('Review')).not.toBeInTheDocument();
  });

  it('can expand the review panel after collapsing', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByTitle('Collapse review panel'));
    expect(screen.queryByText('Review')).not.toBeInTheDocument();

    await user.click(screen.getByTitle('Expand review panel'));
    expect(screen.getByText('Review')).toBeInTheDocument();
  });
});

describe('task list from DB', () => {
  it('loads and displays tasks from the IPC API', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Build the scaffold')).toBeInTheDocument();
      expect(screen.getByText('Wire up SQLite')).toBeInTheDocument();
    });
  });

  it('shows task details when a task is clicked', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Build the scaffold')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Build the scaffold'));

    await waitFor(() => {
      expect(screen.getByText('Set up the monorepo')).toBeInTheDocument();
      expect(screen.getByText('alice')).toBeInTheDocument();
    });
  });

  it('shows status indicators for tasks', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Build the scaffold')).toBeInTheDocument();
    });

    // open task and closed task should both be present
    expect(screen.getByText('Build the scaffold')).toBeInTheDocument();
    expect(screen.getByText('Wire up SQLite')).toBeInTheDocument();
  });

  it('has a refresh button that triggers sync and reloads tasks', async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Build the scaffold')).toBeInTheDocument();
    });

    const refreshBtn = screen.getByTitle('Refresh tasks');
    await user.click(refreshBtn);

    expect(window.chartroom.sync.refresh).toHaveBeenCalled();
    // After refresh, tasks:list should be called again
    expect(window.chartroom.tasks.list).toHaveBeenCalledTimes(2);
  });
});
