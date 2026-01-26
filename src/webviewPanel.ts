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

  public async refresh() {
    await this._update();
  }

  private async _update() {
    const submodules = await this._gitOps.getSubmodules();
    this._panel.webview.html = this._getHtmlForWebview(submodules);
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
    const results = await this._gitOps.syncAllSubmodules();
    let successCount = 0;

    results.forEach((result) => {
      if (result.success) {
        successCount++;
      }
    });

    vscode.window.showInformationMessage(
      `Synced ${successCount}/${results.size} submodule(s)`
    );
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
      max-width: 1200px;
      margin: 0 auto;
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
    .stat-value.warning { color: var(--warning); }
    .stat-value.error { color: var(--error); }

    .submodule-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 16px;
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
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Submodule Manager</h1>
      <div class="header-actions">
        <button class="btn" onclick="refresh()">↻ Refresh</button>
        <button class="btn btn-primary" onclick="openCreateBranchModal()">+ Create Branch</button>
      </div>
    </header>

    <div class="stats">
      <div class="stat-card">
        <div class="stat-label">Total Submodules</div>
        <div class="stat-value">${submodules.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Clean</div>
        <div class="stat-value success">${submodules.filter(s => s.status === 'clean').length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Modified</div>
        <div class="stat-value warning">${submodules.filter(s => s.status === 'modified').length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Needs Attention</div>
        <div class="stat-value error">${submodules.filter(s => ['uninitialized', 'conflict', 'detached'].includes(s.status)).length}</div>
      </div>
    </div>

    <div class="toolbar">
      <div class="search-box">
        <input type="text" id="searchInput" placeholder="Search submodules..." oninput="filterSubmodules()">
      </div>
      <button class="btn" onclick="selectAll()">☑ Select All</button>
      <button class="btn" onclick="deselectAll()">☐ Deselect All</button>
      <button class="btn" onclick="initAll()">↓ Init All</button>
      <button class="btn" onclick="updateAll()">⟳ Update All</button>
    </div>

    ${submodules.length > 0 ? `
    <div class="submodule-grid" id="submoduleGrid">
      ${submodules.map((s, i) => this._renderSubmoduleCard(s, i)).join('')}
    </div>
    ` : `
    <div class="empty-state">
      <h2>No Submodules Found</h2>
      <p>This workspace doesn't have any Git submodules yet.</p>
      <button class="btn btn-primary" onclick="initAll()">Initialize Submodules</button>
    </div>
    `}
  </div>

  <div class="selection-bar" id="selectionBar">
    <span class="selection-count"><span id="selectedCount">0</span> selected</span>
    <button class="btn btn-primary btn-sm" onclick="createBranchForSelected()">Create Branch</button>
    <button class="btn btn-sm" onclick="syncSelected()">Sync</button>
    <button class="btn btn-sm" onclick="deselectAll()">Cancel</button>
  </div>

  <!-- Create Branch Modal -->
  <div class="modal-overlay" id="createBranchModal">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Create Branch</span>
        <button class="modal-close" onclick="closeModal('createBranchModal')">&times;</button>
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
        <button class="btn" onclick="closeModal('createBranchModal')">Cancel</button>
        <button class="btn btn-primary" onclick="createBranch()">Create Branch</button>
      </div>
    </div>
  </div>

  <!-- Checkout Branch Modal -->
  <div class="modal-overlay" id="checkoutModal">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Checkout Branch</span>
        <button class="modal-close" onclick="closeModal('checkoutModal')">&times;</button>
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
        <button class="btn" onclick="closeModal('checkoutModal')">Cancel</button>
        <button class="btn btn-primary" onclick="checkoutBranch()">Checkout</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let selectedSubmodules = new Set();

    function postMessage(type, payload) {
      vscode.postMessage({ type, payload });
    }

    function refresh() {
      postMessage('refresh');
    }

    function initAll() {
      postMessage('initSubmodules');
    }

    function updateAll() {
      postMessage('updateSubmodules');
    }

    function filterSubmodules() {
      const query = document.getElementById('searchInput').value.toLowerCase();
      const cards = document.querySelectorAll('.submodule-card');

      cards.forEach(card => {
        const name = card.dataset.name.toLowerCase();
        const path = card.dataset.path.toLowerCase();
        const visible = name.includes(query) || path.includes(query);
        card.style.display = visible ? 'block' : 'none';
      });
    }

    function toggleSelection(path) {
      if (selectedSubmodules.has(path)) {
        selectedSubmodules.delete(path);
      } else {
        selectedSubmodules.add(path);
      }
      updateSelectionUI();
    }

    function selectAll() {
      document.querySelectorAll('.submodule-card').forEach(card => {
        selectedSubmodules.add(card.dataset.path);
        card.querySelector('.card-checkbox').checked = true;
        card.classList.add('selected');
      });
      updateSelectionUI();
    }

    function deselectAll() {
      selectedSubmodules.clear();
      document.querySelectorAll('.submodule-card').forEach(card => {
        card.querySelector('.card-checkbox').checked = false;
        card.classList.remove('selected');
      });
      updateSelectionUI();
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
        checkbox.checked = selectedSubmodules.has(card.dataset.path);
        card.classList.toggle('selected', selectedSubmodules.has(card.dataset.path));
      });
    }

    function openCreateBranchModal() {
      document.getElementById('createBranchModal').classList.add('active');
    }

    function closeModal(modalId) {
      document.getElementById(modalId).classList.remove('active');
    }

    function createBranch() {
      const branchName = document.getElementById('branchName').value.trim();
      const baseBranch = document.getElementById('baseBranch').value.trim() || 'main';

      if (!branchName) {
        return;
      }

      const checkboxes = document.querySelectorAll('.branch-submodule:checked');
      const submodules = Array.from(checkboxes).map(cb => cb.value);

      if (submodules.length === 0) {
        return;
      }

      postMessage('createBranch', { submodules, branchName, baseBranch });
      closeModal('createBranchModal');
    }

    function createBranchForSelected() {
      if (selectedSubmodules.size === 0) return;

      // Pre-select the selected submodules in the modal
      document.querySelectorAll('.branch-submodule').forEach(cb => {
        cb.checked = selectedSubmodules.has(cb.value);
      });

      openCreateBranchModal();
    }

    function openCheckoutModal(submodule) {
      document.getElementById('checkoutSubmodule').value = submodule;
      document.getElementById('branchSelect').innerHTML = '<option value="">Loading branches...</option>';
      document.getElementById('checkoutModal').classList.add('active');
      postMessage('getBranches', { submodule });
    }

    function checkoutBranch() {
      const submodule = document.getElementById('checkoutSubmodule').value;
      const branch = document.getElementById('branchSelect').value;

      if (!branch) return;

      postMessage('checkoutBranch', { submodule, branch });
      closeModal('checkoutModal');
    }

    function pullChanges(submodule) {
      postMessage('pullChanges', { submodule });
    }

    function pushChanges(submodule) {
      postMessage('pushChanges', { submodule });
    }

    function createPR(submodule) {
      postMessage('createPR', { submodule });
    }

    function openSubmodule(submodule) {
      postMessage('openSubmodule', { submodule });
    }

    function stageSubmodule(submodule) {
      postMessage('stageSubmodule', { submodule });
    }

    function syncSelected() {
      postMessage('syncVersions', { submodules: Array.from(selectedSubmodules) });
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;

      switch (message.type) {
        case 'branches':
          const select = document.getElementById('branchSelect');
          const branches = message.payload.branches;
          select.innerHTML = branches.map(b =>
            \`<option value="\${b.name}" \${b.isCurrent ? 'selected' : ''}>\${b.name}\${b.isCurrent ? ' (current)' : ''}</option>\`
          ).join('');
          break;
      }
    });
  </script>
</body>
</html>`;
  }

  private _renderSubmoduleCard(submodule: SubmoduleInfo, index: number): string {
    const statusClass = `status-${submodule.status}`;
    const statusIcon = this._getStatusIcon(submodule.status);

    return `
      <div class="submodule-card" data-name="${submodule.name}" data-path="${submodule.path}" style="animation-delay: ${index * 0.05}s">
        <div class="card-header">
          <div class="card-title">
            <input type="checkbox" class="card-checkbox" onclick="toggleSelection('${submodule.path}')">
            <span class="card-name">${submodule.name}</span>
          </div>
          <span class="card-status ${statusClass}">${statusIcon} ${submodule.status}</span>
        </div>
        <div class="card-body">
          <div class="card-info">
            <div class="info-item">
              <span class="info-label">Branch</span>
              <span class="info-value">${submodule.currentBranch || 'detached'}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Commit</span>
              <span class="info-value">${submodule.currentCommit || 'N/A'}</span>
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
          ${(submodule.ahead > 0 || submodule.behind > 0) ? `
          <div class="sync-status">
            <span class="sync-item ahead">↑ ${submodule.ahead} ahead</span>
            <span class="sync-item behind">↓ ${submodule.behind} behind</span>
          </div>
          ` : ''}
          <div class="card-actions">
            <button class="btn btn-sm" onclick="openCheckoutModal('${submodule.path}')">⎇ Checkout</button>
            <button class="btn btn-sm" onclick="pullChanges('${submodule.path}')">↓ Pull</button>
            <button class="btn btn-sm" onclick="pushChanges('${submodule.path}')">↑ Push</button>
            <button class="btn btn-sm" onclick="createPR('${submodule.path}')">⇅ PR</button>
            <button class="btn btn-sm" onclick="openSubmodule('${submodule.path}')">📂 Open</button>
            ${submodule.hasChanges ? `<button class="btn btn-sm" onclick="stageSubmodule('${submodule.path}')">+ Stage</button>` : ''}
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
