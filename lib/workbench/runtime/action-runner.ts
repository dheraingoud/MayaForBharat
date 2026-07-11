import type { WebContainer } from '@webcontainer/api';
import { path as nodePath } from '@/lib/workbench/utils/path';
import { atom, map, type MapStore } from 'nanostores';
import type { ActionAlert, BoltAction, DeployAlert, FileHistory, SupabaseAction, SupabaseAlert } from '@/lib/workbench/types/actions';
import { createScopedLogger } from '@/lib/workbench/utils/logger';
import { unreachable } from '@/lib/workbench/utils/unreachable';
import type { ActionCallbackData } from '@/lib/workbench/message-parser';
import type { BoltShell } from '@/lib/workbench/utils/shell';

const logger = createScopedLogger('ActionRunner');

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export type BaseActionState = BoltAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
};

export type FailedActionState = BoltAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

class ActionCommandError extends Error {
  readonly _output: string;
  readonly _header: string;

  constructor(message: string, output: string) {
    // Create a formatted message that includes both the error message and output
    const formattedMessage = `Failed To Execute Shell Command: ${message}\n\nOutput:\n${output}`;
    super(formattedMessage);

    // Set the output separately so it can be accessed programmatically
    this._header = message;
    this._output = output;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, ActionCommandError.prototype);

    // Set the name of the error for better debugging
    this.name = 'ActionCommandError';
  }

  // Optional: Add a method to get just the terminal output
  get output() {
    return this._output;
  }
  get header() {
    return this._header;
  }
}

export class ActionRunner {
  #webcontainer: Promise<WebContainer>;
  #currentExecutionPromise: Promise<void> = Promise.resolve();
  #shellTerminal: () => BoltShell;
  runnerId = atom<string>(`${Date.now()}`);
  actions: ActionsMap = map({});
  onAlert?: (alert: ActionAlert) => void;
  onSupabaseAlert?: (alert: SupabaseAlert) => void;
  onDeployAlert?: (alert: DeployAlert) => void;
  buildOutput?: { path: string; exitCode: number; output: string };

  /**
   * Shell command timeout in milliseconds. Any shell command (e.g. npm install)
   * that does not complete within this window will be killed via Ctrl+C and
   * surfaced as a failed action with a toast.
   *
   * Override at runtime: ActionRunner.SHELL_TIMEOUT_MS = 600_000;
   * Set to 0 to disable timeout entirely.
   */
  static SHELL_TIMEOUT_MS = 300_000;

  // Auto-fix configuration
  #autoFixAttempts: Map<string, number> = new Map();
  #MAX_AUTO_FIX_ATTEMPTS = 3; // Stop early — a fatal rebuild cascade fires if the LLM fix doesn't land

  // ─── Phase D: persist the auto-fix attempt counter to sessionStorage so a
  //     remount (browser reopen mid-fix-cycle) resumes the counter instead of
  //     resetting to 0 — which would either re-loop the same fix forever or
  //     burn 15 more attempts on an error auto-fix can never solve (e.g.
  //     provider entitlement). The existing attemptKeys (start-${startCommand},
  //     ${actionId}-${command}, preview-${msg slice}) are stable across remount
  //     for a reloaded artifact, so they double as the persistence key — no
  //     appId threading needed. In-memory Map stays as a per-session cache
  //     layered over sessionStorage. Cap stays 15.
  #attemptStorageKey(key: string): string {
    return `maya-autofix:${key}`;
  }
  #getAttempt(key: string): number {
    if (this.#autoFixAttempts.has(key)) return this.#autoFixAttempts.get(key)!;
    try {
      const v = typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(this.#attemptStorageKey(key))
        : null;
      const n = v ? parseInt(v, 10) : 0;
      if (Number.isFinite(n) && n > 0) this.#autoFixAttempts.set(key, n);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }
  #setAttempt(key: string, n: number): void {
    this.#autoFixAttempts.set(key, n);
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(this.#attemptStorageKey(key), String(n));
      }
    } catch {
      /* sessionStorage may be unavailable (private mode) — in-memory only */
    }
  }
  #deleteAttempt(key: string): void {
    this.#autoFixAttempts.delete(key);
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(this.#attemptStorageKey(key));
      }
    } catch {
      /* ignore */
    }
  }
  onAutoFix?: (errorContext: {
    command: string;
    error: string;
    source: 'terminal' | 'preview';
    attempt: number;
    maxAttempts: number;
  }) => void;

  constructor(
    webcontainerPromise: Promise<WebContainer>,
    getShellTerminal: () => BoltShell,
    onAlert?: (alert: ActionAlert) => void,
    onSupabaseAlert?: (alert: SupabaseAlert) => void,
    onDeployAlert?: (alert: DeployAlert) => void,
  ) {
    this.#webcontainer = webcontainerPromise;
    this.#shellTerminal = getShellTerminal;
    this.onAlert = onAlert;
    this.onSupabaseAlert = onSupabaseAlert;
    this.onDeployAlert = onDeployAlert;
  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
      // action already added
      return;
    }

    const abortController = new AbortController();

    this.actions.setKey(actionId, {
      ...data.action,
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(actionId, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });

    this.#currentExecutionPromise.then(() => {
      this.#updateAction(actionId, { status: 'running' });
    });
  }

  async runAction(data: ActionCallbackData, isStreaming: boolean = false) {
    const { actionId } = data;
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      logger.debug(`[runAction] Skipping ${action.type} action ${actionId} — already executed`);
      return; // No return value here
    }

    // F1: during streaming, merge the content delta into state ONLY — never
    // execute (no writeFile, no shell spawn). Execution is deferred to
    // onActionClose (isStreaming=false). Previously file actions were exempted
    // from this defer (the `&& action.type !== 'file'` guard), so every token
    // delta re-ran #runFileAction → writeFile fired 8× in 1s → nanostores
    // setKey storm → React "Maximum update depth exceeded" → the execution
    // queue jammed before <boltAction type="start"> ever ran ("commands don't
    // run after files written"). Vercel-chatbot's onStreamPart only mutates
    // state; we mirror that here. The disk write happens exactly once at close.
    if (isStreaming) {
      this.#updateAction(actionId, { ...action, ...data.action });
      return;
    }

    logger.info(`[runAction] Executing ${action.type} action ${actionId} (isStreaming=${isStreaming})`);
    this.#updateAction(actionId, { ...action, ...data.action, executed: true });

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        return this.#executeAction(actionId, isStreaming);
      })
      .catch((error) => {
        logger.error('Action execution promise failed:', error);
      });

    await this.#currentExecutionPromise;

    return;
  }

  async #executeAction(actionId: string, isStreaming: boolean = false) {
    const action = this.actions.get()[actionId];

    this.#updateAction(actionId, { status: 'running' });

    try {
      switch (action.type) {
        case 'shell': {
          await this.#runShellAction(actionId, action);
          break;
        }
        case 'file': {
          await this.#runFileAction(action);
          break;
        }
        case 'supabase': {
          try {
            await this.handleSupabaseAction(action as SupabaseAction);
          } catch (error: any) {
            // Update action status
            this.#updateAction(actionId, {
              status: 'failed',
              error: error instanceof Error ? error.message : 'Supabase action failed',
            });

            // Return early without re-throwing
            return;
          }
          break;
        }
        case 'build': {
          const buildOutput = await this.#runBuildAction(action);

          // Store build output for deployment
          this.buildOutput = buildOutput;
          break;
        }
        case 'start': {
          // making the start app non blocking

          this.#runStartAction(action)
            .then(() => this.#updateAction(actionId, { status: 'complete' }))
            .catch((err: Error) => {
              if (action.abortSignal.aborted) {
                return;
              }

              this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });
              logger.error(`[${action.type}]:Action failed\n\n`, err);

              if (!(err instanceof ActionCommandError)) {
                return;
              }

              // Auto-fix: try to auto-fix start/dev-server failures before showing manual alert
              const startCommand = action.content || 'npm run dev';

              if (this.onAutoFix) {
                const attemptKey = `start-${startCommand}`;
                const currentAttempt = this.#getAttempt(attemptKey) + 1;
                this.#setAttempt(attemptKey, currentAttempt);

                if (currentAttempt <= this.#MAX_AUTO_FIX_ATTEMPTS) {
                  logger.info(`[AutoFix:Start] Attempt ${currentAttempt}/${this.#MAX_AUTO_FIX_ATTEMPTS} for: ${startCommand}`);
                  this.onAutoFix({
                    command: startCommand,
                    error: err.output || err.message,
                    source: 'terminal',
                    attempt: currentAttempt,
                    maxAttempts: this.#MAX_AUTO_FIX_ATTEMPTS,
                  });
                  return; // Don't show manual alert, auto-fix will handle it
                }

                // Max attempts reached, clear counter and fall through to manual alert
                this.#deleteAttempt(attemptKey);
                logger.warn(`[AutoFix:Start] Max attempts reached for: ${startCommand}`);
              }

              this.onAlert?.({
                type: 'error',
                title: 'Dev Server Failed',
                description: err.header,
                content: err.output,
              });
            });

          /*
           * adding a delay to avoid any race condition between 2 start actions
           * i am up for a better approach
           */
          await new Promise((resolve) => setTimeout(resolve, 2000));

          return;
        }
      }

      this.#updateAction(actionId, {
        status: isStreaming ? 'running' : action.abortSignal.aborted ? 'aborted' : 'complete',
      });
    } catch (error) {
      if (action.abortSignal.aborted) {
        return;
      }

      this.#updateAction(actionId, { status: 'failed', error: 'Action failed' });
      logger.error(`[${action.type}]:Action failed\n\n`, error);

      if (!(error instanceof ActionCommandError)) {
        return;
      }

      // Auto-fix: check if this is a build/compile/install command eligible for auto-retry
      const command = action.type === 'shell' ? action.content : (action.type === 'start' ? action.content : '');
      const isBuildCmd = this.#isAutoFixEligible(command);

      if (isBuildCmd && this.onAutoFix) {
        const attemptKey = `${actionId}-${command}`;
        const currentAttempt = this.#getAttempt(attemptKey) + 1;
        this.#setAttempt(attemptKey, currentAttempt);

        if (currentAttempt <= this.#MAX_AUTO_FIX_ATTEMPTS) {
          logger.info(`[AutoFix] Attempt ${currentAttempt}/${this.#MAX_AUTO_FIX_ATTEMPTS} for: ${command}`);
          this.onAutoFix({
            command,
            error: error.output || error.message,
            source: 'terminal',
            attempt: currentAttempt,
            maxAttempts: this.#MAX_AUTO_FIX_ATTEMPTS,
          });
          return; // Don't show manual alert, auto-fix will handle it
        }

        // Max attempts reached, clear counter and fall through to manual alert
        this.#deleteAttempt(attemptKey);
        logger.warn(`[AutoFix] Max attempts reached for: ${command}`);
      }

      this.onAlert?.({
        type: 'error',
        title: 'Dev Server Failed',
        description: error.header,
        content: error.output,
      });

      // re-throw the error to be caught in the promise chain
      throw error;
    }
  }

  async #runShellAction(actionId: string, action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const shell = this.#shellTerminal();
    await shell.ready();

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }
    // Capture typed locals so TS narrows past the unreachable() throw.
    const shellTerminal = shell.terminal;
    const shellProcess = shell.process;

    // Pre-validate command for common issues
    const validationResult = await this.#validateShellCommand(action.content);

    let commandToRun = action.content;

    if (validationResult.shouldModify && validationResult.modifiedCommand) {
      logger.debug(`Modified command: ${action.content} -> ${validationResult.modifiedCommand}`);
      commandToRun = validationResult.modifiedCommand;
    }

    const timeoutMs = ActionRunner.SHELL_TIMEOUT_MS;

    const executePromise = shell.executeCommand(this.runnerId.get(), commandToRun, () => {
      logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
      action.abort();
    });

    // ── Timeout guard ──────────────────────────────────────────────
    // Shell commands (npm install, npx, etc.) can hang on registry
    // stalls, network blips, or mismatched deps. If they never finish,
    // the verify cycle freezes. Race against a configurable deadline
    // and kill via Ctrl+C on timeout.
    if (timeoutMs > 0) {
      const timedOutSymbol = Symbol('shell-timeout');
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      const raceResult = await Promise.race([
        executePromise.then((resp) => ({ value: resp, timedOut: false as const })),
        new Promise<{ value: typeof timedOutSymbol; timedOut: true }>((resolve) => {
          timeoutId = setTimeout(() => resolve({ value: timedOutSymbol, timedOut: true }), timeoutMs);
        }),
      ]);

      clearTimeout(timeoutId);

      // ── Timeout path ──────────────────────────────────────────────
      if (raceResult.timedOut) {
        shellTerminal.input('\x03');
        logger.error(`[ShellTimeout] Command timed out after ${timeoutMs / 1000}s: ${commandToRun}`);

        this.#updateAction(actionId, {
          status: 'failed',
          error: `Command timed out after ${timeoutMs / 1000}s`,
        });

        // Await the killed command to settle so BoltShell internal
        // state (executionState, stream readers) doesn't leak.
        await executePromise.catch(() => undefined);

        this.onAlert?.({
          type: 'error',
          title: 'Command Timed Out',
          description: `"${commandToRun.slice(0, 80)}" hung for ${timeoutMs / 1000}s and was terminated`,
          content: `The following command did not complete within ${timeoutMs / 1000}s:\n\n${commandToRun}`,
        });

        return;
      }

      // ── Normal path: command completed within budget ──────────────
      const resp = raceResult.value;
      logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

      if (resp?.exitCode != 0) {
        const enhancedError = this.#createEnhancedShellError(action.content, resp?.exitCode, resp?.output);
        throw new ActionCommandError(enhancedError.title, enhancedError.details);
      }
    } else {
      // Timeout disabled (SHELL_TIMEOUT_MS = 0) — original behaviour
      const resp = await executePromise;
      logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

      if (resp?.exitCode != 0) {
        const enhancedError = this.#createEnhancedShellError(action.content, resp?.exitCode, resp?.output);
        throw new ActionCommandError(enhancedError.title, enhancedError.details);
      }
    }
  }

  async #runStartAction(action: ActionState) {
    if (action.type !== 'start') {
      unreachable('Expected shell action');
    }

    if (!this.#shellTerminal) {
      unreachable('Shell terminal not found');
    }

    const shell = this.#shellTerminal();
    await shell.ready();

    if (!shell || !shell.terminal || !shell.process) {
      unreachable('Shell terminal not found');
    }
    // Capture typed locals so TS narrows past the unreachable() throw.
    const shellTerminal = shell.terminal;
    const shellProcess = shell.process;

    const resp = await shell.executeCommand(this.runnerId.get(), action.content, () => {
      logger.debug(`[${action.type}]:Aborting Action\n\n`, action);
      action.abort();
    });
    logger.debug(`${action.type} Shell Response: [exit code:${resp?.exitCode}]`);

    if (resp?.exitCode != 0) {
      throw new ActionCommandError('Failed To Start Application', resp?.output || 'No Output Available');
    }

    return resp;
  }

  async #runFileAction(action: ActionState) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    const webcontainer = await this.#webcontainer;
    const relativePath = nodePath.relative(webcontainer.workdir, action.filePath);

    let folder = nodePath.dirname(relativePath);

    // remove trailing slashes
    folder = folder.replace(/\/+$/g, '');

    if (folder !== '.') {
      try {
        await webcontainer.fs.mkdir(folder, { recursive: true });
        logger.debug('Created folder', folder);
      } catch (error) {
        logger.error('Failed to create folder\n\n', error);
      }
    }

    try {
      await webcontainer.fs.writeFile(relativePath, action.content);
      logger.debug(`File written ${relativePath}`);
    } catch (error) {
      logger.error('Failed to write file\n\n', error);
    }
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState });
  }

  async getFileHistory(filePath: string): Promise<FileHistory | null> {
    try {
      const webcontainer = await this.#webcontainer;
      const historyPath = this.#getHistoryPath(filePath);
      const content = await webcontainer.fs.readFile(historyPath, 'utf-8');

      return JSON.parse(content);
    } catch (error) {
      logger.error('Failed to get file history:', error);
      return null;
    }
  }

  async saveFileHistory(filePath: string, history: FileHistory) {
    // const webcontainer = await this.#webcontainer;
    const historyPath = this.#getHistoryPath(filePath);

    await this.#runFileAction({
      type: 'file',
      filePath: historyPath,
      content: JSON.stringify(history),
      changeSource: 'auto-save',
    } as any);
  }

  #getHistoryPath(filePath: string) {
    return nodePath.join('.history', filePath);
  }

  async #runBuildAction(action: ActionState) {
    if (action.type !== 'build') {
      unreachable('Expected build action');
    }

    // Trigger build started alert
    this.onDeployAlert?.({
      type: 'info',
      title: 'Building Application',
      description: 'Building your application...',
      stage: 'building',
      buildStatus: 'running',
      deployStatus: 'pending',
      source: 'netlify',
    });

    const webcontainer = await this.#webcontainer;

    // Create a new terminal specifically for the build
    const buildProcess = await webcontainer.spawn('npm', ['run', 'build']);

    let output = '';
    const outputPromise = buildProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          output += data;
        },
      }),
    );

    const exitCode = await buildProcess.exit;
    await outputPromise.catch(() => {
      // Ignore output piping errors; we still have whatever was captured
    });

    let buildDir = '';

    if (exitCode !== 0) {
      const buildResult = {
        path: buildDir,
        exitCode,
        output,
      };

      this.buildOutput = buildResult;

      // Trigger build failed alert
      this.onDeployAlert?.({
        type: 'error',
        title: 'Build Failed',
        description: 'Your application build failed',
        content: output || 'No build output available',
        stage: 'building',
        buildStatus: 'failed',
        deployStatus: 'pending',
        source: 'netlify',
      });

      throw new ActionCommandError('Build Failed', output || 'No Output Available');
    }

    // Trigger build success alert
    this.onDeployAlert?.({
      type: 'success',
      title: 'Build Completed',
      description: 'Your application was built successfully',
      stage: 'deploying',
      buildStatus: 'complete',
      deployStatus: 'running',
      source: 'netlify',
    });

    // Check for common build directories
    const commonBuildDirs = ['dist', 'build', 'out', 'output', '.next', 'public'];

    // Try to find the first existing build directory
    for (const dir of commonBuildDirs) {
      const dirPath = nodePath.join(webcontainer.workdir, dir);

      try {
        await webcontainer.fs.readdir(dirPath);
        buildDir = dirPath;
        break;
      } catch {
        continue;
      }
    }

    // If no build directory was found, use the default (dist)
    if (!buildDir) {
      buildDir = nodePath.join(webcontainer.workdir, 'dist');
    }

    const buildResult = {
      path: buildDir,
      exitCode,
      output,
    };

    this.buildOutput = buildResult;

    return buildResult;
  }
  async handleSupabaseAction(action: SupabaseAction) {
    const { operation, content, filePath } = action;
    logger.debug('[Supabase Action]:', { operation, filePath, content });

    switch (operation) {
      case 'migration':
        if (!filePath) {
          throw new Error('Migration requires a filePath');
        }

        // Show alert for migration action
        this.onSupabaseAlert?.({
          type: 'info',
          title: 'Supabase Migration',
          description: `Create migration file: ${filePath}`,
          content,
          source: 'supabase',
        });

        // Only create the migration file
        await this.#runFileAction({
          type: 'file',
          filePath,
          content,
          changeSource: 'supabase',
        } as any);
        return { success: true };

      case 'query': {
        // Always show the alert and let the SupabaseAlert component handle connection state
        this.onSupabaseAlert?.({
          type: 'info',
          title: 'Supabase Query',
          description: 'Execute database query',
          content,
          source: 'supabase',
        });

        // The actual execution will be triggered from SupabaseChatAlert
        return { pending: true };
      }

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }

  // Add this method declaration to the class
  handleDeployAction(
    stage: 'building' | 'deploying' | 'complete',
    status: ActionStatus,
    details?: {
      url?: string;
      error?: string;
      source?: 'netlify' | 'vercel' | 'github' | 'gitlab';
    },
  ): void {
    if (!this.onDeployAlert) {
      logger.debug('No deploy alert handler registered');
      return;
    }

    const alertType = status === 'failed' ? 'error' : status === 'complete' ? 'success' : 'info';

    const title =
      stage === 'building'
        ? 'Building Application'
        : stage === 'deploying'
          ? 'Deploying Application'
          : 'Deployment Complete';

    const description =
      status === 'failed'
        ? `${stage === 'building' ? 'Build' : 'Deployment'} failed`
        : status === 'running'
          ? `${stage === 'building' ? 'Building' : 'Deploying'} your application...`
          : status === 'complete'
            ? `${stage === 'building' ? 'Build' : 'Deployment'} completed successfully`
            : `Preparing to ${stage === 'building' ? 'build' : 'deploy'} your application`;

    const buildStatus =
      stage === 'building' ? status : stage === 'deploying' || stage === 'complete' ? 'complete' : 'pending';

    const deployStatus = stage === 'building' ? 'pending' : status;

    // ActionStatus includes 'aborted' but DeployAlert.buildStatus/deployStatus
    // only accept 'pending' | 'running' | 'complete' | 'failed'. Clamp first so
    // strict-switch consumers don't silently fall through on 'aborted'.
    const clampToDeploy = (s: typeof status): 'pending' | 'running' | 'complete' | 'failed' =>
      s === 'aborted' ? 'failed' : s;

    this.onDeployAlert({
      type: alertType,
      title,
      description,
      content: details?.error || '',
      url: details?.url,
      stage,
      buildStatus: clampToDeploy(buildStatus),
      deployStatus: clampToDeploy(deployStatus),
      source: details?.source || 'netlify',
    });
  }

  async #validateShellCommand(command: string): Promise<{
    shouldModify: boolean;
    modifiedCommand?: string;
    warning?: string;
  }> {
    const trimmedCommand = command.trim();

    // Handle rm commands that might fail due to missing files
    if (trimmedCommand.startsWith('rm ') && !trimmedCommand.includes(' -f')) {
      const rmMatch = trimmedCommand.match(/^rm\s+(.+)$/);

      if (rmMatch) {
        const filePaths = rmMatch[1].split(/\s+/);

        // Check if any of the files exist using WebContainer
        try {
          const webcontainer = await this.#webcontainer;
          const existingFiles = [];

          for (const filePath of filePaths) {
            if (filePath.startsWith('-')) {
              continue;
            } // Skip flags

            try {
              await webcontainer.fs.readFile(filePath);
              existingFiles.push(filePath);
            } catch {
              // File doesn't exist, skip it
            }
          }

          if (existingFiles.length === 0) {
            // No files exist, modify command to use -f flag to avoid error
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: 'Added -f flag to rm command as target files do not exist',
            };
          } else if (existingFiles.length < filePaths.length) {
            // Some files don't exist, modify to only remove existing ones with -f for safety
            return {
              shouldModify: true,
              modifiedCommand: `rm -f ${filePaths.join(' ')}`,
              warning: 'Added -f flag to rm command as some target files do not exist',
            };
          }
        } catch (error) {
          logger.debug('Could not validate rm command files:', error);
        }
      }
    }

    // Handle cd commands to non-existent directories
    if (trimmedCommand.startsWith('cd ')) {
      const cdMatch = trimmedCommand.match(/^cd\s+(.+)$/);

      if (cdMatch) {
        const targetDir = cdMatch[1].trim();

        try {
          const webcontainer = await this.#webcontainer;
          await webcontainer.fs.readdir(targetDir);
        } catch {
          return {
            shouldModify: true,
            modifiedCommand: `mkdir -p ${targetDir} && cd ${targetDir}`,
            warning: 'Directory does not exist, created it first',
          };
        }
      }
    }

    // Handle cp/mv commands with missing source files
    if (trimmedCommand.match(/^(cp|mv)\s+/)) {
      const parts = trimmedCommand.split(/\s+/);

      if (parts.length >= 3) {
        const sourceFile = parts[1];

        try {
          const webcontainer = await this.#webcontainer;
          await webcontainer.fs.readFile(sourceFile);
        } catch {
          return {
            shouldModify: false,
            warning: `Source file '${sourceFile}' does not exist`,
          };
        }
      }
    }

    return { shouldModify: false };
  }

  #createEnhancedShellError(
    command: string,
    exitCode: number | undefined,
    output: string | undefined,
  ): {
    title: string;
    details: string;
  } {
    const trimmedCommand = command.trim();
    const firstWord = trimmedCommand.split(/\s+/)[0];

    // Common error patterns and their explanations
    const errorPatterns = [
      {
        pattern: /cannot remove.*No such file or directory/,
        title: 'File Not Found',
        getMessage: () => {
          const fileMatch = output?.match(/'([^']+)'/);
          const fileName = fileMatch ? fileMatch[1] : 'file';

          return `The file '${fileName}' does not exist and cannot be removed.\n\nSuggestion: Use 'ls' to check what files exist, or use 'rm -f' to ignore missing files.`;
        },
      },
      {
        pattern: /No such file or directory/,
        title: 'File or Directory Not Found',
        getMessage: () => {
          if (trimmedCommand.startsWith('cd ')) {
            const dirMatch = trimmedCommand.match(/cd\s+(.+)/);
            const dirName = dirMatch ? dirMatch[1] : 'directory';

            return `The directory '${dirName}' does not exist.\n\nSuggestion: Use 'mkdir -p ${dirName}' to create it first, or check available directories with 'ls'.`;
          }

          return `The specified file or directory does not exist.\n\nSuggestion: Check the path and use 'ls' to see available files.`;
        },
      },
      {
        pattern: /Permission denied/,
        title: 'Permission Denied',
        getMessage: () =>
          `Permission denied for '${firstWord}'.\n\nSuggestion: The file may not be executable. Try 'chmod +x filename' first.`,
      },
      {
        pattern: /command not found/,
        title: 'Command Not Found',
        getMessage: () =>
          `The command '${firstWord}' is not available in WebContainer.\n\nSuggestion: Check available commands or use a package manager to install it.`,
      },
      {
        pattern: /Is a directory/,
        title: 'Target is a Directory',
        getMessage: () =>
          `Cannot perform this operation - target is a directory.\n\nSuggestion: Use 'ls' to list directory contents or add appropriate flags.`,
      },
      {
        pattern: /File exists/,
        title: 'File Already Exists',
        getMessage: () => `File already exists.\n\nSuggestion: Use a different name or add '-f' flag to overwrite.`,
      },
    ];

    // Try to match known error patterns
    for (const errorPattern of errorPatterns) {
      if (output && errorPattern.pattern.test(output)) {
        return {
          title: errorPattern.title,
          details: errorPattern.getMessage(),
        };
      }
    }

    // Generic error with suggestions based on command type
    let suggestion = '';

    if (trimmedCommand.startsWith('npm ')) {
      suggestion = '\n\nSuggestion: Try running "npm install" first or check package.json.';
    } else if (trimmedCommand.startsWith('git ')) {
      suggestion = "\n\nSuggestion: Check if you're in a git repository or if remote is configured.";
    } else if (trimmedCommand.match(/^(ls|cat|rm|cp|mv)/)) {
      suggestion = '\n\nSuggestion: Check file paths and use "ls" to see available files.';
    }

    return {
      title: `Command Failed (exit code: ${exitCode})`,
      details: `Command: ${trimmedCommand}\n\nOutput: ${output || 'No output available'}${suggestion}`,
    };
  }

  /**
   * Check if a command is eligible for auto-fix retry.
   * Matches build, install, dev server, and test commands.
   */
  #isAutoFixEligible(command: string): boolean {
    const trimmed = command.trim().toLowerCase();
    const eligiblePatterns = [
      // Build commands
      /^npm\s+run\s+(build|compile|tsc|check|lint)/,
      /^npx\s+(tsc|vite\s+build|next\s+build|esbuild|webpack|rollup)/,
      /^(pnpm|yarn|bun)\s+run\s+(build|compile|tsc|check)/,
      /^(pnpm|yarn|bun)\s+(build|tsc)/,
      /^tsc(\s|$)/,
      /^vite\s+build/,
      /^next\s+build/,
      // Install commands
      /^npm\s+install/,
      /^npm\s+i(\s|$)/,
      /^pnpm\s+install/,
      /^(pnpm|yarn|bun)\s+i(\s|$)/,
      // Dev server commands — enables start→crash→fix loop
      /^npm\s+run\s+(dev|start|serve|preview)/,
      /^npm\s+start(\s|$)/,
      /^npx\s+(vite|next\s+dev|next\s+start|serve|servor)/,
      /^(pnpm|yarn|bun)\s+run\s+(dev|start|serve)/,
      /^(pnpm|yarn|bun)\s+(dev|start)(\s|$)/,
      /^vite(\s|$)/,
      /^next\s+dev/,
      /^node\s+/,
      // Test runner commands — enables generate→test→fix loop
      /^npx\s+(vitest|jest)/,
      /^(npm|pnpm|yarn|bun)\s+run\s+test/,
      /^(npm|pnpm|yarn|bun)\s+test(\s|$)/,
      /^vitest(\s|$)/,
    ];
    return eligiblePatterns.some(p => p.test(trimmed));
  }

  /**
   * Handle preview/iframe errors (React crashes, 404s, runtime errors).
   * Called from the preview iframe's error capture mechanism.
   */
  handlePreviewError(error: { message: string; stack?: string; source?: string }) {
    const errorContent = error.stack
      ? `${error.message}\n\nStack:\n${error.stack}`
      : error.message;

    if (this.onAutoFix) {
      const attemptKey = `preview-${error.message.slice(0, 50)}`;
      const currentAttempt = this.#getAttempt(attemptKey) + 1;
      this.#setAttempt(attemptKey, currentAttempt);

      if (currentAttempt <= this.#MAX_AUTO_FIX_ATTEMPTS) {
        logger.info(`[AutoFix:Preview] Attempt ${currentAttempt}/${this.#MAX_AUTO_FIX_ATTEMPTS}`);
        this.onAutoFix({
          command: error.source || 'preview',
          error: errorContent,
          source: 'preview',
          attempt: currentAttempt,
          maxAttempts: this.#MAX_AUTO_FIX_ATTEMPTS,
        });
        return;
      }

      this.#deleteAttempt(attemptKey);
    }

    // Fall through to manual alert
    this.onAlert?.({
      type: 'error',
      title: 'Preview Error',
      description: error.message,
      content: errorContent,
      source: 'preview',
    });
  }
}
