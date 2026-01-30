/**
 * Create Branch Command Handler
 * Handles the complex create branch workflow
 */

import * as vscode from 'vscode';
import { GitOperations } from '../gitOperations';
import { SubmoduleTreeProvider } from '../submoduleTreeProvider';

// Branch hierarchy rules
const branchHierarchy: Record<string, { prefixes: string[]; hint: string }> = {
  'main': { prefixes: ['bugfix', 'release', 'dev'], hint: 'From main: bugfix/, release/, dev/' },
  'dev': { prefixes: ['feature'], hint: 'From dev: feature/' },
  'feature': { prefixes: ['task'], hint: 'From feature: task/' }
};

/**
 * Determine branch type from branch name
 */
function getBaseBranchType(branch: string): string {
  const lower = branch.toLowerCase();
  if (lower === 'main' || lower === 'master') return 'main';
  if (lower === 'dev' || lower.startsWith('dev/') || lower.startsWith('dev-')) return 'dev';
  if (lower.startsWith('feature/') || lower.startsWith('feature-')) return 'feature';
  return 'main';
}

/**
 * Convert string to kebab-case
 */
function toKebabCase(str: string): string {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Register the create branch command
 */
export function registerCreateBranchCommand(
  context: vscode.ExtensionContext,
  gitOps: GitOperations,
  submoduleTreeProvider: SubmoduleTreeProvider
): void {
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

      // Get available branches from main repo
      const branches = await gitOps.getBranches('.');

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

        branchName = `dev/${toKebabCase(devName)}`;
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

        const kebabTitle = toKebabCase(taskTitle);

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
}
