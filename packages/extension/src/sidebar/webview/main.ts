// Webview-side entry point. Receives rendered HTML from the host, delegates
// clicks to typed inbound messages.
import { post, type InboundMessage, type OutboundMessage } from '../messages';

declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };

const vscode = acquireVsCodeApi();

function send(msg: InboundMessage): void {
  post(vscode, msg);
}

function mount(html: string): void {
  const root = document.getElementById('root');
  if (!root) return;
  // Extract body content only; bootstrap page already provides the document chrome.
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  root.innerHTML = match ? match[1] : html;
}

function onClick(e: MouseEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  const backBtn = target.closest('[data-action="exitDetail"]') as HTMLElement | null;
  if (backBtn) {
    send({ type: 'exitDetail' });
    return;
  }

  const li = target.closest('[data-task-id]') as HTMLElement | null;
  if (li) {
    const id = Number(li.getAttribute('data-task-id'));
    if (!Number.isNaN(id)) {
      send({ type: 'activateTask', id });
      send({ type: 'enterDetail', id });
    }
  }
}

window.addEventListener('message', (event) => {
  const msg = event.data as OutboundMessage;
  if (msg && msg.type === 'render') mount(msg.html);
});

document.addEventListener('click', onClick);
