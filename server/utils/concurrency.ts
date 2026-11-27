export const mapWithConcurrency = async <Input, Output>(
  items: readonly Input[],
  concurrency: number,
  mapper: (item: Input, index: number) => Promise<Output>
): Promise<Output[]> => {
  if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
    throw new Error('Concurrency must be a positive integer.');
  }

  const results = new Array<Output>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
};

export const settlePromisesWithin = async <Result>(
  promises: readonly Promise<Result>[],
  timeoutMs: number,
  /**
   * Once the promises at `primary` have settled, wait at most `graceMs` more
   * for the rest (still bounded by `timeoutMs`).
   */
  {
    primary = [],
    graceMs,
  }: { primary?: readonly number[]; graceMs?: number } = {}
): Promise<{
  results: PromiseSettledResult<Result>[];
  timedOut: boolean;
}> => {
  const completed = new Map<number, PromiseSettledResult<Result>>();
  const trackedPromises = promises.map((promise, index) =>
    promise.then(
      (value) => {
        completed.set(index, { status: 'fulfilled', value });
      },
      (reason: unknown) => {
        completed.set(index, { status: 'rejected', reason });
      }
    )
  );

  let timedOut = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timeoutHandle = setTimeout(() => {
      timedOut = true;
      resolve();
    }, timeoutMs);
  });

  let graceHandle: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  const primaryPromises = primary
    .filter((index) => index >= 0 && index < trackedPromises.length)
    .map((index) => trackedPromises[index]);
  const grace =
    graceMs !== undefined && primaryPromises.length > 0
      ? Promise.all(primaryPromises).then(
          () =>
            new Promise<void>((resolve) => {
              // everything may have settled already: no timer to leave behind
              if (settled) return resolve();
              graceHandle = setTimeout(() => {
                timedOut = completed.size < promises.length;
                resolve();
              }, graceMs);
            })
        )
      : new Promise<void>(() => undefined);

  try {
    await Promise.race([Promise.all(trackedPromises), timeout, grace]);
  } finally {
    settled = true;
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    if (graceHandle) {
      clearTimeout(graceHandle);
    }
  }

  return {
    results: [...completed.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, result]) => result),
    timedOut,
  };
};

export class BoundedTaskQueueFullError extends Error {
  constructor() {
    super('Task queue capacity has been reached.');
    this.name = 'BoundedTaskQueueFullError';
  }
}

export class BoundedTaskQueue {
  private active = 0;
  private readonly queued: (() => void)[] = [];
  private readonly idleWaiters = new Set<() => void>();

  public constructor(
    private readonly concurrency: number,
    private readonly maxQueued: number
  ) {
    if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
      throw new Error('Task queue concurrency must be a positive integer.');
    }
    if (!Number.isSafeInteger(maxQueued) || maxQueued < 0) {
      throw new Error('Task queue capacity must be a non-negative integer.');
    }
  }

  public run<Result>(task: () => Promise<Result>): Promise<Result> {
    if (
      this.active >= this.concurrency &&
      this.queued.length >= this.maxQueued
    ) {
      return Promise.reject(new BoundedTaskQueueFullError());
    }

    return new Promise<Result>((resolve, reject) => {
      const start = (): void => {
        this.active += 1;
        void Promise.resolve()
          .then(task)
          .then(
            (result) => {
              this.finish();
              resolve(result);
            },
            (error) => {
              this.finish();
              reject(error);
            }
          );
      };

      if (this.active < this.concurrency) {
        start();
      } else {
        this.queued.push(start);
      }
    });
  }

  public waitForIdle(): Promise<void> {
    if (this.active === 0 && this.queued.length === 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.idleWaiters.add(resolve);
    });
  }

  private finish(): void {
    this.active -= 1;
    this.queued.shift()?.();
    if (this.active === 0 && this.queued.length === 0) {
      for (const resolve of this.idleWaiters) {
        resolve();
      }
      this.idleWaiters.clear();
    }
  }
}
