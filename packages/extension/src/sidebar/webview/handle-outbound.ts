// Pure handler for outbound (host → webview) messages. Extracted so it can
// be unit-tested without a real DOM. The webview entry wires this to the
// `message` event.
import type { OutboundMessage } from '../messages';

interface MinimalRoot {
  // Loose enough to accept the real DOM's `DOMStringMap` (where indexed access
  // returns `string | undefined`) as well as test fakes built from a plain
  // `Record<string, string>`.
  dataset: Record<string, string | undefined>;
}
interface MinimalEl {
  innerHTML: string;
}
interface MinimalDoc {
  documentElement: MinimalRoot;
  getElementById(id: string): MinimalEl | null;
}

export function handleOutbound(msg: OutboundMessage, doc: MinimalDoc): void {
  if (!msg) return;
  switch (msg.type) {
    case 'themeKind':
      doc.documentElement.dataset.theme = msg.kind;
      return;
    case 'render': {
      const root = doc.getElementById('root');
      if (!root) return;
      const m = msg.html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      root.innerHTML = m ? m[1] : msg.html;
      return;
    }
  }
}
