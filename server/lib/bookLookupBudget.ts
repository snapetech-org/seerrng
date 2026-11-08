import { AsyncLocalStorage } from 'node:async_hooks';

export const BOOK_LOOKUP_BUDGET_MS = 25_000;
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
    () =>
      controller.abort(
        new Error('Book metadata lookup timed out. Please retry.')
      ),
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
