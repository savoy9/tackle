// Webview-side entry point. Receives rendered HTML from the host, delegates
// clicks to typed inbound messages using data-action attributes.
import { post, type InboundMessage, type OutboundMessage } from '../messages';
import { handleOutbound } from './handle-outbound';

declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };

const vscode = acquireVsCodeApi();

function send(msg: InboundMessage): void {
  post(vscode, msg);
}

function dispatch(action: string, el: HTMLElement): boolean {
  const taskIdStr = el.getAttribute('data-task-id');
  const sessionIdStr = el.getAttribute('data-session-id');
  const taskId = taskIdStr != null ? Number(taskIdStr) : undefined;
  const sessionId = sessionIdStr != null ? Number(sessionIdStr) : undefined;
  switch (action) {
    case 'activateExtension':
      send({ type: 'activateExtension' });
      return true;
    case 'exitDetail':
      send({ type: 'exitDetail' });
      return true;
    case 'toggleClosedFolder':
      send({ type: 'toggleClosedFolder' });
      return true;
    case 'toggleExpanded':
      if (taskId !== undefined) send({ type: 'toggleExpanded', id: taskId });
      return true;
    case 'enterDetail':
      if (taskId !== undefined) send({ type: 'enterDetail', id: taskId });
      return true;
    case 'activateTask':
      if (taskId !== undefined) send({ type: 'activateTask', id: taskId });
      return true;
    case 'newSession':
      send({ type: 'newSession', taskId });
      return true;
    case 'openTaskExternal':
      if (taskId !== undefined) send({ type: 'openTaskExternal', taskId });
      return true;
    case 'copyTaskId':
      if (taskId !== undefined) send({ type: 'copyTaskId', taskId });
      return true;
    case 'taskOverflow':
      if (taskId !== undefined) send({ type: 'taskOverflow', taskId });
      return true;
    case 'switchDetailTo':
      if (taskId !== undefined) send({ type: 'switchDetailTo', taskId });
      return true;
    case 'deactivateTask':
      if (taskId !== undefined) send({ type: 'deactivateTask', taskId });
      return true;
    case 'focusSession':
      if (sessionId !== undefined) send({ type: 'focusSession', sessionId });
      return true;
    case 'stopSession':
      if (sessionId !== undefined) send({ type: 'stopSession', sessionId });
      return true;
    case 'markSessionDone':
      if (sessionId !== undefined) send({ type: 'markSessionDone', sessionId });
      return true;
    case 'restartSession':
      if (sessionId !== undefined) send({ type: 'restartSession', sessionId });
      return true;
    case 'renameSession':
      if (sessionId !== undefined) send({ type: 'renameSession', sessionId });
      return true;
    case 'removeSession':
      if (sessionId !== undefined) send({ type: 'removeSession', sessionId });
      return true;
    case 'sessionOverflow':
      if (sessionId !== undefined) send({ type: 'sessionOverflow', sessionId });
      return true;
  }
  return false;
}

function onClick(e: MouseEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  // Walk up to the nearest element with a data-action.
  const actionEl = target.closest('[data-action]') as HTMLElement | null;
  if (!actionEl) return;
  const action = actionEl.getAttribute('data-action');
  if (!action) return;
  if (dispatch(action, actionEl)) {
    // Prevent parent .card toggleExpanded when a child action matched first.
    e.stopPropagation();
  }
}

function onContextMenu(e: MouseEvent): void {
  const target = e.target as HTMLElement | null;
  if (!target) return;
  const card = target.closest('.card') as HTMLElement | null;
  if (card) {
    const id = Number(card.getAttribute('data-task-id'));
    if (!Number.isNaN(id)) {
      e.preventDefault();
      send({ type: 'taskOverflow', taskId: id });
      return;
    }
  }
  const row = target.closest('.session-row') as HTMLElement | null;
  if (row) {
    const id = Number(row.getAttribute('data-session-id'));
    if (!Number.isNaN(id)) {
      e.preventDefault();
      send({ type: 'sessionOverflow', sessionId: id });
    }
  }
}

window.addEventListener('message', (event) => {
  const msg = event.data as OutboundMessage;
  handleOutbound(msg, document);
});

document.addEventListener('click', onClick);
document.addEventListener('contextmenu', onContextMenu);
