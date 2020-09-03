import {
  Disposable,
  Event,
  EventEmitter,
  Pseudoterminal,
  TerminalDimensions,
  env,
  window,
} from "vscode";

/**
 * Usage:
 *
 * 1. Create and configure the `ChildProcess`.
 *
 * 2. Create and configure the `TerminalProcessManager`. Register handlers.
 *
 * 3. Run `TerminalProcessManager.register()`.
 *
 *    - -> This may already cause `onWasCloseRequested`
 *      and `onDidDispose` to be emitted.
 *
 * 4. Give the `TerminalProcessManager` to `window.createTerminal`.
 *
 *    - -> It will call `open()` and afterwards receive all the buffered
 *      input and close events, if any.
 */
export class TerminalProcessManager implements Pseudoterminal, Disposable {
  public get onDidWrite(): Event<string> {
    return this.didWrite.event;
  }
  public get onDidClose(): Event<number | void> {
    return this.didClose.event;
  }
  public handleInput(data: string): Promise<void> {
    if (!this.terminating) {
      this.ptyProcess?.write(data);
    }
    return Promise.resolve();
  }
  public open(): void {
    if (this.disposing) {
      return;
    }
    if (this.preOpenBuffer !== null) {
      for (const data of this.preOpenBuffer) {
        this.didWrite.fire(data);
      }
    }
    this.preOpenBuffer = null;
    if (this.closeResult !== null) {
      this.emitDidCloseInner(this.closeResult);
    }
  }
  /**
   * This only requests close.
   * Invoke `terminate` to stop the child process.
   */
  public close(): void {
    this.wasCloseRequested.fire();
  }
  public setDimensions(dimensions: TerminalDimensions): void {
    this.dimensions = dimensions;
    if (this.ptyProcess !== undefined) {
      this.ptyProcess.resize(dimensions.columns, dimensions.rows);
    }
  }
  /**
   * May cause an error when node-pty cannot be imported.
   */
  public start(): void {
    if (this.ptyProcess !== undefined || this.terminating) {
      return;
    }
    const options =
      this.dimensions === undefined
        ? this.ptyOptions
        : {
            ...this.ptyOptions,
            cols: this.dimensions.columns,
            rows: this.dimensions.rows,
          };
    this.ptyProcess = this.nodePty.spawn(
      this.executablePath,
      this.arguments_,
      options
    );
    this.disposables.push(
      this.ptyProcess.onData((chunk: string) => {
        this.write(chunk);
      }),
      this.ptyProcess.onExit(({ exitCode, signal }) => {
        this.write(
          this.deco(
            `exited with code ${exitCode}` +
              (signal !== undefined ? ` by signal ${signal}` : "")
          )
        );
        this.emitDidTerminate(exitCode);
        this.ptyProcess = undefined;
      })
    );
  }
  public get onWasCloseRequested(): Event<void> {
    return this.wasCloseRequested.event;
  }
  public get onDidTerminate(): Event<number | undefined> {
    return this.didTerminate.event;
  }
  public startTermination(): void {
    if (this.terminating || this.ptyProcess === undefined) {
      return;
    }
    this.terminating = true;
    this.ptyProcess.kill();
  }
  /**
   * You immediately won’t receive any events when this has started.
   */
  public dispose(): void {
    if (this.disposing) {
      return;
    }
    this.disposing = true;
    this.startTermination();
    for (const disposable of [
      this.didClose,
      this.didTerminate,
      this.didWrite,
      this.wasCloseRequested,
      ...this.disposables,
    ]) {
      disposable.dispose();
    }
  }
  public get isRunning(): boolean {
    return this.ptyProcess !== undefined;
  }
  public constructor(
    private readonly nodePty: typeof import("node-pty"),
    public readonly executablePath: string,
    public readonly arguments_: string[] = [],
    public readonly ptyOptions: import("node-pty").IBasePtyForkOptions = {},
    public readonly revealExitCodeToTerminal = true
  ) {}
  private ptyProcess: import("node-pty").IPty | undefined;
  private dimensions: TerminalDimensions | undefined;
  private readonly didClose = new EventEmitter<number | void>();
  private readonly didTerminate = new EventEmitter<number | undefined>();
  private readonly didWrite = new EventEmitter<string>();
  private readonly wasCloseRequested = new EventEmitter<void>();
  private disposables: Disposable[] = [];
  private terminating = false;
  private disposing = false;
  private closeResult: number | undefined | null = null;
  private preOpenBuffer: string[] | null = [];

  private write(data: string): void {
    if (this.preOpenBuffer !== null) {
      this.preOpenBuffer.push(this.toCRLF(data));
    } else {
      this.didWrite.fire(this.toCRLF(data));
    }
  }
  private emitDidTerminate(codeOnTermination: undefined | number) {
    if (!this.disposing) {
      const emittedCode =
        codeOnTermination !== undefined
          ? codeOnTermination
          : this.closeResult !== null
          ? this.closeResult
          : undefined;
      this.emitDidCloseIfOpen(emittedCode);
      this.didTerminate.fire(emittedCode);
    }
  }
  private emitDidCloseIfOpen(code: undefined | number) {
    if (this.closeResult !== null) {
      return;
    }
    this.closeResult = code;
    if (this.preOpenBuffer === null && !this.disposing) {
      this.emitDidCloseInner(code);
    }
  }
  private emitDidCloseInner(code: undefined | number) {
    this.didClose.fire(this.revealExitCodeToTerminal ? code : undefined);
  }
  private deco(text: string): string {
    return `[[ ${text} ]]`;
  }
  private static readonly eOLRE = /(\r\n|\r|\n)/g;
  private toCRLF(text: string): string {
    return text.replace(TerminalProcessManager.eOLRE, "\r\n");
  }
}

// https://github.com/microsoft/vscode/issues/84439#issuecomment-552328194
export function getCoreNodeModule(
  moduleName: string
): { module?: unknown; errors: Error[] } {
  const errors: Error[] = [];
  try {
    return {
      module: require(`${env.appRoot}/node_modules.asar/${moduleName}`),
      errors,
    };
  } catch (error) {
    errors.push(error);
  }

  try {
    return {
      module: require(`${env.appRoot}/node_modules/${moduleName}`),
      errors,
    };
  } catch (error) {
    errors.push(error);
  }

  return { errors };
}

/**
 * Returns a node module installed with VSCode, or undefined if it fails.
 */
export function getCoreNodeModuleInteractively(moduleName: string): unknown {
  const result = getCoreNodeModule(moduleName);
  if (!result.module) {
    const errorString = result.errors
      .map((error) => `\n• ${error.name}: ${error.message}`)
      .join("");
    void window.showErrorMessage(
      `Could not import ${moduleName}.${errorString}`
    );
    return undefined;
  }
  return result.module;
}

export function displayProcessExitInteractively(
  processName: string,
  exitCode: number | undefined
): void {
  if (exitCode === undefined) {
    void window.showWarningMessage(
      `${processName} exited with unknown exit code.`
    );
  } else if (exitCode === 0) {
    void window.setStatusBarMessage(`${processName} succeeded.`, 5000);
  } else {
    void window.showErrorMessage(
      `${processName} failed with exit code ${exitCode}.`
    );
  }
}
