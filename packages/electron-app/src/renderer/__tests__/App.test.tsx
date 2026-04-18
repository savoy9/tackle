import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

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

    // Review panel visible initially
    expect(screen.getByText('Review')).toBeInTheDocument();

    // Click collapse button
    const collapseBtn = screen.getByTitle('Collapse review panel');
    await user.click(collapseBtn);

    // Review header should be gone
    expect(screen.queryByText('Review')).not.toBeInTheDocument();
  });

  it('can expand the review panel after collapsing', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Collapse
    await user.click(screen.getByTitle('Collapse review panel'));
    expect(screen.queryByText('Review')).not.toBeInTheDocument();

    // Expand
    await user.click(screen.getByTitle('Expand review panel'));
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('renders task list placeholder items', () => {
    render(<App />);

    expect(screen.getByText('Phase 1: Scaffold monorepo')).toBeInTheDocument();
    expect(screen.getByText('Phase 6: Tasks + sessions linked')).toBeInTheDocument();
  });
});
