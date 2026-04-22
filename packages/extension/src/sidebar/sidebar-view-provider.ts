import * as vscode from 'vscode';
import type { SidebarController } from './sidebar-controller';
import type { InboundMessage, OutboundMessage } from './messages';

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'tackleSidebar';

  private controller: SidebarController;
  private currentPoster: { postMessage: (msg: unknown) => void } | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    controller: SidebarController,
  ) {
    this.controller = controller;
  }

  setController(controller: SidebarController): void {
    this.controller = controller;
    if (this.currentPoster) {
      this.controller.setWebview(this.currentPoster);
    }
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    const poster = {
      postMessage: (msg: unknown) => {
        webviewView.webview.postMessage(msg as OutboundMessage);
      },
    };
    this.currentPoster = poster;

    webviewView.webview.html = this.getBootstrapHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: InboundMessage) => {
      void this.controller.handleMessage(msg);
    });

    this.controller.setWebview(poster);

    webviewView.onDidDispose(() => {
      this.controller.setWebview(undefined);
      if (this.currentPoster === poster) this.currentPoster = undefined;
    });
  }

  private getBootstrapHtml(webview: vscode.Webview): string {
    const mainUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'sidebar-webview.js'),
    );
    const nonce = getNonce();
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Tackle Sidebar</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${mainUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
  return text;
}
