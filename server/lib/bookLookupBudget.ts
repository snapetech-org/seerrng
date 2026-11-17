import { AsyncLocalStorage } from 'node:async_hooks';

export const BOOK_LOOKUP_BUDGET_MS = 25_000;

/**
 * The shared lookup deadline ran out. The metadata provider was slow, not
 * wrong, so callers retry soon instead of treating the request as failed.
 */
export class BookLookupTimeoutError extends Error {
  constructor() {
    super('Book metadata lookup timed out. Please retry.');
    this.name = 'BookLookupTimeoutError';
  }
}

/** True when the error, or any error in its cause chain, is a lookup timeout. */
export const isBookLookupTimeout = (error: unknown): boolean => {
  let current = error;
  const seen = new Set<unknown>();
  for (
    let depth = 0;
    current != null && depth < 8 && !seen.has(current);
    depth++
  ) {
    seen.add(current);
    if (
      current instanceof BookLookupTimeoutError ||
      (current instanceof Error && current.name === 'BookLookupTimeoutError')
    ) {
      return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
};
const budget = new AsyncLocalStorage<{
  deadline: number;
  signal: AbortSignal;
}>();

export const getBookLookupBudget = () => budget.getStore();

/** One deadline includes provider detection, fallback terms and edition reads. */
export const withBookLookupBudget = async <T>(
  operation: () => Promise<T>,
  timeoutMs = BOOK_LOOKUP_BUDGET_MS
): Promise<T> => {
  if (budget.getStore()) return operation();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new BookLookupTimeoutError()),
    timeoutMs
  );
  timer.unref();
  try {
    return await budget.run(
      { deadline: Date.now() + timeoutMs, signal: controller.signal },
      async () => {
        const result = await operation();
        controller.signal.throwIfAborted();
        return result;
      }
    );
  } finally {
    clearTimeout(timer);
  }
};
