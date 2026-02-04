/**
 * Webview Panel for the Submodule Manager with modern UI
 */

import * as vscode from 'vscode';
import { GitOperations } from './gitOperations';
import { PRManager } from './prManager';
import { getHtmlForWebview } from './webview/template';
import { messageHandlers, MessageHandlerContext } from './handlers/webviewMessageHandler';

export class SubmoduleManagerPanel {
  public static currentPanel: SubmoduleManagerPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _gitOps: GitOperations;
  private readonly _prManager: PRManager;
  private _disposables: vscode.Disposable[] = [];
  private _workspaceRoot: string;

  public static createOrShow(extensionUri: vscode.Uri, workspaceRoot: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SubmoduleManagerPanel.currentPanel) {
      SubmoduleManagerPanel.currentPanel._panel.reveal(column);
      SubmoduleManagerPanel.currentPanel.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'submoduleManager',
      'Submodule Manager',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'resources')]
      }
    );

    SubmoduleManagerPanel.currentPanel = new SubmoduleManagerPanel(
      panel,
      extensionUri,
      workspaceRoot
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    workspaceRoot: string
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._workspaceRoot = workspaceRoot;
    this._gitOps = new GitOperations(workspaceRoot);
    this._prManager = new PRManager(workspaceRoot);

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        await this._handleMessage(message);
      },
      null,
      this._disposables
    );
  }

  public async refresh(fullRefresh: boolean = false) {
    await this._update(fullRefresh);
  }

  private async _update(fullRefresh: boolean = true) {
    const submodules = await this._gitOps.getSubmodules();

    if (fullRefresh) {
      this._panel.webview.html = getHtmlForWebview(submodules);
    } else {
      // Send data update instead of regenerating HTML
      this._panel.webview.postMessage({
        type: 'updateSubmodules',
        payload: { submodules }
      });
    }
  }

  /**
   * Create message handler context
   */
  private _createHandlerContext(): MessageHandlerContext {
    return {
      panel: this._panel,
      gitOps: this._gitOps,
      prManager: this._prManager,
      workspaceRoot: this._workspaceRoot,
      refresh: () => this.refresh()
    };
  }

  private async _handleMessage(message: { type: string; payload?: unknown }) {
    try {
      // Handle refresh separately as it's not in the handler map
      if (message.type === 'refresh') {
        await this.refresh();
        return;
      }

      // Look up the handler in the message handlers map
      const handler = messageHandlers[message.type];
      if (handler) {
        const ctx = this._createHandlerContext();
        await handler(ctx, message.payload);
      } else {
        console.warn(`Unhandled webview message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`Error handling webview message '${message.type}':`, error);
      // Try to notify the user about the error
      try {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        vscode.window.showErrorMessage(`Submodule Manager: ${errorMsg}`);
      } catch {
        // Last resort - ignore
      }
    }
  }

  public dispose() {
    SubmoduleManagerPanel.currentPanel = undefined;
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
