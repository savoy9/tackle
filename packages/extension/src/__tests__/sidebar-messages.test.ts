import { describe, it, expect, vi } from 'vitest';
import { post, type InboundMessage, type OutboundMessage } from '../sidebar/messages';

describe('sidebar messages', () => {
  it('post() sends the typed message via the VS Code webview API', () => {
    const postMessage = vi.fn();
    const api = { postMessage };
    const msg: InboundMessage = { type: 'activateTask', id: 3 };
    post(api, msg);
    expect(postMessage).toHaveBeenCalledWith(msg);
  });

  it('inbound message verbs type-check (compile-time)', () => {
    const msgs: InboundMessage[] = [
      { type: 'activateTask', id: 1 },
      { type: 'enterDetail', id: 1 },
      { type: 'exitDetail' },
      { type: 'toggleExpanded', id: 1 },
      { type: 'toggleClosedFolder' },
    ];
    expect(msgs).toHaveLength(5);
  });

  it('outbound render message carries html', () => {
    const m: OutboundMessage = { type: 'render', html: '<div/>' };
    expect(m.html).toBe('<div/>');
  });
});
