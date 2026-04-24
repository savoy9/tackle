import { describe, it, expect } from 'vitest';
import { handleOutbound } from '../sidebar/webview/handle-outbound';

describe('webview handleOutbound — themeKind (#45)', () => {
  it('sets document.documentElement.dataset.theme on themeKind messages', () => {
    const root = { dataset: {} as Record<string, string> };
    const doc = { documentElement: root, getElementById: () => null } as any;
    handleOutbound({ type: 'themeKind', kind: 'dark' }, doc);
    expect(root.dataset.theme).toBe('dark');
    handleOutbound({ type: 'themeKind', kind: 'hc-light' }, doc);
    expect(root.dataset.theme).toBe('hc-light');
  });

  it('mounts render html into #root, stripping the <body> wrapper', () => {
    const rootEl = { innerHTML: '' };
    const doc = {
      documentElement: { dataset: {} },
      getElementById: (id: string) => (id === 'root' ? rootEl : null),
    } as any;
    handleOutbound(
      { type: 'render', html: '<!doctype html><html><body><span>hi</span></body></html>' },
      doc,
    );
    expect(rootEl.innerHTML).toBe('<span>hi</span>');
  });
});
