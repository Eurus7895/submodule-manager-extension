/**
 * Git operations module for submodule management
 */

import * as path from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import {
  SubmoduleInfo,
  SubmoduleStatus,
  BranchInfo,
  GitStatus,
  CommitInfo,
  RemoteInfo,
  CommandResult
} from './types';

const execAsync = promisify(exec);

export class GitOperations {
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Execute a git command and return the output
   */
  private async execGit(args: string[], cwd?: string): Promise<string> {
    const workDir = cwd || this.workspaceRoot;
    const command = `git ${args.join(' ')}`;

    try {
      const { stdout } = await execAsync(command, {
        cwd: workDir,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      return stdout.trim();
    } catch (error: unknown) {
      const err = error as { stderr?: string; message?: string };
      throw new Error(err.stderr || err.message || 'Git command failed');
    }
  }

  /**
   * Execute git command with streaming output
   */
  private execGitStream(args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const workDir = cwd || this.workspaceRoot;
      const process = spawn('git', args, { cwd: workDir });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr || `Git command failed with code ${code}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Check if the workspace is a git repository
   */
  async isGitRepository(): Promise<boolean> {
    try {
      await this.execGit(['rev-parse', '--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get list of all submodules
   */
  async getSubmodules(): Promise<SubmoduleInfo[]> {
    const submodules: SubmoduleInfo[] = [];

    try {
      // Get submodule configuration
      const config = await this.execGit(['config', '--file', '.gitmodules', '--get-regexp', 'path']);
      const lines = config.split('\n').filter(line => line.trim());

      for (const line of lines) {
        const match = line.match(/submodule\.(.+)\.path\s+(.+)/);
        if (match) {
          const name = match[1];
          const submodulePath = match[2];

          try {
            const info = await this.getSubmoduleInfo(name, submodulePath);
            submodules.push(info);
          } catch (error) {
            // Submodule may not be initialized
            submodules.push({
              name,
              path: submodulePath,
              url: '',
              branch: '',
              currentCommit: '',
              currentBranch: '',
              status: 'uninitialized',
              hasChanges: false,
              ahead: 0,
              behind: 0
            });
          }
        }
      }
    } catch {
      // No .gitmodules file or no submodules
    }

    return submodules;
  }

  /**
   * Get detailed information about a specific submodule
   */
  async getSubmoduleInfo(name: string, submodulePath: string): Promise<SubmoduleInfo> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);

    // Get URL
    let url = '';
    try {
      url = await this.execGit(['config', '--file', '.gitmodules', `submodule.${name}.url`]);
    } catch {
      // URL not found
    }

    // Get configured branch
    let branch = '';
    try {
      branch = await this.execGit(['config', '--file', '.gitmodules', `submodule.${name}.branch`]);
    } catch {
      branch = 'main'; // Default branch
    }

    // Check if submodule is initialized
    let currentCommit = '';
    let currentBranch = '';
    let status: SubmoduleStatus = 'unknown';
    let hasChanges = false;
    let ahead = 0;
    let behind = 0;

    try {
      // Get current commit
      currentCommit = await this.execGit(['rev-parse', 'HEAD'], fullPath);

      // Get current branch
      try {
        currentBranch = await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], fullPath);
        if (currentBranch === 'HEAD') {
          status = 'detached';
        }
      } catch {
        status = 'detached';
      }

      // Check for changes
      const statusOutput = await this.execGit(['status', '--porcelain'], fullPath);
      hasChanges = statusOutput.length > 0;

      if (hasChanges) {
        status = 'modified';
      } else if (status !== 'detached') {
        status = 'clean';
      }

      // Get ahead/behind counts
      if (currentBranch && currentBranch !== 'HEAD') {
        try {
          const tracking = await this.execGit(
            ['rev-list', '--left-right', '--count', `origin/${currentBranch}...HEAD`],
            fullPath
          );
          const [behindStr, aheadStr] = tracking.split('\t');
          behind = parseInt(behindStr, 10) || 0;
          ahead = parseInt(aheadStr, 10) || 0;
        } catch {
          // No tracking branch
        }
      }
    } catch {
      status = 'uninitialized';
    }

    return {
      name,
      path: submodulePath,
      url,
      branch,
      currentCommit: currentCommit.substring(0, 8),
      currentBranch,
      status,
      hasChanges,
      ahead,
      behind,
      lastUpdated: new Date()
    };
  }

  /**
   * Initialize all submodules
   */
  async initSubmodules(): Promise<CommandResult> {
    try {
      await this.execGit(['submodule', 'init']);
      await this.execGit(['submodule', 'update', '--init', '--recursive']);
      return { success: true, message: 'Submodules initialized successfully' };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to initialize submodules: ${err.message}` };
    }
  }

  /**
   * Update all submodules
   */
  async updateSubmodules(): Promise<CommandResult> {
    try {
      await this.execGit(['submodule', 'update', '--remote', '--recursive']);
      return { success: true, message: 'Submodules updated successfully' };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to update submodules: ${err.message}` };
    }
  }

  /**
   * Get branches for a submodule
   */
  async getBranches(submodulePath: string): Promise<BranchInfo[]> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);
    const branches: BranchInfo[] = [];

    try {
      // Fetch to get latest remote branches
      await this.execGit(['fetch', '--all'], fullPath);

      // Get current branch
      let currentBranch = '';
      try {
        currentBranch = await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], fullPath);
      } catch {
        // Detached HEAD
      }

      // Get all branches
      const output = await this.execGit(
        ['branch', '-a', '--format=%(refname:short)|%(objectname:short)|%(committerdate:iso)'],
        fullPath
      );

      for (const line of output.split('\n').filter(l => l.trim())) {
        const [name, commit, dateStr] = line.split('|');
        const isRemote = name.startsWith('origin/');
        const cleanName = isRemote ? name.replace('origin/', '') : name;

        // Skip HEAD reference
        if (cleanName === 'HEAD' || name === 'origin/HEAD') {
          continue;
        }

        branches.push({
          name: cleanName,
          isRemote,
          isCurrent: cleanName === currentBranch,
          commit,
          lastCommitDate: dateStr ? new Date(dateStr) : undefined
        });
      }
    } catch (error) {
      console.error('Error getting branches:', error);
    }

    return branches;
  }

  /**
   * Create a branch in the specified submodule
   */
  async createBranch(
    submodulePath: string,
    branchName: string,
    baseBranch?: string,
    checkout: boolean = true
  ): Promise<CommandResult> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);

    try {
      // If base branch specified, start from it
      if (baseBranch) {
        await this.execGit(['checkout', baseBranch], fullPath);
        await this.execGit(['pull', 'origin', baseBranch], fullPath);
      }

      // Create the branch
      if (checkout) {
        await this.execGit(['checkout', '-b', branchName], fullPath);
      } else {
        await this.execGit(['branch', branchName], fullPath);
      }

      return { success: true, message: `Branch '${branchName}' created successfully` };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to create branch: ${err.message}` };
    }
  }

  /**
   * Create a branch across multiple submodules
   */
  async createBranchAcrossSubmodules(
    submodulePaths: string[],
    branchName: string,
    baseBranch?: string,
    checkout: boolean = true
  ): Promise<Map<string, CommandResult>> {
    const results = new Map<string, CommandResult>();

    for (const submodulePath of submodulePaths) {
      const result = await this.createBranch(submodulePath, branchName, baseBranch, checkout);
      results.set(submodulePath, result);
    }

    return results;
  }

  /**
   * Checkout a branch in a submodule
   */
  async checkoutBranch(submodulePath: string, branchName: string): Promise<CommandResult> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);

    try {
      await this.execGit(['checkout', branchName], fullPath);
      return { success: true, message: `Checked out '${branchName}'` };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to checkout: ${err.message}` };
    }
  }

  /**
   * Pull changes for a submodule
   */
  async pullChanges(submodulePath: string, branch?: string): Promise<CommandResult> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);

    try {
      const currentBranch = branch || await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], fullPath);
      await this.execGit(['pull', 'origin', currentBranch], fullPath);
      return { success: true, message: 'Changes pulled successfully' };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to pull: ${err.message}` };
    }
  }

  /**
   * Push changes for a submodule
   */
  async pushChanges(submodulePath: string, branch?: string): Promise<CommandResult> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);

    try {
      const currentBranch = branch || await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], fullPath);
      await this.execGit(['push', '-u', 'origin', currentBranch], fullPath);
      return { success: true, message: 'Changes pushed successfully' };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to push: ${err.message}` };
    }
  }

  /**
   * Fetch updates for a submodule
   */
  async fetchUpdates(submodulePath: string): Promise<CommandResult> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);

    try {
      await this.execGit(['fetch', '--all', '--prune'], fullPath);
      return { success: true, message: 'Updates fetched successfully' };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to fetch: ${err.message}` };
    }
  }

  /**
   * Get git status for a submodule
   */
  async getStatus(submodulePath: string): Promise<GitStatus> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);
    const status: GitStatus = {
      staged: [],
      unstaged: [],
      untracked: [],
      hasChanges: false
    };

    try {
      const output = await this.execGit(['status', '--porcelain'], fullPath);

      for (const line of output.split('\n').filter(l => l)) {
        const indexStatus = line[0];
        const workTreeStatus = line[1];
        const file = line.substring(3);

        if (indexStatus === '?' && workTreeStatus === '?') {
          status.untracked.push(file);
        } else if (indexStatus !== ' ' && indexStatus !== '?') {
          status.staged.push(file);
        } else if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
          status.unstaged.push(file);
        }
      }

      status.hasChanges = status.staged.length > 0 ||
                          status.unstaged.length > 0 ||
                          status.untracked.length > 0;
    } catch {
      // Error getting status
    }

    return status;
  }

  /**
   * Stage submodule changes in parent repo
   */
  async stageSubmodule(submodulePath: string): Promise<CommandResult> {
    try {
      await this.execGit(['add', submodulePath]);
      return { success: true, message: `Staged submodule '${submodulePath}'` };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to stage: ${err.message}` };
    }
  }

  /**
   * Sync submodule to a specific commit or branch
   */
  async syncSubmodule(submodulePath: string, target: string): Promise<CommandResult> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);

    try {
      await this.execGit(['fetch', '--all'], fullPath);
      await this.execGit(['checkout', target], fullPath);
      return { success: true, message: `Synced to '${target}'` };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to sync: ${err.message}` };
    }
  }

  /**
   * Sync submodules to their recorded commits in the parent repository
   * @param submodulePaths Optional list of submodule paths to sync. If not provided, syncs all.
   */
  async syncAllSubmodules(submodulePaths?: string[]): Promise<Map<string, CommandResult>> {
    const results = new Map<string, CommandResult>();
    const submodules = await this.getSubmodules();

    for (const submodule of submodules) {
      // If specific paths provided, only sync those
      if (submodulePaths && submodulePaths.length > 0 && !submodulePaths.includes(submodule.path)) {
        continue;
      }

      // Get the recorded commit from the parent repository
      const recordedCommit = await this.getRecordedCommit(submodule.path);

      if (recordedCommit) {
        // Sync to the recorded commit, not the branch
        const result = await this.syncSubmodule(submodule.path, recordedCommit);
        results.set(submodule.path, result);
      } else {
        results.set(submodule.path, {
          success: false,
          message: `No recorded commit found for '${submodule.path}'`
        });
      }
    }

    return results;
  }

  /**
   * Get recent commits for a submodule
   */
  async getRecentCommits(submodulePath: string, count: number = 10): Promise<CommitInfo[]> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);
    const commits: CommitInfo[] = [];

    try {
      const output = await this.execGit(
        ['log', `-${count}`, '--format=%H|%h|%an|%ae|%ai|%s'],
        fullPath
      );

      for (const line of output.split('\n').filter(l => l)) {
        const [hash, shortHash, author, email, date, message] = line.split('|');
        commits.push({
          hash,
          shortHash,
          author,
          email,
          date: new Date(date),
          message
        });
      }
    } catch {
      // Error getting commits
    }

    return commits;
  }

  /**
   * Get remote information for a submodule
   */
  async getRemotes(submodulePath: string): Promise<RemoteInfo[]> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);
    const remotes: RemoteInfo[] = [];

    try {
      const output = await this.execGit(['remote', '-v'], fullPath);
      const remoteMap = new Map<string, RemoteInfo>();

      for (const line of output.split('\n').filter(l => l)) {
        const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
        if (match) {
          const [, name, url, type] = match;

          if (!remoteMap.has(name)) {
            remoteMap.set(name, { name, fetchUrl: '', pushUrl: '' });
          }

          const remote = remoteMap.get(name)!;
          if (type === 'fetch') {
            remote.fetchUrl = url;
          } else {
            remote.pushUrl = url;
          }
        }
      }

      remotes.push(...remoteMap.values());
    } catch {
      // Error getting remotes
    }

    return remotes;
  }

  /**
   * Get GitHub repository info from remote URL
   */
  parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    // Handle SSH format: git@github.com:owner/repo.git
    let match = url.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }

    // Handle HTTPS format: https://github.com/owner/repo.git
    match = url.match(/https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);
    if (match) {
      return { owner: match[1], repo: match[2] };
    }

    return null;
  }

  /**
   * Checkout a specific commit in a submodule
   */
  async checkoutCommit(submodulePath: string, commit: string): Promise<CommandResult> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);

    try {
      await this.execGit(['fetch', '--all'], fullPath);
      await this.execGit(['checkout', commit], fullPath);
      return { success: true, message: `Checked out commit '${commit.substring(0, 8)}'` };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to checkout commit: ${err.message}` };
    }
  }

  /**
   * Get the commit hash recorded in the parent repository for a submodule
   * This is the commit the parent repo expects the submodule to be at
   */
  async getRecordedCommit(submodulePath: string): Promise<string> {
    try {
      // Use ls-tree to get the recorded commit for the submodule
      const output = await this.execGit(['ls-tree', 'HEAD', submodulePath]);
      const match = output.match(/commit\s+([a-f0-9]+)/);
      if (match) {
        return match[1];
      }
      return '';
    } catch {
      return '';
    }
  }

  /**
   * Get the current HEAD commit of a submodule
   */
  async getCurrentCommit(submodulePath: string): Promise<string> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);

    try {
      return await this.execGit(['rev-parse', 'HEAD'], fullPath);
    } catch {
      return '';
    }
  }

  /**
   * Update a submodule to the commit recorded in the parent repository
   */
  async updateToRecordedCommit(submodulePath: string): Promise<CommandResult> {
    try {
      // This updates the submodule to the commit recorded in the parent's index
      // WITHOUT the --remote flag, it uses the recorded commit
      await this.execGit(['submodule', 'update', '--init', '--', submodulePath]);
      return { success: true, message: `Updated '${submodulePath}' to recorded commit` };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to update: ${err.message}` };
    }
  }

  /**
   * Update submodules to their recorded commits (not remote)
   * This is different from updateSubmodules which fetches the latest from remote
   */
  async updateSubmodulesToRecorded(): Promise<CommandResult> {
    try {
      // Without --remote, this updates to the recorded commits
      await this.execGit(['submodule', 'update', '--init', '--recursive']);
      return { success: true, message: 'Submodules updated to recorded commits' };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to update submodules: ${err.message}` };
    }
  }

  /**
   * Record a specific commit for a submodule in the parent repository
   * This stages the submodule pointer change
   */
  async recordSubmoduleCommit(submodulePath: string, commit?: string): Promise<CommandResult> {
    const fullPath = path.join(this.workspaceRoot, submodulePath);

    try {
      // If a specific commit is provided, checkout that commit first
      if (commit) {
        await this.execGit(['fetch', '--all'], fullPath);
        await this.execGit(['checkout', commit], fullPath);
      }

      // Stage the submodule change in the parent repo
      await this.execGit(['add', submodulePath]);
      const currentCommit = await this.getCurrentCommit(submodulePath);

      return {
        success: true,
        message: `Recorded commit '${currentCommit.substring(0, 8)}' for '${submodulePath}'`,
        data: { commit: currentCommit }
      };
    } catch (error: unknown) {
      const err = error as Error;
      return { success: false, message: `Failed to record commit: ${err.message}` };
    }
  }
}
