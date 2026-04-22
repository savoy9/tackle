// Typed message protocol between sidebar webview and host controller.
// Inbound: webview → host. Outbound: host → webview.

export type InboundMessage =
  | { type: 'activateTask'; id: number }
  | { type: 'enterDetail'; id: number }
  | { type: 'exitDetail' }
  | { type: 'switchDetailTo'; taskId: number }
  | { type: 'deactivateTask'; taskId: number }
  | { type: 'toggleExpanded'; id: number }
  | { type: 'toggleClosedFolder' }
  | { type: 'newSession'; taskId?: number }
  | { type: 'openTaskExternal'; taskId: number }
  | { type: 'copyTaskId'; taskId: number }
  | { type: 'taskOverflow'; taskId: number }
  | { type: 'focusSession'; sessionId: number }
  | { type: 'stopSession'; sessionId: number }
  | { type: 'markSessionDone'; sessionId: number }
  | { type: 'restartSession'; sessionId: number }
  | { type: 'renameSession'; sessionId: number }
  | { type: 'removeSession'; sessionId: number }
  | { type: 'sessionOverflow'; sessionId: number };

export type OutboundMessage =
  | { type: 'render'; html: string };

// Minimal shape of the object returned by `acquireVsCodeApi()` that we care about.
export interface WebviewPoster {
  postMessage: (msg: unknown) => void;
}

/** Helper used by the webview side to post a strongly-typed inbound message. */
export function post(api: WebviewPoster, msg: InboundMessage): void {
  api.postMessage(msg);
}
