/**
 * Git Command Service
 * Base service for executing git commands
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class GitCommandService {
  constructor(protected workspaceRoot: string) {}

  /**
   * Execute a git command and return the output
   */
  async execGit(args: string[], cwd?: string, timeoutMs: number = 30000): Promise<string> {
    const workDir = cwd || this.workspaceRoot;
    const command = `git ${args.join(' ')}`;

    try {
      const { stdout } = await execAsync(command, {
        cwd: workDir,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        timeout: timeoutMs
      });
      return stdout.trim();
    } catch (error: unknown) {
      const err = error as { stderr?: string; message?: string; killed?: boolean };
      if (err.killed) {
        throw new Error(`Git command timed out after ${timeoutMs}ms`);
      }
      throw new Error(err.stderr || err.message || 'Git command failed');
    }
  }

  /**
   * Execute git command with streaming output
   */
  execGitStream(args: string[], cwd?: string): Promise<string> {
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
   * Get the workspace root
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot;
  }
}
