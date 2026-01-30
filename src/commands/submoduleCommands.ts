/**
 * Command handlers for submodule operations
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { GitOperations } from '../gitOperations';
import { SubmoduleTreeProvider } from '../submoduleTreeProvider';
import { SubmoduleManagerPanel } from '../webviewPanel';
import { PRManager } from '../prManager';

export interface CommandContext {
  gitOps: GitOperations;
  submoduleTreeProvider: SubmoduleTreeProvider;
  prManager: PRManager;
  workspaceRoot: string;
  extensionUri: vscode.Uri;
}

/**
 * Register refresh command
 */
export function registerRefreshCommand(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.refresh', () => {
      ctx.submoduleTreeProvider.refresh();
      if (SubmoduleManagerPanel.currentPanel) {
        SubmoduleManagerPanel.currentPanel.refresh();
      }
      vscode.window.showInformationMessage('Submodules refreshed');
    })
  );
}

/**
 * Register open panel command
 */
export function registerOpenPanelCommand(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.openPanel', () => {
      SubmoduleManagerPanel.createOrShow(ctx.extensionUri, ctx.workspaceRoot);
    })
  );
}

/**
 * Register initialize submodules command
 */
export function registerInitSubmodulesCommand(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.initSubmodules', async () => {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Initializing submodules...',
          cancellable: false
        },
        async () => {
          return await ctx.gitOps.initSubmodules();
        }
      );

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }

      ctx.submoduleTreeProvider.refresh();
    })
  );
}

/**
 * Register update submodules command
 */
export function registerUpdateSubmodulesCommand(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.updateSubmodules', async () => {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Updating submodules...',
          cancellable: false
        },
        async () => {
          return await ctx.gitOps.updateSubmodules();
        }
      );

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }

      ctx.submoduleTreeProvider.refresh();
    })
  );
}

/**
 * Register sync versions command
 */
export function registerSyncVersionsCommand(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.syncVersions', async () => {
      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Syncing submodule versions...',
          cancellable: false
        },
        async () => {
          return await ctx.gitOps.syncAllSubmodules();
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

      ctx.submoduleTreeProvider.refresh();
    })
  );
}

/**
 * Register open submodule command
 */
export function registerOpenSubmoduleCommand(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.openSubmodule', async (item) => {
      if (item && item.submodule) {
        const fullPath = vscode.Uri.file(
          path.join(ctx.workspaceRoot, item.submodule.path)
        );
        await vscode.commands.executeCommand('revealInExplorer', fullPath);
      }
    })
  );
}

/**
 * Register checkout branch command
 */
export function registerCheckoutBranchCommand(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.checkoutBranch', async (item) => {
      if (!item || !item.submodule) {
        return;
      }

      const branches = await ctx.gitOps.getBranches(item.submodule.path);

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

      const result = await ctx.gitOps.checkoutBranch(item.submodule.path, selected.label);

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }

      ctx.submoduleTreeProvider.refresh();
    })
  );
}

/**
 * Register checkout branch from tree command
 */
export function registerCheckoutBranchFromTreeCommand(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.checkoutBranchFromTree', async (submodulePath: string, branchName: string) => {
      if (!submodulePath || !branchName) {
        return;
      }

      const result = await ctx.gitOps.checkoutBranch(submodulePath, branchName);

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }

      ctx.submoduleTreeProvider.refresh();
    })
  );
}

/**
 * Register pull changes command
 */
export function registerPullChangesCommand(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
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
          return await ctx.gitOps.pullChanges(item.submodule.path);
        }
      );

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }

      ctx.submoduleTreeProvider.refresh();
    })
  );
}

/**
 * Register push changes command
 */
export function registerPushChangesCommand(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
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
          return await ctx.gitOps.pushChanges(item.submodule.path);
        }
      );

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }

      ctx.submoduleTreeProvider.refresh();
    })
  );
}

/**
 * Register create PR command
 */
export function registerCreatePRCommand(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.createPR', async (item) => {
      if (!item || !item.submodule) {
        return;
      }

      await ctx.prManager.createPRWithGitHub(item.submodule.path);
    })
  );
}

/**
 * Register stage submodule command
 */
export function registerStageSubmoduleCommand(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('submoduleManager.stageSubmodule', async (item) => {
      if (!item || !item.submodule) {
        return;
      }

      const result = await ctx.gitOps.stageSubmodule(item.submodule.path);

      if (result.success) {
        vscode.window.showInformationMessage(result.message);
      } else {
        vscode.window.showErrorMessage(result.message);
      }
    })
  );
}

/**
 * Register all basic commands (excluding create branch)
 */
export function registerBasicCommands(
  context: vscode.ExtensionContext,
  ctx: CommandContext
): void {
  registerOpenPanelCommand(context, ctx);
  registerRefreshCommand(context, ctx);
  registerInitSubmodulesCommand(context, ctx);
  registerUpdateSubmodulesCommand(context, ctx);
  registerSyncVersionsCommand(context, ctx);
  registerOpenSubmoduleCommand(context, ctx);
  registerCheckoutBranchCommand(context, ctx);
  registerCheckoutBranchFromTreeCommand(context, ctx);
  registerPullChangesCommand(context, ctx);
  registerPushChangesCommand(context, ctx);
  registerCreatePRCommand(context, ctx);
  registerStageSubmoduleCommand(context, ctx);
}
