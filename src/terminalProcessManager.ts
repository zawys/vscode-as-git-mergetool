import * as cp from "child_process";
import { Disposable, Event, EventEmitter, Pseudoterminal } from "vscode";

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
  public async handleInput(data: string): Promise<void> {
    this.write(data);
    this.processInputBuffer.push(this.userInputToApplicationInput(data));
    await this.flushProcessInputBuffer();
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
      this.didClose.fire(this.closeResult);
    }
  }
  /**
   * This only requests close.
   * Invoke `terminate` to stop the child process.
   */
  public close(): void {
    this.wasCloseRequested.fire();
  }
  public register(): void {
    this.childProcess.on("close", (code, signal) => {
      this.writeStatusAndTerminate(`closed with ${code} on signal ${signal}`);
      this.emitDidClose(code === null ? undefined : code);
    });
    this.childProcess.on("disconnect", () => {
      this.writeStatusAndTerminate("disconnected");
    });
    this.childProcess.on("exit", (code, signal) => {
      this.writeStatusAndTerminate(
        "exited" +
          (code !== null
            ? ` with code ${code}`
            : signal !== null
            ? ` by signal ${signal}`
            : "")
      );
      this.emitDidClose(code === null ? undefined : code);
    });
    this.childProcess.on("error", (error) =>
      this.writeStatusAndTerminate(
        `error on process: ${error.name}, ${error.message}`
      )
    );
    this.childProcess.stdout?.setEncoding("utf-8");
    this.childProcess.stderr?.setEncoding("utf-8");
    this.registerCombinedListener("data", (chunk: unknown) => {
      if (typeof chunk === "string") {
        this.write(chunk);
      } else {
        console.error('typeof chunk !== "string"');
      }
    });
    this.registerStdoutListener("close", () => {
      this.write(this.deco("stdout closed"));
    });
    this.registerStderrListener("close", () => {
      this.write(this.deco("stderr closed"));
    });
    this.registerStdoutListener("end", () => {
      this.write(this.deco("stdout ended"));
    });
    this.registerStderrListener("end", () => {
      this.write(this.deco("stderr ended"));
    });
    this.registerStdoutListener("error", (error) =>
      this.write(this.deco(`error on stdout: ${error.name}, ${error.message}`))
    );
    this.registerStdoutListener("error", (error) =>
      this.write(this.deco(`error on stderr: ${error.name}, ${error.message}`))
    );
    this.registerCombinedListener("pause", () =>
      this.write(this.deco("pause"))
    );
    this.registerCombinedListener("resume", () =>
      this.write(this.deco("resume"))
    );
  }
  public get onWasCloseRequested(): Event<void> {
    return this.wasCloseRequested.event;
  }
  public get onDidTerminate(): Event<number | undefined> {
    return this.didTerminate.event;
  }
  public startTermination(): void {
    if (this.terminating) {
      return;
    }
    this.terminating = true;
    this.childProcess.stdout?.removeAllListeners();
    this.childProcess.stderr?.removeAllListeners();
    this.childProcess.removeAllListeners();
    // this.childProcess.disconnect(); // … is not a function
    this.childProcess.unref();
    if (this.childProcess.exitCode !== null) {
      this.emitDidTerminate(this.childProcess.exitCode);
      return;
    }
    this.childProcess.kill("SIGTERM");
    setTimeout(() => {
      if (this.childProcess.exitCode !== null) {
        this.emitDidTerminate(this.childProcess.exitCode);
        return;
      }
      setTimeout(() => {
        this.childProcess.kill("SIGKILL");
        this.emitDidTerminate(
          this.childProcess.exitCode !== null
            ? this.childProcess.exitCode
            : undefined
        );
      }, this.sigkillTimeoutMS);
    }, Math.max(0, this.sigtermTimeoutMS));
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
    ]) {
      disposable.dispose();
    }
  }
  public get isRunning(): boolean {
    return this._isRunning;
  }
  public constructor(
    public readonly childProcess: cp.ChildProcess,
    public sigtermTimeoutMS = 1000,
    public sigkillTimeoutMS = 1000
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.registerStdoutListener = (key: any, listener: any): any => {
      this.childProcess.stdout?.on(key, listener);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.registerStderrListener = (key: any, listener: any): any => {
      this.childProcess.stderr?.on(key, listener);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.registerCombinedListener = (key: any, listener: any): any => {
      this.childProcess.stdout?.on(key, listener);
      this.childProcess.stderr?.on(key, listener);
    };
  }
  private readonly didClose = new EventEmitter<number | void>();
  private readonly didTerminate = new EventEmitter<number | undefined>();
  private readonly didWrite = new EventEmitter<string>();
  private readonly wasCloseRequested = new EventEmitter<void>();
  private readonly registerStdoutListener: Exclude<
    cp.ChildProcess["stdout"],
    null
  >["on"];
  private readonly registerStderrListener: Exclude<
    cp.ChildProcess["stderr"],
    null
  >["on"];
  private readonly registerCombinedListener: Exclude<
    cp.ChildProcess["stdout"] & cp.ChildProcess["stderr"],
    null
  >["on"];
  private terminating = false;
  private disposing = false;
  private _isRunning = true;
  private closeResult: number | undefined | null = null;
  private preOpenBuffer: string[] | null = [];
  private processInputBuffer: string[] = [];

  private writeStatusAndTerminate(status: string) {
    this.write(this.deco(status));
    this.startTermination();
  }
  private write(data: string): void {
    if (this.preOpenBuffer !== null) {
      this.preOpenBuffer.push(this.toCRLF(data));
    } else {
      this.didWrite.fire(this.toCRLF(data));
    }
  }
  private async flushProcessInputBuffer(): Promise<void> {
    // eslint-disable-next-line no-constant-condition
    while (this.processInputBuffer.length > 0) {
      await new Promise((resolve) => {
        const data = this.processInputBuffer.shift();
        if (data === undefined) {
          return;
        }
        this.childProcess.stdin?.write(data, "utf-8", (error) => {
          if (error) {
            this.write(this.deco("error writing on stdin"));
          }
          resolve();
        });
      });
    }
  }
  private emitDidTerminate(code: undefined | number) {
    this._isRunning = false;
    if (!this.disposing) {
      this.emitDidClose(code);
      this.didTerminate.fire(code);
    }
  }
  private emitDidClose(code: undefined | number) {
    if (this.closeResult !== null) {
      return;
    }
    this.closeResult = code;
    if (this.preOpenBuffer === null && !this.disposing) {
      this.didClose.fire(code);
    }
  }
  private deco(text: string): string {
    return `[[ ${text} ]]`;
  }
  private static readonly eOLRE = /(\r\n|\r|\n)/g;
  private toCRLF(text: string): string {
    return text.replace(TerminalProcessManager.eOLRE, "\r\n");
  }
  private static readonly carriageReturnRE = /\r/g;
  private userInputToApplicationInput(userInput: string): string {
    return userInput.replace(TerminalProcessManager.carriageReturnRE, "\n");
  }
}
