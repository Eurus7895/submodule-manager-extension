/**
 * Webview Message Handler
 * Handles all messages from the webview panel
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { GitOperations } from '../gitOperations';
import { PRManager } from '../prManager';

export interface MessageHandlerContext {
  panel: vscode.WebviewPanel;
  gitOps: GitOperations;
  prManager: PRManager;
  workspaceRoot: string;
  refresh: () => Promise<void>;
}

export type MessagePayload = {
  submodules?: string[];
  submodule?: string;
  branchName?: string;
  baseBranch?: string;
  branch?: string;
  commit?: string;
  isRebasing?: boolean;
};

/**
 * Show result message to user
 */
function showResult(success: boolean, message: string): void {
  if (success) {
    vscode.window.showInformationMessage(message);
  } else {
    vscode.window.showErrorMessage(message);
  }
}

/**
 * Handler for initializing submodules
 */
export async function handleInitSubmodules(ctx: MessageHandlerContext): Promise<void> {
  const result = await ctx.gitOps.initSubmodules();
  showResult(result.success, result.message);
  await ctx.refresh();
}

/**
 * Handler for updating submodules
 */
export async function handleUpdateSubmodules(ctx: MessageHandlerContext): Promise<void> {
  const result = await ctx.gitOps.updateSubmodules();
  showResult(result.success, result.message);
  await ctx.refresh();
}

/**
 * Handler for creating a branch
 */
export async function handleCreateBranch(
  ctx: MessageHandlerContext,
  payload: { submodules: string[]; branchName: string; baseBranch: string }
): Promise<void> {
  const results = await ctx.gitOps.createBranchAcrossSubmodules(
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

  await ctx.refresh();
}

/**
 * Handler for creating a branch with review
 */
export async function handleCreateBranchWithReview(
  ctx: MessageHandlerContext,
  payload: { submodules: string[]; branchName: string; baseBranch: string }
): Promise<void> {
  const results = await ctx.gitOps.createBranchAcrossSubmodules(
    payload.submodules,
    payload.branchName,
    payload.baseBranch,
    true
  );

  // Convert results map to array for sending to webview
  const resultsArray: Array<{ submodule: string; success: boolean; message: string }> = [];
  results.forEach((result, submodulePath) => {
    resultsArray.push({
      submodule: submodulePath,
      success: result.success,
      message: result.message
    });
  });

  // Send results to webview for review
  ctx.panel.webview.postMessage({
    type: 'branchCreationResults',
    payload: {
      branchName: payload.branchName,
      results: resultsArray
    }
  });

  await ctx.refresh();
}

/**
 * Handler for getting base branches for create modal
 */
export async function handleGetBaseBranchesForCreate(ctx: MessageHandlerContext): Promise<void> {
  try {
    // Get branches from the main repository
    const branches = await ctx.gitOps.getBranches('.');

    // If no branches found, send fallback
    if (!branches || branches.length === 0) {
      console.warn('No branches found, using fallback');
      ctx.panel.webview.postMessage({
        type: 'baseBranchesForCreate',
        payload: {
          branches: [
            { name: 'main', isCurrent: false, isRemote: false },
            { name: 'master', isCurrent: false, isRemote: false },
            { name: 'develop', isCurrent: false, isRemote: false }
          ]
        }
      });
      return;
    }

    ctx.panel.webview.postMessage({
      type: 'baseBranchesForCreate',
      payload: {
        branches: branches
      }
    });
  } catch (error) {
    console.error('Error getting branches for create:', error);
    // Fallback to default branches
    ctx.panel.webview.postMessage({
      type: 'baseBranchesForCreate',
      payload: {
        branches: [
          { name: 'main', isCurrent: false, isRemote: false },
          { name: 'master', isCurrent: false, isRemote: false },
          { name: 'develop', isCurrent: false, isRemote: false }
        ]
      }
    });
  }
}

/**
 * Handler for pushing created branches
 */
export async function handlePushCreatedBranches(
  ctx: MessageHandlerContext,
  payload: { submodules: string[]; branchName: string }
): Promise<void> {
  const results: Array<{ submodule: string; success: boolean; message: string }> = [];

  for (const submodulePath of payload.submodules) {
    try {
      const result = await ctx.gitOps.pushChanges(submodulePath);
      results.push({
        submodule: submodulePath,
        success: result.success,
        message: result.message
      });
    } catch (error) {
      results.push({
        submodule: submodulePath,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  const successCount = results.filter(r => r.success).length;

  if (successCount === results.length) {
    vscode.window.showInformationMessage(
      `Branch '${payload.branchName}' pushed to ${successCount} remote(s)`
    );
  } else {
    vscode.window.showWarningMessage(
      `Pushed to ${successCount}/${results.length} remotes`
    );
  }

  // Send results to webview
  ctx.panel.webview.postMessage({
    type: 'pushResults',
    payload: { results }
  });

  await ctx.refresh();
}

/**
 * Handler for checking out a branch
 */
export async function handleCheckoutBranch(
  ctx: MessageHandlerContext,
  payload: { submodule: string; branch: string }
): Promise<void> {
  const result = await ctx.gitOps.checkoutBranch(payload.submodule, payload.branch);
  showResult(result.success, result.message);
  await ctx.refresh();
}

/**
 * Handler for pulling changes
 */
export async function handlePullChanges(
  ctx: MessageHandlerContext,
  payload: { submodule: string }
): Promise<void> {
  const result = await ctx.gitOps.pullChanges(payload.submodule);
  showResult(result.success, result.message);
  await ctx.refresh();
}

/**
 * Handler for pushing changes
 */
export async function handlePushChanges(
  ctx: MessageHandlerContext,
  payload: { submodule: string }
): Promise<void> {
  const result = await ctx.gitOps.pushChanges(payload.submodule);
  showResult(result.success, result.message);
  await ctx.refresh();
}

/**
 * Handler for syncing versions
 */
export async function handleSyncVersions(
  ctx: MessageHandlerContext,
  payload: { submodules: string[] }
): Promise<void> {
  // Sync only the selected submodules, or all if none selected
  const submodulesToSync = payload.submodules.length > 0 ? payload.submodules : undefined;
  const results = await ctx.gitOps.syncAllSubmodules(submodulesToSync);
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
  await ctx.refresh();
}

/**
 * Handler for creating a PR
 */
export async function handleCreatePR(
  ctx: MessageHandlerContext,
  payload: { submodule: string }
): Promise<void> {
  await ctx.prManager.createPRWithGitHub(payload.submodule);
}

/**
 * Handler for opening a submodule in explorer
 */
export async function handleOpenSubmodule(
  ctx: MessageHandlerContext,
  payload: { submodule: string }
): Promise<void> {
  const fullPath = path.join(ctx.workspaceRoot, payload.submodule);
  const uri = vscode.Uri.file(fullPath);
  await vscode.commands.executeCommand('revealInExplorer', uri);
}

/**
 * Handler for staging a submodule
 */
export async function handleStageSubmodule(
  ctx: MessageHandlerContext,
  payload: { submodule: string }
): Promise<void> {
  const result = await ctx.gitOps.stageSubmodule(payload.submodule);
  showResult(result.success, result.message);
}

/**
 * Handler for getting branches
 */
export async function handleGetBranches(
  ctx: MessageHandlerContext,
  payload: { submodule: string }
): Promise<void> {
  try {
    const branches = await ctx.gitOps.getBranches(payload.submodule);

    // If no branches found, send fallback
    if (!branches || branches.length === 0) {
      console.warn(`No branches found for ${payload.submodule}, using fallback`);
      ctx.panel.webview.postMessage({
        type: 'branches',
        payload: {
          submodule: payload.submodule,
          branches: [
            { name: 'main', isCurrent: false, isRemote: false },
            { name: 'master', isCurrent: false, isRemote: false }
          ]
        }
      });
      return;
    }

    ctx.panel.webview.postMessage({
      type: 'branches',
      payload: { submodule: payload.submodule, branches }
    });
  } catch (error) {
    console.error('Error getting branches:', error);
    ctx.panel.webview.postMessage({
      type: 'branches',
      payload: {
        submodule: payload.submodule,
        branches: [
          { name: 'main', isCurrent: false, isRemote: false },
          { name: 'master', isCurrent: false, isRemote: false }
        ]
      }
    });
  }
}

/**
 * Handler for checking out a commit
 */
export async function handleCheckoutCommit(
  ctx: MessageHandlerContext,
  payload: { submodule: string; commit: string }
): Promise<void> {
  const result = await ctx.gitOps.checkoutCommit(payload.submodule, payload.commit);
  showResult(result.success, result.message);
  await ctx.refresh();
}

/**
 * Handler for getting commits
 */
export async function handleGetCommits(
  ctx: MessageHandlerContext,
  payload: { submodule: string }
): Promise<void> {
  const commits = await ctx.gitOps.getRecentCommits(payload.submodule, 20);
  ctx.panel.webview.postMessage({
    type: 'commits',
    payload: { submodule: payload.submodule, commits }
  });
}

/**
 * Handler for getting recorded commit
 */
export async function handleGetRecordedCommit(
  ctx: MessageHandlerContext,
  payload: { submodule: string }
): Promise<void> {
  const recordedCommit = await ctx.gitOps.getRecordedCommit(payload.submodule);
  const currentCommit = await ctx.gitOps.getCurrentCommit(payload.submodule);
  ctx.panel.webview.postMessage({
    type: 'recordedCommit',
    payload: {
      submodule: payload.submodule,
      recordedCommit,
      currentCommit,
      isMatching: recordedCommit === currentCommit
    }
  });
}

/**
 * Handler for updating to recorded commit
 */
export async function handleUpdateToRecorded(
  ctx: MessageHandlerContext,
  payload: { submodule: string }
): Promise<void> {
  const result = await ctx.gitOps.updateToRecordedCommit(payload.submodule);
  showResult(result.success, result.message);
  await ctx.refresh();
}

/**
 * Handler for deleting a branch
 */
export async function handleDeleteBranch(
  ctx: MessageHandlerContext,
  payload: { submodule: string; branch: string; deleteRemote: boolean }
): Promise<void> {
  const result = await ctx.gitOps.deleteBranch(payload.submodule, payload.branch, payload.deleteRemote);
  showResult(result.success, result.message);

  // Refresh the branches panel by sending updated branches
  if (result.success) {
    try {
      const branches = await ctx.gitOps.getBranches(payload.submodule);
      ctx.panel.webview.postMessage({
        type: 'branches',
        payload: { submodule: payload.submodule, branches }
      });
    } catch {
      // Ignore branch refresh errors
    }
  }

  await ctx.refresh();
}

/**
 * Handler for setting rebase status
 */
export async function handleSetRebaseStatus(
  ctx: MessageHandlerContext,
  payload: { submodule: string; isRebasing: boolean }
): Promise<void> {
  ctx.panel.webview.postMessage({
    type: 'rebaseStatusUpdated',
    payload: { submodule: payload.submodule, isRebasing: payload.isRebasing }
  });
}

/**
 * Message handler map for quick lookup
 */
export const messageHandlers: Record<string, (ctx: MessageHandlerContext, payload?: unknown) => Promise<void>> = {
  'initSubmodules': (ctx) => handleInitSubmodules(ctx),
  'updateSubmodules': (ctx) => handleUpdateSubmodules(ctx),
  'createBranch': (ctx, payload) => handleCreateBranch(ctx, payload as { submodules: string[]; branchName: string; baseBranch: string }),
  'createBranchWithReview': (ctx, payload) => handleCreateBranchWithReview(ctx, payload as { submodules: string[]; branchName: string; baseBranch: string }),
  'getBaseBranchesForCreate': (ctx) => handleGetBaseBranchesForCreate(ctx),
  'pushCreatedBranches': (ctx, payload) => handlePushCreatedBranches(ctx, payload as { submodules: string[]; branchName: string }),
  'checkoutBranch': (ctx, payload) => handleCheckoutBranch(ctx, payload as { submodule: string; branch: string }),
  'pullChanges': (ctx, payload) => handlePullChanges(ctx, payload as { submodule: string }),
  'pushChanges': (ctx, payload) => handlePushChanges(ctx, payload as { submodule: string }),
  'syncVersions': (ctx, payload) => handleSyncVersions(ctx, payload as { submodules: string[] }),
  'createPR': (ctx, payload) => handleCreatePR(ctx, payload as { submodule: string }),
  'openSubmodule': (ctx, payload) => handleOpenSubmodule(ctx, payload as { submodule: string }),
  'stageSubmodule': (ctx, payload) => handleStageSubmodule(ctx, payload as { submodule: string }),
  'getBranches': (ctx, payload) => handleGetBranches(ctx, payload as { submodule: string }),
  'checkoutCommit': (ctx, payload) => handleCheckoutCommit(ctx, payload as { submodule: string; commit: string }),
  'getCommits': (ctx, payload) => handleGetCommits(ctx, payload as { submodule: string }),
  'getRecordedCommit': (ctx, payload) => handleGetRecordedCommit(ctx, payload as { submodule: string }),
  'updateToRecorded': (ctx, payload) => handleUpdateToRecorded(ctx, payload as { submodule: string }),
  'deleteBranch': (ctx, payload) => handleDeleteBranch(ctx, payload as { submodule: string; branch: string; deleteRemote: boolean }),
  'setRebaseStatus': (ctx, payload) => handleSetRebaseStatus(ctx, payload as { submodule: string; isRebasing: boolean })
};
