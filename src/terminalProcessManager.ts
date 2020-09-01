import * as cp from "child_process";
import { Disposable, Event, EventEmitter, Pseudoterminal } from "vscode";
import { Monitor } from "./monitor";

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
    if (!this.terminating) {
      this.processInputBuffer.push(this.userInputToApplicationInput(data));
      await this.flushProcessInputBuffer();
    }
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
  public register(): void {
    this.childProcess.on("close", (code, signal) => {
      this.writeStatusAndTerminate(`closed with ${code} on signal ${signal}`);
      this.emitDidCloseIfOpen(code === null ? undefined : code);
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
      this.emitDidCloseIfOpen(code === null ? undefined : code);
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
      this.writeStatusAndTerminate(this.deco("stdout closed"));
    });
    this.registerStderrListener("close", () => {
      this.writeStatusAndTerminate(this.deco("stderr closed"));
    });
    this.registerStdinListener("close", () => {
      this.writeStatusAndTerminate(this.deco("stdin closed"));
    });
    this.registerStdoutListener("end", () => {
      this.writeStatusAndTerminate(this.deco("stdout ended"));
    });
    this.registerStderrListener("end", () => {
      this.writeStatusAndTerminate(this.deco("stderr ended"));
    });
    this.registerStdinListener("end", () => {
      this.writeStatusAndTerminate(this.deco("stdin ended"));
    });
    this.registerStdoutListener("error", (error) =>
      this.write(this.deco(`error on stdout: ${error.name}, ${error.message}`))
    );
    this.registerStderrListener("error", (error) =>
      this.write(this.deco(`error on stderr: ${error.name}, ${error.message}`))
    );
    this.registerStdinListener("error", (error) =>
      this.write(this.deco(`error on stdin: ${error.name}, ${error.message}`))
    );
    this.registerStdoutListener("pause", () => {
      this.stdoutWasPaused = true;
      this.write(this.deco("pause"));
    });
    this.registerStderrListener("pause", () => {
      this.stderrWasPaused = true;
      this.write(this.deco("pause"));
    });
    this.registerStdoutListener("resume", () => {
      if (this.stdoutWasPaused) {
        this.write(this.deco("resume"));
      }
    });
    this.registerStderrListener("resume", () => {
      if (this.stderrWasPaused) {
        this.write(this.deco("resume"));
      }
    });
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
    this.childProcess.stdin?.removeAllListeners();
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
    public readonly revealExitCodeToTerminal = true,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.registerStdinListener = (key: any, listener: any): any => {
      this.childProcess.stdin?.on(key, listener);
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
  private readonly registerStdinListener: Exclude<
    cp.ChildProcess["stdin"],
    null
  >["on"];
  private terminating = false;
  private disposing = false;
  private _isRunning = true;
  private closeResult: number | undefined | null = null;
  private preOpenBuffer: string[] | null = [];
  private processInputBuffer: string[] = [];
  private stdoutWasPaused = false;
  private stderrWasPaused = false;
  private writeMonitor = new Monitor();

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
    await this.writeMonitor.enter();
    try {
      // eslint-disable-next-line no-constant-condition
      while (this.processInputBuffer.length > 0) {
        const data = this.processInputBuffer.shift();
        if (data === undefined) {
          return;
        }
        if (
          this.childProcess.stdin?.writable !== true ||
          this.childProcess.stdin.destroyed
        ) {
          this.write(this.deco("error: stdin not writable"));
          return;
        }
        let callbackPromise: Promise<void> | undefined;
        // eslint-disable-next-line promise/param-names
        await new Promise<void>((resolveDrain) => {
          // eslint-disable-next-line promise/param-names
          callbackPromise = new Promise<void>((resolveCallback) => {
            if (this.childProcess.stdin === null) {
              resolveCallback();
              resolveDrain();
              return;
            }
            const writeResult = this.childProcess.stdin.write(
              data,
              "utf-8",
              (error) => {
                if (error) {
                  this.write(this.deco("error writing on stdin"));
                }
                resolveCallback();
              }
            );
            if (!writeResult) {
              this.childProcess.stdin.once("drain", resolveDrain);
            }
          });
        });
        await callbackPromise;
      }
    } finally {
      await this.writeMonitor.leave();
    }
  }
  private emitDidTerminate(codeOnTermination: undefined | number) {
    this._isRunning = false;
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
  private static readonly carriageReturnRE = /\r/g;
  private userInputToApplicationInput(userInput: string): string {
    return userInput.replace(TerminalProcessManager.carriageReturnRE, "\n");
  }
}
