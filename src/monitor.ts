/**
 * FIFO-1-Semaphore
 */
export class Monitor {
  public async enter(): Promise<void> {
    const previousLastIndex = this.pendingOperations.length - 1;
    const thisOperation: PendingOperation = {};
    thisOperation.promise = new Promise((resolve) => {
      thisOperation.resolver = resolve;
    });
    this.pendingOperations.push(thisOperation);
    if (previousLastIndex >= 0) {
      await this.pendingOperations[previousLastIndex].promise;
    }
  }

  public async leave(): Promise<void> {
    const thisOperation = this.pendingOperations[0];
    this.pendingOperations.splice(0, 1);
    while (thisOperation.resolver === undefined) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    thisOperation.resolver();
  }

  public get inUse(): boolean {
    return this.pendingOperations.length > 0;
  }

  public get someoneIsWaiting(): boolean {
    return this.pendingOperations.length > 1;
  }

  private readonly pendingOperations: PendingOperation[] = [];
}

interface PendingOperation {
  promise?: Promise<void>;
  resolver?: () => void;
}
