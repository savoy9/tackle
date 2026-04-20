import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PsmuxManager } from '../psmux-manager';
import { PsmuxAttachment } from '../psmux-attachment';

describe('PsmuxAttachment', () => {
  const psmux = new PsmuxManager();
  const sessionName = `chartroom-attach-test-${Date.now()}`;

  beforeEach(() => {
    psmux.createSession(sessionName);
  });

  afterEach(() => {
    try { psmux.killSession(sessionName); } catch { /* ignore */ }
  });

  it('attaches to a session and receives data', async () => {
    const attachment = new PsmuxAttachment();
    const received: string[] = [];

    attachment.onData((data) => received.push(data));
    attachment.attach(sessionName);

    // Send a command that produces output
    psmux.sendKeys(sessionName, 'echo hello-chartroom');

    // Wait for output to arrive
    await new Promise((resolve) => setTimeout(resolve, 1000));

    attachment.detach();

    const allOutput = received.join('');
    expect(allOutput).toContain('hello-chartroom');
  });

  // NOTE: Write-through-PTY is tested here as a smoke test. Under bun's node-pty,
  // tmux attach may exit early due to ConPTY compatibility. Full write verification
  // happens in the Electron app (Node.js runtime) where node-pty works correctly.
  it('can create an attachment, write to it, and detach without crashing', () => {
    const attachment = new PsmuxAttachment();
    attachment.attach(sessionName);

    expect(attachment.isAttached).toBe(true);

    // Write should not throw even if PTY is unstable
    attachment.write('echo test\r');
    attachment.resize(120, 40);

    attachment.detach();
    expect(attachment.isAttached).toBe(false);
  });

  it('can switch sessions by detaching and reattaching', async () => {
    const session2 = `${sessionName}-2`;
    psmux.createSession(session2);

    const attachment = new PsmuxAttachment();
    const received: string[] = [];

    attachment.onData((data) => received.push(data));
    attachment.attach(sessionName);

    await new Promise((resolve) => setTimeout(resolve, 300));
    attachment.detach();

    received.length = 0;
    attachment.attach(session2);

    psmux.sendKeys(session2, 'echo session-two');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    attachment.detach();

    const allOutput = received.join('');
    expect(allOutput).toContain('session-two');

    try { psmux.killSession(session2); } catch { /* ignore */ }
  });

  it('handles resize', () => {
    const attachment = new PsmuxAttachment();
    attachment.attach(sessionName);

    // Should not throw
    expect(() => attachment.resize(120, 40)).not.toThrow();

    attachment.detach();
  });
});
