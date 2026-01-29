/**
 * Submodule Manager Extension
 * Main entry point for the VS Code extension
 */

import * as vscode from 'vscode';
import { GitOperations } from './gitOperations';
import { SubmoduleTreeProvider, ActionsTreeProvider } from './submoduleTreeProvider';
import { SubmoduleManagerPanel } from './webviewPanel';
import { PRManager } from './prManager';

let submoduleTreeProvider: SubmoduleTreeProvider;
let actionsTreeProvider: ActionsTreeProvider;
let gitOps: GitOperations;
let prManager: PRManager;

export function activate(context: vscode.ExtensionContext) {
  console.log('Submodule Manager extension is now active');

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!workspaceRoot) {
    vscode.window.showWarningMessage('Submodule Manager: No workspace folder open');
    return;
  }

  // Initialize services
  gitOps = new GitOperations(workspaceRoot);
  prManager = new PRManager(workspaceRoot);

  // Initialize tree providers
  submoduleTreeProvider = new SubmoduleTreeProvider(workspaceRoot);
  actionsTreeProvider = new ActionsTreeProvider();

  // Register tree views
  const submoduleTreeView = vscode.window.createTreeView('submoduleList', {
    treeDataProvider: submoduleTreeProvider,
    showCollapseAll: true
  });

  const actionsTreeView = vscode.window.createTreeView('submoduleActions', {
    treeDataProvider: actionsTreeProvider
  });

  context.subscriptions.push(submoduleTreeView, actionsTreeView);

  // Register commands
  registerCommands(context, workspaceRoot);

  // Auto-refresh when files change
  const watcher = vscode.workspace.createFileSystemWatcher('**/.gitmodules');
  watcher.onDidChange(() => submoduleTreeProvider.refresh());
  watcher.onDidCreate(() => submoduleTreeProvider.refresh());
  watcher.onDidDelete(() => submoduleTreeProvider.refresh());
  context.subscriptions.push(watcher);

  // Show welcome message on first activation
  const hasShownWelcome = context.globalState.get('submoduleManager.welcomeShown');
  if (!hasShownWelcome) {
    vscode.window.showInformationMessage(
      'Submodule Manager is ready! Open the panel with Ctrl+Shift+G M (Cmd+Shift+G M on Mac)',
      'Open Panel'
    ).then(selection => {
      if (selection === 'Open Panel') {
        vscode.commands.executeCommand('submoduleManager.openPanel');
      }
    });
    context.globalState.update('submoduleManager.welcomeShown', true);
  }
}

function registerCommands(context: vscode.ExtensionContext, workspaceRoot: string) {
  // Open panel command
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.openPanel', () => {
      SubmoduleManagerPanel.createOrShow(context.extensionUri, workspaceRoot);
    })
  );

  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.refresh', () => {
      submoduleTreeProvider.refresh();
      if (SubmoduleManagerPanel.currentPanel) {
        SubmoduleManagerPanel.currentPanel.refresh();
      }
      vscode.window.showInformationMessage('Submodules refreshed');
    })
  );

  // Initialize submodules command
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.initSubmodules', async () => {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Initializing submodules...',
          cancellable: false
        },
        async () => {
          return await gitOps.initSubmodules();
        }
      );

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }

      submoduleTreeProvider.refresh();
    })
  );

  // Update submodules command
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.updateSubmodules', async () => {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Updating submodules...',
          cancellable: false
        },
        async () => {
          return await gitOps.updateSubmodules();
        }
      );

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }

      submoduleTreeProvider.refresh();
    })
  );

  // Create branch command
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.createBranch', async () => {
      // Fetch submodules directly to ensure we have fresh data
      let submodules = submoduleTreeProvider.getSubmodules();

      // If cached submodules are empty, fetch them directly
      if (submodules.length === 0) {
        submodules = await gitOps.getSubmodules();
      }

      if (submodules.length === 0) {
        vscode.window.showWarningMessage('No submodules found. Make sure this repository has submodules configured.');
        return;
      }

      // Branch hierarchy rules
      const branchHierarchy: Record<string, { prefixes: string[]; hint: string }> = {
        'main': { prefixes: ['bugfix', 'release', 'dev'], hint: 'From main: bugfix/, release/, dev/' },
        'dev': { prefixes: ['feature'], hint: 'From dev: feature/' },
        'feature': { prefixes: ['task'], hint: 'From feature: task/' }
      };

      // Get available branches from main repo
      const branches = await gitOps.getBranches('.');
      const currentBranch = branches.find(b => b.isCurrent);
      const currentBranchName = currentBranch?.name || 'main';

      // Select base branch
      const branchItems = branches
        .filter(b => !b.isRemote)
        .map(b => ({
          label: b.name,
          description: b.isCurrent ? '(current)' : '',
          picked: b.isCurrent
        }));

      const selectedBaseBranch = await vscode.window.showQuickPick(branchItems, {
        placeHolder: 'Select base branch',
        title: 'Base Branch'
      });

      if (!selectedBaseBranch) {
        return;
      }

      const baseBranch = selectedBaseBranch.label;

      // Determine allowed prefixes based on base branch
      const getBaseBranchType = (branch: string): string => {
        const lower = branch.toLowerCase();
        if (lower === 'main' || lower === 'master') return 'main';
        if (lower === 'dev' || lower.startsWith('dev/') || lower.startsWith('dev-')) return 'dev';
        if (lower.startsWith('feature/') || lower.startsWith('feature-')) return 'feature';
        return 'main';
      };

      const branchType = getBaseBranchType(baseBranch);
      const rules = branchHierarchy[branchType] || branchHierarchy['main'];

      // Select prefix
      const prefixItems = rules.prefixes.map(p => ({
        label: `${p}/`,
        description: rules.hint
      }));

      const selectedPrefix = await vscode.window.showQuickPick(prefixItems, {
        placeHolder: 'Select branch prefix',
        title: `Branch Prefix (${rules.hint})`
      });

      if (!selectedPrefix) {
        return;
      }

      const prefix = selectedPrefix.label;

      // Get branch details based on prefix
      let branchName = '';

      if (prefix === 'release/') {
        const productName = await vscode.window.showInputBox({
          prompt: 'Enter product name',
          placeHolder: 'HexOGen'
        });
        if (!productName) return;

        const version = await vscode.window.showInputBox({
          prompt: 'Enter version',
          placeHolder: '10.54.0'
        });
        if (!version) return;

        branchName = `release/${productName}_${version}`;
      } else if (prefix === 'dev/') {
        const devName = await vscode.window.showInputBox({
          prompt: 'Enter development branch name',
          placeHolder: 'sprint-42'
        });
        if (!devName) return;

        branchName = `dev/${devName.toLowerCase().replace(/\s+/g, '-')}`;
      } else {
        // bugfix, feature, task
        const ticketId = await vscode.window.showInputBox({
          prompt: 'Enter ticket ID (optional)',
          placeHolder: 'ECPT-15474'
        });

        const taskTitle = await vscode.window.showInputBox({
          prompt: 'Enter task title',
          placeHolder: 'Design and Implement XML Parser'
        });
        if (!taskTitle) return;

        const kebabTitle = taskTitle.toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        branchName = ticketId
          ? `${prefix}${ticketId}-${kebabTitle}`
          : `${prefix}${kebabTitle}`;
      }

      // Select submodules
      const items = submodules.map(s => ({
        label: s.name,
        description: s.path,
        picked: true
      }));

      const selected = await vscode.window.showQuickPick(items, {
        canPickMany: true,
        placeHolder: 'Select submodules to create branch in'
      });

      if (!selected || selected.length === 0) {
        return;
      }

      const selectedPaths = selected.map(s => s.description!);

      // Create branches
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Creating branch '${branchName}'...`,
          cancellable: false
        },
        async () => {
          return await gitOps.createBranchAcrossSubmodules(
            selectedPaths,
            branchName,
            baseBranch,
            true
          );
        }
      );

      let successCount = 0;
      let failCount = 0;
      const successfulPaths: string[] = [];

      result.forEach((res, path) => {
        if (res.success) {
          successCount++;
          successfulPaths.push(path);
        } else {
          failCount++;
        }
      });

      // Show result and ask to push
      if (successCount > 0) {
        const message = failCount === 0
          ? `Branch '${branchName}' created in ${successCount} submodule(s)`
          : `Branch created in ${successCount}, failed in ${failCount} submodule(s)`;

        const pushChoice = await vscode.window.showInformationMessage(
          message,
          'Push to Remote',
          'Close'
        );

        if (pushChoice === 'Push to Remote') {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `Pushing branch '${branchName}'...`,
              cancellable: false
            },
            async () => {
              let pushSuccess = 0;
              for (const submodulePath of successfulPaths) {
                const pushResult = await gitOps.pushChanges(submodulePath);
                if (pushResult.success) pushSuccess++;
              }
              vscode.window.showInformationMessage(
                `Pushed to ${pushSuccess}/${successfulPaths.length} remote(s)`
              );
            }
          );
        }
      } else {
        vscode.window.showErrorMessage('Failed to create branch in all submodules');
      }

      submoduleTreeProvider.refresh();
    })
  );

  // Sync versions command
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.syncVersions', async () => {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Syncing submodule versions...',
          cancellable: false
        },
        async () => {
          return await gitOps.syncAllSubmodules();
        }
      );

      let successCount = 0;
      result.forEach((res) => {
        if (res.success) {
          successCount++;
        }
      });

      vscode.window.showInformationMessage(
        `Synced ${successCount}/${result.size} submodule(s)`
      );

      submoduleTreeProvider.refresh();
    })
  );

  // Open submodule command
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.openSubmodule', async (item) => {
      if (item && item.submodule) {
        const fullPath = vscode.Uri.file(
          require('path').join(workspaceRoot, item.submodule.path)
        );
        await vscode.commands.executeCommand('revealInExplorer', fullPath);
      }
    })
  );

  // Checkout branch command
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.checkoutBranch', async (item) => {
      if (!item || !item.submodule) {
        return;
      }

      const branches = await gitOps.getBranches(item.submodule.path);

      if (branches.length === 0) {
        vscode.window.showWarningMessage('No branches found');
        return;
      }

      const branchItems = branches.map(b => ({
        label: b.name,
        description: b.isCurrent ? '(current)' : undefined,
        detail: b.isRemote ? 'Remote branch' : 'Local branch'
      }));

      const selected = await vscode.window.showQuickPick(branchItems, {
        placeHolder: 'Select a branch to checkout'
      });

      if (!selected) {
        return;
      }

      const result = await gitOps.checkoutBranch(item.submodule.path, selected.label);

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }

      submoduleTreeProvider.refresh();
    })
  );

  // Checkout branch from tree view (direct click on branch item)
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.checkoutBranchFromTree', async (submodulePath: string, branchName: string) => {
      if (!submodulePath || !branchName) {
        return;
      }

      const result = await gitOps.checkoutBranch(submodulePath, branchName);

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }

      submoduleTreeProvider.refresh();
    })
  );

  // Pull changes command
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.pullChanges', async (item) => {
      if (!item || !item.submodule) {
        return;
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Pulling changes for ${item.submodule.name}...`,
          cancellable: false
        },
        async () => {
          return await gitOps.pullChanges(item.submodule.path);
        }
      );

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }

      submoduleTreeProvider.refresh();
    })
  );

  // Push changes command
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.pushChanges', async (item) => {
      if (!item || !item.submodule) {
        return;
      }

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Pushing changes for ${item.submodule.name}...`,
          cancellable: false
        },
        async () => {
          return await gitOps.pushChanges(item.submodule.path);
        }
      );

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }

      submoduleTreeProvider.refresh();
    })
  );

  // Create PR command
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.createPR', async (item) => {
      if (!item || !item.submodule) {
        return;
      }

      await prManager.createPRWithGitHub(item.submodule.path);
    })
  );

  // Stage submodule command
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.stageSubmodule', async (item) => {
      if (!item || !item.submodule) {
        return;
      }

      const result = await gitOps.stageSubmodule(item.submodule.path);

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    })
  );
}

export function deactivate() {
  console.log('Submodule Manager extension is now deactivated');
}
