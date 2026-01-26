/**
 * Webview Panel for the Submodule Manager with modern UI
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { GitOperations } from './gitOperations';
import { PRManager } from './prManager';
import { SubmoduleInfo } from './types';

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
      this._panel.webview.html = this._getHtmlForWebview(submodules);
    } else {
      // Send data update instead of regenerating HTML
      this._panel.webview.postMessage({
        type: 'updateSubmodules',
        payload: { submodules }
      });
    }
  }

  private async _handleMessage(message: { type: string; payload?: unknown }) {
    switch (message.type) {
      case 'refresh':
        await this.refresh();
        break;

      case 'initSubmodules':
        await this._initSubmodules();
        break;

      case 'updateSubmodules':
        await this._updateSubmodules();
        break;

      case 'createBranch':
        await this._createBranch(message.payload as {
          submodules: string[];
          branchName: string;
          baseBranch: string;
        });
        break;

      case 'checkoutBranch':
        await this._checkoutBranch(message.payload as {
          submodule: string;
          branch: string;
        });
        break;

      case 'pullChanges':
        await this._pullChanges(message.payload as { submodule: string });
        break;

      case 'pushChanges':
        await this._pushChanges(message.payload as { submodule: string });
        break;

      case 'syncVersions':
        await this._syncVersions(message.payload as { submodules: string[] });
        break;

      case 'createPR':
        await this._createPR(message.payload as { submodule: string });
        break;

      case 'openSubmodule':
        await this._openSubmodule(message.payload as { submodule: string });
        break;

      case 'stageSubmodule':
        await this._stageSubmodule(message.payload as { submodule: string });
        break;

      case 'getBranches':
        await this._sendBranches(message.payload as { submodule: string });
        break;

      case 'checkoutCommit':
        await this._checkoutCommit(message.payload as {
          submodule: string;
          commit: string;
        });
        break;

      case 'getCommits':
        await this._sendCommits(message.payload as { submodule: string });
        break;

      case 'getRecordedCommit':
        await this._sendRecordedCommit(message.payload as { submodule: string });
        break;

      case 'updateToRecorded':
        await this._updateToRecorded(message.payload as { submodule: string });
        break;

      case 'setRebaseStatus':
        await this._setRebaseStatus(message.payload as {
          submodule: string;
          isRebasing: boolean;
        });
        break;
    }
  }

  private async _initSubmodules() {
    const result = await this._gitOps.initSubmodules();
    this._showResult(result.success, result.message);
    await this.refresh();
  }

  private async _updateSubmodules() {
    const result = await this._gitOps.updateSubmodules();
    this._showResult(result.success, result.message);
    await this.refresh();
  }

  private async _createBranch(payload: {
    submodules: string[];
    branchName: string;
    baseBranch: string;
  }) {
    const results = await this._gitOps.createBranchAcrossSubmodules(
      payload.submodules,
      payload.branchName,
      payload.baseBranch,
      true
    );

    let successCount = 0;
    let failCount = 0;

    results.forEach((result) => {
      if (result.success) {
        successCount++;
      } else {
        failCount++;
      }
    });

    if (failCount === 0) {
      vscode.window.showInformationMessage(
        `Branch '${payload.branchName}' created in ${successCount} submodule(s)`
      );
    } else {
      vscode.window.showWarningMessage(
        `Branch created in ${successCount} submodule(s), failed in ${failCount}`
      );
    }

    await this.refresh();
  }

  private async _checkoutBranch(payload: { submodule: string; branch: string }) {
    const result = await this._gitOps.checkoutBranch(
      payload.submodule,
      payload.branch
    );
    this._showResult(result.success, result.message);
    await this.refresh();
  }

  private async _pullChanges(payload: { submodule: string }) {
    const result = await this._gitOps.pullChanges(payload.submodule);
    this._showResult(result.success, result.message);
    await this.refresh();
  }

  private async _pushChanges(payload: { submodule: string }) {
    const result = await this._gitOps.pushChanges(payload.submodule);
    this._showResult(result.success, result.message);
    await this.refresh();
  }

  private async _syncVersions(payload: { submodules: string[] }) {
    // Sync only the selected submodules, or all if none selected
    const submodulesToSync = payload.submodules.length > 0 ? payload.submodules : undefined;
    const results = await this._gitOps.syncAllSubmodules(submodulesToSync);
    let successCount = 0;
    const errors: string[] = [];

    results.forEach((result, submodulePath) => {
      if (result.success) {
        successCount++;
      } else {
        errors.push(`${submodulePath}: ${result.message}`);
      }
    });

    if (errors.length === 0) {
      vscode.window.showInformationMessage(
        `Successfully synced ${successCount} submodule(s) to recorded commits`
      );
    } else {
      // Show detailed error message
      const errorSummary = errors.length <= 3
        ? errors.join(' | ')
        : `${errors.slice(0, 2).join(' | ')} and ${errors.length - 2} more`;
      vscode.window.showWarningMessage(
        `Synced ${successCount}/${results.size}. Failed: ${errorSummary}`
      );
    }
    await this.refresh();
  }

  private async _createPR(payload: { submodule: string }) {
    await this._prManager.createPRWithGitHub(payload.submodule);
  }

  private async _openSubmodule(payload: { submodule: string }) {
    const fullPath = path.join(this._workspaceRoot, payload.submodule);
    const uri = vscode.Uri.file(fullPath);
    await vscode.commands.executeCommand('revealInExplorer', uri);
  }

  private async _stageSubmodule(payload: { submodule: string }) {
    const result = await this._gitOps.stageSubmodule(payload.submodule);
    this._showResult(result.success, result.message);
  }

  private async _sendBranches(payload: { submodule: string }) {
    const branches = await this._gitOps.getBranches(payload.submodule);
    this._panel.webview.postMessage({
      type: 'branches',
      payload: { submodule: payload.submodule, branches }
    });
  }

  private async _checkoutCommit(payload: { submodule: string; commit: string }) {
    const result = await this._gitOps.checkoutCommit(payload.submodule, payload.commit);
    this._showResult(result.success, result.message);
    await this.refresh();
  }

  private async _sendCommits(payload: { submodule: string }) {
    const commits = await this._gitOps.getRecentCommits(payload.submodule, 20);
    this._panel.webview.postMessage({
      type: 'commits',
      payload: { submodule: payload.submodule, commits }
    });
  }

  private async _sendRecordedCommit(payload: { submodule: string }) {
    const recordedCommit = await this._gitOps.getRecordedCommit(payload.submodule);
    const currentCommit = await this._gitOps.getCurrentCommit(payload.submodule);
    this._panel.webview.postMessage({
      type: 'recordedCommit',
      payload: {
        submodule: payload.submodule,
        recordedCommit,
        currentCommit,
        isMatching: recordedCommit === currentCommit
      }
    });
  }

  private async _updateToRecorded(payload: { submodule: string }) {
    const result = await this._gitOps.updateToRecordedCommit(payload.submodule);
    this._showResult(result.success, result.message);
    await this.refresh();
  }

  private async _setRebaseStatus(data: { submodule: string; isRebasing: boolean }) {
    // Store rebase status in extension context
    this._panel.webview.postMessage({
      type: 'rebaseStatusUpdated',
      payload: { submodule: data.submodule, isRebasing: data.isRebasing }
    });
  }

  private _showResult(success: boolean, message: string) {
    if (success) {
      vscode.window.showInformationMessage(message);
    } else {
      vscode.window.showErrorMessage(message);
    }
  }

  private _getHtmlForWebview(submodules: SubmoduleInfo[]): string {
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Submodule Manager</title>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --bg-tertiary: var(--vscode-input-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --text-muted: var(--vscode-disabledForeground);
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --border: var(--vscode-panel-border);
      --success: var(--vscode-testing-iconPassed);
      --warning: var(--vscode-editorWarning-foreground);
      --error: var(--vscode-errorForeground);
      --info: var(--vscode-editorInfo-foreground);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--text-primary);
      background: var(--bg-primary);
      padding: 20px;
      line-height: 1.5;
    }

    .container {
      width: 100%;
      max-width: 100%;
      margin: 0;
      box-sizing: border-box;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    h1::before {
      content: '';
      width: 8px;
      height: 24px;
      background: var(--accent);
      border-radius: 4px;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }

    .btn:hover {
      background: var(--border);
    }

    .btn-primary {
      background: var(--accent);
      color: var(--vscode-button-foreground);
    }

    .btn-primary:hover {
      background: var(--accent-hover);
    }

    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
    }

    .btn-icon {
      padding: 6px;
      min-width: 32px;
      justify-content: center;
    }

    .toolbar {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }

    .search-box {
      flex: 1;
      min-width: 200px;
      max-width: 400px;
      position: relative;
    }

    .search-box input {
      width: 100%;
      padding: 10px 12px 10px 36px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-size: 13px;
    }

    .search-box input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .search-box::before {
      content: '🔍';
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 14px;
      opacity: 0.6;
    }

    .stats {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
    }

    .stat-card {
      flex: 1;
      padding: 16px;
      background: var(--bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--border);
    }

    .stat-label {
      font-size: 12px;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }

    .stat-value {
      font-size: 24px;
      font-weight: 600;
    }

    .stat-value.success { color: var(--success); }

    .stat-desc {
      font-size: 10px;
      color: var(--text-secondary);
      margin-top: 4px;
      opacity: 0.8;
    }
    .stat-value.warning { color: var(--warning); }
    .stat-value.error { color: var(--error); }

    .submodule-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
      width: 100%;
    }

    @media (min-width: 1400px) {
      .submodule-grid {
        grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      }
    }

    @media (max-width: 700px) {
      .submodule-grid {
        grid-template-columns: 1fr;
      }
    }

    .submodule-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      transition: all 0.2s ease;
    }

    .submodule-card:hover {
      border-color: var(--accent);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .submodule-card.selected {
      border-color: var(--accent);
      border-width: 2px;
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border);
    }

    .card-title {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .card-checkbox {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: var(--accent);
    }

    .card-name {
      font-weight: 600;
      font-size: 14px;
    }

    .card-status {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .status-clean {
      background: rgba(40, 167, 69, 0.15);
      color: var(--success);
    }

    .status-modified {
      background: rgba(255, 193, 7, 0.15);
      color: var(--warning);
    }

    .status-uninitialized {
      background: rgba(108, 117, 125, 0.15);
      color: var(--text-muted);
    }

    .status-detached {
      background: rgba(0, 123, 255, 0.15);
      color: var(--info);
    }

    .status-conflict {
      background: rgba(220, 53, 69, 0.15);
      color: var(--error);
    }

    .card-body {
      padding: 16px;
    }

    .card-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 14px;
    }

    .info-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .info-label {
      font-size: 11px;
      color: var(--text-secondary);
      text-transform: uppercase;
    }

    .info-value {
      font-size: 13px;
      font-weight: 500;
      font-family: var(--vscode-editor-font-family);
    }

    .sync-status {
      display: flex;
      gap: 12px;
      padding: 10px;
      background: var(--bg-tertiary);
      border-radius: 6px;
      margin-bottom: 14px;
    }

    .sync-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
    }

    .sync-item.ahead { color: var(--success); }
    .sync-item.behind { color: var(--warning); }

    .card-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-secondary);
    }

    .empty-state h2 {
      font-size: 20px;
      margin-bottom: 12px;
      color: var(--text-primary);
    }

    .empty-state p {
      margin-bottom: 20px;
    }

    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }

    .modal-overlay.active {
      display: flex;
    }

    .modal {
      background: var(--bg-primary);
      border: 1px solid var(--border);
      border-radius: 12px;
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      overflow: auto;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }

    .modal-title {
      font-size: 16px;
      font-weight: 600;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 20px;
      color: var(--text-secondary);
      cursor: pointer;
      padding: 4px;
    }

    .modal-body {
      padding: 20px;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 6px;
    }

    .form-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-size: 13px;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--accent);
    }

    .form-select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-size: 13px;
      cursor: pointer;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px 20px;
      border-top: 1px solid var(--border);
    }

    .selection-bar {
      display: none;
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 20px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
      z-index: 100;
    }

    .selection-bar.active {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .selection-count {
      font-weight: 500;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .submodule-card {
      animation: fadeIn 0.3s ease forwards;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .recorded-commit-status {
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .recorded-commit-status.success {
      background: rgba(40, 167, 69, 0.1);
      border: 1px solid var(--success);
    }

    .recorded-commit-status.warning {
      background: rgba(255, 193, 7, 0.1);
      border: 1px solid var(--warning);
    }

    .recorded-commit-status code {
      background: var(--bg-tertiary);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
    }

    .mismatch-warning {
      color: var(--warning);
      font-weight: 600;
      margin-top: 4px;
    }

    .rebase-indicator {
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .card-actions .rebase-btn {
      background: rgba(255, 165, 0, 0.1);
      border: 1px solid var(--warning);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Submodule Manager</h1>
      <div class="header-actions">
        <button class="btn" data-action="refresh">↻ Refresh</button>
        <button class="btn btn-primary" data-action="openCreateBranchModal">+ Create Branch</button>
      </div>
    </header>

    <div class="stats">
      <div class="stat-card" title="Total number of submodules configured in this repository">
        <div class="stat-label">Total Submodules</div>
        <div class="stat-value">${submodules.length}</div>
        <div class="stat-desc">All configured submodules</div>
      </div>
      <div class="stat-card" title="Submodules on a branch with no uncommitted changes">
        <div class="stat-label">Clean</div>
        <div class="stat-value success">${submodules.filter(s => s.status === 'clean').length}</div>
        <div class="stat-desc">On branch, no changes</div>
      </div>
      <div class="stat-card" title="Submodules with uncommitted changes (staged or unstaged files)">
        <div class="stat-label">Modified</div>
        <div class="stat-value warning">${submodules.filter(s => s.status === 'modified').length}</div>
        <div class="stat-desc">Has uncommitted changes</div>
      </div>
      <div class="stat-card" title="Submodules that are detached (not on a branch), uninitialized, or have conflicts">
        <div class="stat-label">Needs Attention</div>
        <div class="stat-value error">${submodules.filter(s => ['uninitialized', 'conflict', 'detached'].includes(s.status)).length}</div>
        <div class="stat-desc">Detached, uninitialized, or conflict</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-box">
        <input type="text" id="searchInput" placeholder="Search submodules...">
      </div>
      <button class="btn" data-action="selectAll">☑ Select All</button>
      <button class="btn" data-action="deselectAll">☐ Deselect All</button>
      <button class="btn" data-action="initAll">↓ Init All</button>
      <button class="btn" data-action="updateAll">⟳ Update All</button>
    </div>

    ${submodules.length > 0 ? `
    <div class="submodule-grid" id="submoduleGrid">
      ${submodules.map((s, i) => this._renderSubmoduleCard(s, i)).join('')}
    </div>
    ` : `
    <div class="empty-state">
      <h2>No Submodules Found</h2>
      <p>This workspace doesn't have any Git submodules yet.</p>
      <button class="btn btn-primary" data-action="initAll">Initialize Submodules</button>
    </div>
    `}
  </div>

  <div class="selection-bar" id="selectionBar">
    <span class="selection-count"><span id="selectedCount">0</span> selected</span>
    <button class="btn btn-primary btn-sm" data-action="createBranchForSelected">Create Branch</button>
    <button class="btn btn-sm" data-action="syncSelected">Sync</button>
    <button class="btn btn-sm" data-action="deselectAll">Cancel</button>
  </div>

  <!-- Create Branch Modal -->
  <div class="modal-overlay" id="createBranchModal">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Create Branch</span>
        <button class="modal-close" data-action="closeModal" data-modal="createBranchModal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Branch Name</label>
          <input type="text" class="form-input" id="branchName" placeholder="feature/my-new-feature">
        </div>
        <div class="form-group">
          <label class="form-label">Base Branch</label>
          <input type="text" class="form-input" id="baseBranch" placeholder="main" value="main">
        </div>
        <div class="form-group">
          <label class="form-label">Apply to Submodules</label>
          <div id="submoduleCheckboxes" style="max-height: 200px; overflow-y: auto; margin-top: 8px;">
            ${submodules.map(s => `
              <label style="display: flex; align-items: center; gap: 8px; padding: 6px 0; cursor: pointer;">
                <input type="checkbox" class="branch-submodule" value="${s.path}" checked>
                <span>${s.name}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" data-action="closeModal" data-modal="createBranchModal">Cancel</button>
        <button class="btn btn-primary" data-action="createBranch">Create Branch</button>
      </div>
    </div>
  </div>

  <!-- Checkout Branch Modal -->
  <div class="modal-overlay" id="checkoutModal">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Checkout Branch</span>
        <button class="modal-close" data-action="closeModal" data-modal="checkoutModal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Select Branch</label>
          <select class="form-select" id="branchSelect">
            <option value="">Loading branches...</option>
          </select>
        </div>
        <input type="hidden" id="checkoutSubmodule">
      </div>
      <div class="modal-footer">
        <button class="btn" data-action="closeModal" data-modal="checkoutModal">Cancel</button>
        <button class="btn btn-primary" data-action="checkoutBranch">Checkout</button>
      </div>
    </div>
  </div>

  <!-- Checkout Commit Modal -->
  <div class="modal-overlay" id="commitModal">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Checkout Specific Commit</span>
        <button class="modal-close" data-action="closeModal" data-modal="commitModal">&times;</button>
      </div>
      <div class="modal-body">
        <div id="recordedCommitInfo" class="form-group">
          <!-- Will be populated dynamically -->
        </div>
        <div class="form-group">
          <label class="form-label">Enter Commit Hash</label>
          <input type="text" class="form-input" id="commitInput" placeholder="e.g., abc123def or full hash">
        </div>
        <div class="form-group">
          <label class="form-label">Or Select Recent Commit</label>
          <select class="form-select" id="commitSelect">
            <option value="">Loading commits...</option>
          </select>
        </div>
        <input type="hidden" id="commitSubmodule">
      </div>
      <div class="modal-footer">
        <button class="btn" data-action="closeModal" data-modal="commitModal">Cancel</button>
        <button class="btn" data-action="useRecorded">Use Recorded</button>
        <button class="btn btn-primary" data-action="checkoutCommit">Checkout</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    // Restore state from previous session
    const previousState = vscode.getState() || {};
    let selectedSubmodules = new Set(previousState.selectedSubmodules || []);
    let rebasingSubmodules = new Set(previousState.rebasingSubmodules || []);
    let submoduleData = previousState.submoduleData || ${JSON.stringify(submodules)};

    // Save state helper
    function saveState() {
      vscode.setState({
        selectedSubmodules: Array.from(selectedSubmodules),
        rebasingSubmodules: Array.from(rebasingSubmodules),
        submoduleData
      });
    }

    function postMessage(type, payload) {
      vscode.postMessage({ type, payload });
    }

    // Action handlers
    const actions = {
      refresh: () => postMessage('refresh'),
      initAll: () => postMessage('initSubmodules'),
      updateAll: () => postMessage('updateSubmodules'),

      selectAll: () => {
        document.querySelectorAll('.submodule-card').forEach(card => {
          selectedSubmodules.add(card.dataset.path);
          const cb = card.querySelector('.card-checkbox');
          if (cb) cb.checked = true;
          card.classList.add('selected');
        });
        saveState();
        updateSelectionUI();
      },

      deselectAll: () => {
        selectedSubmodules.clear();
        document.querySelectorAll('.submodule-card').forEach(card => {
          const cb = card.querySelector('.card-checkbox');
          if (cb) cb.checked = false;
          card.classList.remove('selected');
        });
        saveState();
        updateSelectionUI();
      },

      toggleSelection: (el) => {
        const path = el.dataset.submodule;
        if (!path) return;

        // Toggle selection state
        if (selectedSubmodules.has(path)) {
          selectedSubmodules.delete(path);
        } else {
          selectedSubmodules.add(path);
        }

        // Update checkbox state directly
        const checkbox = el.tagName === 'INPUT' ? el : el.querySelector('.card-checkbox');
        if (checkbox) {
          checkbox.checked = selectedSubmodules.has(path);
        }

        // Update the card's selected class
        const card = el.closest('.submodule-card');
        if (card) {
          card.classList.toggle('selected', selectedSubmodules.has(path));
        }

        saveState();
        updateSelectionUI();
      },

      openCreateBranchModal: () => {
        document.getElementById('createBranchModal').classList.add('active');
      },

      closeModal: (el) => {
        const modalId = el.dataset.modal;
        document.getElementById(modalId).classList.remove('active');
      },

      createBranch: () => {
        const branchName = document.getElementById('branchName').value.trim();
        const baseBranch = document.getElementById('baseBranch').value.trim() || 'main';
        if (!branchName) return;

        const checkboxes = document.querySelectorAll('.branch-submodule:checked');
        const submodules = Array.from(checkboxes).map(cb => cb.value);
        if (submodules.length === 0) return;

        postMessage('createBranch', { submodules, branchName, baseBranch });
        document.getElementById('createBranchModal').classList.remove('active');
      },

      createBranchForSelected: () => {
        if (selectedSubmodules.size === 0) return;
        document.querySelectorAll('.branch-submodule').forEach(cb => {
          cb.checked = selectedSubmodules.has(cb.value);
        });
        document.getElementById('createBranchModal').classList.add('active');
      },

      openCheckoutModal: (el) => {
        const submodule = el.dataset.submodule;
        document.getElementById('checkoutSubmodule').value = submodule;
        document.getElementById('branchSelect').innerHTML = '<option value="">Loading branches...</option>';
        document.getElementById('checkoutModal').classList.add('active');
        postMessage('getBranches', { submodule });
      },

      checkoutBranch: () => {
        const submodule = document.getElementById('checkoutSubmodule').value;
        const branch = document.getElementById('branchSelect').value;
        if (!branch) return;
        postMessage('checkoutBranch', { submodule, branch });
        document.getElementById('checkoutModal').classList.remove('active');
      },

      openCommitModal: (el) => {
        const submodule = el.dataset.submodule;
        document.getElementById('commitSubmodule').value = submodule;
        document.getElementById('commitSelect').innerHTML = '<option value="">Loading commits...</option>';
        document.getElementById('commitInput').value = '';
        document.getElementById('commitModal').classList.add('active');
        postMessage('getCommits', { submodule });
        postMessage('getRecordedCommit', { submodule });
      },

      checkoutCommit: () => {
        const submodule = document.getElementById('commitSubmodule').value;
        const commitInput = document.getElementById('commitInput').value.trim();
        const commitSelect = document.getElementById('commitSelect').value;
        const commit = commitInput || commitSelect;
        if (!commit) return;
        postMessage('checkoutCommit', { submodule, commit });
        document.getElementById('commitModal').classList.remove('active');
      },

      useRecorded: () => {
        const submodule = document.getElementById('commitSubmodule').value;
        postMessage('updateToRecorded', { submodule });
        document.getElementById('commitModal').classList.remove('active');
      },

      toggleRebaseStatus: (el) => {
        const submodule = el.dataset.submodule;
        const isCurrentlyRebasing = rebasingSubmodules.has(submodule);
        if (isCurrentlyRebasing) {
          rebasingSubmodules.delete(submodule);
        } else {
          rebasingSubmodules.add(submodule);
        }
        saveState();
        postMessage('setRebaseStatus', { submodule, isRebasing: !isCurrentlyRebasing });
        updateRebaseUI();
      },

      pullChanges: (el) => postMessage('pullChanges', { submodule: el.dataset.submodule }),
      pushChanges: (el) => postMessage('pushChanges', { submodule: el.dataset.submodule }),
      createPR: (el) => postMessage('createPR', { submodule: el.dataset.submodule }),
      openSubmodule: (el) => postMessage('openSubmodule', { submodule: el.dataset.submodule }),
      stageSubmodule: (el) => postMessage('stageSubmodule', { submodule: el.dataset.submodule }),
      syncSelected: () => postMessage('syncVersions', { submodules: Array.from(selectedSubmodules) })
    };

    // Event delegation - handle all clicks
    document.body.addEventListener('click', function(e) {
      let el = e.target;

      // Special handling for checkboxes - don't prevent default, just track state
      if (el.tagName === 'INPUT' && el.type === 'checkbox' && el.dataset.action === 'toggleSelection') {
        const path = el.dataset.submodule;
        if (path) {
          // Sync our state with checkbox state (checkbox already toggled)
          if (el.checked) {
            selectedSubmodules.add(path);
          } else {
            selectedSubmodules.delete(path);
          }
          const card = el.closest('.submodule-card');
          if (card) {
            card.classList.toggle('selected', el.checked);
          }
          saveState();
          updateSelectionUI();
        }
        return;
      }

      // Walk up the DOM tree to find element with data-action
      while (el && el !== document.body) {
        if (el.dataset && el.dataset.action) {
          const action = el.dataset.action;
          if (actions[action]) {
            e.preventDefault();
            actions[action](el);
          }
          return;
        }
        el = el.parentElement;
      }
    });

    // Handle search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', function(e) {
        const query = (e.target.value || '').toLowerCase();
        document.querySelectorAll('.submodule-card').forEach(function(card) {
          const name = (card.dataset.name || '').toLowerCase();
          const path = (card.dataset.path || '').toLowerCase();
          const visible = name.includes(query) || path.includes(query);
          card.style.display = visible ? 'block' : 'none';
        });
      });
    }

    function updateSelectionUI() {
      const bar = document.getElementById('selectionBar');
      const count = document.getElementById('selectedCount');

      if (selectedSubmodules.size > 0) {
        bar.classList.add('active');
        count.textContent = selectedSubmodules.size;
      } else {
        bar.classList.remove('active');
      }

      document.querySelectorAll('.submodule-card').forEach(card => {
        const checkbox = card.querySelector('.card-checkbox');
        if (checkbox) {
          checkbox.checked = selectedSubmodules.has(card.dataset.path);
          card.classList.toggle('selected', selectedSubmodules.has(card.dataset.path));
        }
      });
    }

    function updateRebaseUI() {
      document.querySelectorAll('.submodule-card').forEach(card => {
        const path = card.dataset.path;
        const rebaseIndicator = card.querySelector('.rebase-indicator');
        const rebaseBtn = card.querySelector('.rebase-btn');

        if (rebasingSubmodules.has(path)) {
          if (rebaseIndicator) rebaseIndicator.style.display = 'inline-flex';
          if (rebaseBtn) rebaseBtn.textContent = '✓ Done Rebasing';
        } else {
          if (rebaseIndicator) rebaseIndicator.style.display = 'none';
          if (rebaseBtn) rebaseBtn.textContent = '⏳ Mark Rebasing';
        }
      });
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'branches':
          const branchSelect = document.getElementById('branchSelect');
          const branches = message.payload.branches || [];
          if (branches.length === 0) {
            branchSelect.innerHTML = '<option value="">No branches found</option>';
          } else {
            branchSelect.innerHTML = branches.map(b =>
              \`<option value="\${b.name}" \${b.isCurrent ? 'selected' : ''}>\${b.name}\${b.isCurrent ? ' (current)' : ''}\${b.isRemote ? ' (remote)' : ''}</option>\`
            ).join('');
          }
          break;

        case 'commits':
          const commitSelect = document.getElementById('commitSelect');
          const commits = message.payload.commits;
          commitSelect.innerHTML = '<option value="">Select a commit...</option>' +
            commits.map(c =>
              \`<option value="\${c.hash}">\${c.shortHash} - \${c.message.substring(0, 50)}</option>\`
            ).join('');
          break;

        case 'recordedCommit':
          const recordedInfo = document.getElementById('recordedCommitInfo');
          if (recordedInfo) {
            const { recordedCommit, currentCommit, isMatching } = message.payload;
            const statusClass = isMatching ? 'success' : 'warning';
            const statusIcon = isMatching ? '✓' : '⚠';
            recordedInfo.innerHTML = \`
              <div class="recorded-commit-status \${statusClass}">
                <span>\${statusIcon} Parent expects: <code>\${recordedCommit ? recordedCommit.substring(0, 8) : 'N/A'}</code></span>
                <span>Current: <code>\${currentCommit ? currentCommit.substring(0, 8) : 'N/A'}</code></span>
                \${!isMatching ? '<span class="mismatch-warning">Commits do not match!</span>' : ''}
              </div>
            \`;
          }
          break;

        case 'updateSubmodules':
          submoduleData = message.payload.submodules;
          saveState();
          updateSubmoduleCards(submoduleData);
          break;

        case 'rebaseStatusUpdated':
          updateRebaseUI();
          break;
      }
    });

    function updateSubmoduleCards(submodules) {
      submodules.forEach(s => {
        const card = document.querySelector(\`.submodule-card[data-path="\${s.path}"]\`);
        if (card) {
          const statusEl = card.querySelector('.card-status');
          if (statusEl) {
            statusEl.className = 'card-status status-' + s.status;
            statusEl.innerHTML = getStatusIcon(s.status) + ' ' + s.status.toUpperCase();
          }

          const branchEl = card.querySelector('.info-value.branch');
          if (branchEl) branchEl.textContent = s.currentBranch || '(detached)';

          const commitEl = card.querySelector('.info-value.commit');
          if (commitEl) commitEl.textContent = s.currentCommit || 'N/A';

          const syncEl = card.querySelector('.sync-status');
          if (syncEl) {
            if (s.ahead > 0 || s.behind > 0) {
              syncEl.style.display = 'flex';
              syncEl.innerHTML = \`
                <span class="sync-item ahead">↑ \${s.ahead} ahead</span>
                <span class="sync-item behind">↓ \${s.behind} behind</span>
              \`;
            } else {
              syncEl.style.display = 'none';
            }
          }
        }
      });
    }

    function getStatusIcon(status) {
      const icons = {
        'clean': '✓',
        'modified': '●',
        'uninitialized': '○',
        'detached': '◎',
        'conflict': '⚠',
        'unknown': '?'
      };
      return icons[status] || '?';
    }

    // Initialize UI on load
    updateSelectionUI();
    updateRebaseUI();
  </script>
</body>
</html>`;
  }

  private _renderSubmoduleCard(submodule: SubmoduleInfo, index: number): string {
    const statusClass = `status-${submodule.status}`;
    const statusIcon = this._getStatusIcon(submodule.status);
    const statusTooltip = this._getStatusTooltip(submodule.status);
    const branchDisplay = submodule.currentBranch || '(detached)';
    const branchTooltip = submodule.currentBranch
      ? `Currently on branch: ${submodule.currentBranch}`
      : `Detached HEAD: Not on any branch, checked out to commit ${submodule.currentCommit}. This is normal for submodules synced to a specific commit.`;

    return `
      <div class="submodule-card" data-name="${submodule.name}" data-path="${submodule.path}" style="animation-delay: ${index * 0.05}s">
        <div class="card-header">
          <div class="card-title" data-action="toggleSelection" data-submodule="${submodule.path}" style="cursor: pointer;">
            <input type="checkbox" class="card-checkbox" data-action="toggleSelection" data-submodule="${submodule.path}">
            <span class="card-name">${submodule.name}</span>
            <span class="rebase-indicator" style="display: none; background: rgba(255, 165, 0, 0.2); color: var(--warning); padding: 2px 8px; border-radius: 4px; font-size: 10px; margin-left: 8px;">⏳ REBASING</span>
          </div>
          <span class="card-status ${statusClass}" title="${statusTooltip}">${statusIcon} ${submodule.status.toUpperCase()}</span>
        </div>
        <div class="card-body">
          <div class="card-info">
            <div class="info-item">
              <span class="info-label">Branch</span>
              <span class="info-value branch" title="${branchTooltip}">${branchDisplay}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Commit</span>
              <span class="info-value commit">${submodule.currentCommit || 'N/A'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Path</span>
              <span class="info-value">${submodule.path}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Config Branch</span>
              <span class="info-value">${submodule.branch || 'main'}</span>
            </div>
          </div>
          <div class="sync-status" style="${(submodule.ahead > 0 || submodule.behind > 0) ? '' : 'display: none'}">
            <span class="sync-item ahead">↑ ${submodule.ahead} ahead</span>
            <span class="sync-item behind">↓ ${submodule.behind} behind</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-sm" data-action="openCheckoutModal" data-submodule="${submodule.path}" title="Checkout branch">⎇ Branch</button>
            <button class="btn btn-sm" data-action="openCommitModal" data-submodule="${submodule.path}" title="Checkout specific commit">⎔ Commit</button>
            <button class="btn btn-sm" data-action="pullChanges" data-submodule="${submodule.path}" title="Pull changes">↓ Pull</button>
            <button class="btn btn-sm" data-action="pushChanges" data-submodule="${submodule.path}" title="Push changes">↑ Push</button>
            <button class="btn btn-sm" data-action="createPR" data-submodule="${submodule.path}" title="Create PR">⇅ PR</button>
            <button class="btn btn-sm" data-action="openSubmodule" data-submodule="${submodule.path}" title="Open in explorer">📂</button>
            ${submodule.hasChanges ? `<button class="btn btn-sm" data-action="stageSubmodule" data-submodule="${submodule.path}" title="Stage submodule pointer">+ Stage</button>` : ''}
            <button class="btn btn-sm rebase-btn" data-action="toggleRebaseStatus" data-submodule="${submodule.path}" title="Mark as rebasing to prevent accidental updates">⏳ Mark Rebasing</button>
          </div>
        </div>
      </div>
    `;
  }

  private _getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      'clean': '✓',
      'modified': '●',
      'uninitialized': '○',
      'detached': '◎',
      'conflict': '⚠',
      'unknown': '?'
    };
    return icons[status] || '?';
  }

  private _getStatusTooltip(status: string): string {
    const tooltips: Record<string, string> = {
      'clean': 'Clean: On a branch with no uncommitted changes',
      'modified': 'Modified: Has uncommitted changes inside the submodule',
      'uninitialized': 'Uninitialized: Submodule has not been cloned yet. Run Init All to initialize.',
      'detached': 'Detached HEAD: Checked out to a specific commit, not on any branch. This is normal when synced to the parent repo\'s recorded commit.',
      'conflict': 'Conflict: Merge conflict detected',
      'unknown': 'Unknown: Could not determine status'
    };
    return tooltips[status] || 'Unknown status';
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

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
