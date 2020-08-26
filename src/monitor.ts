/**
 * FIFO-1-Semaphore
 */
export class Monitor {
  public async enter() {
    const prevLastIndex = this.pendingOperations.length - 1;
    const thisOperation: PendingOperation = {};
    thisOperation.promise = new Promise((r) => {
      thisOperation.resolver = r;
    });
    this.pendingOperations.push(thisOperation);
    if (prevLastIndex >= 0) {
      await this.pendingOperations[prevLastIndex].promise;
    }
  }

  public async leave() {
    const thisOperation = this.pendingOperations[0];
    this.pendingOperations.splice(0, 1);
    while (thisOperation.resolver === undefined) {
      await new Promise((r) => setTimeout(r, 0));
    }
    thisOperation.resolver();
  }

  public get inUse() {
    return this.pendingOperations.length > 0;
  }

  public get someoneIsWaiting(): boolean {
    return this.pendingOperations.length > 1;
  }

  private readonly pendingOperations: PendingOperation[] = [];
}

interface PendingOperation {
  promise?: Promise<void>,
  resolver?: () => void,
}
