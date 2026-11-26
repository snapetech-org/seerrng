import logger from '@server/logger';

/**
 * Short-lived answers for the music pages' Aurral (or Lidarr) reads.
 *
 * Aurral answers library and activity reads from one busy process: while it
 * downloads, a read that normally takes 50 ms can take 5-10 s or time out, and
 * every open music page polls them. Each read here is shared by every viewer
 * for `ttlMs`, only one call per key is in flight, and a recent copy answers
 * at once while a new one is read in the background. An older copy still
 * answers when the provider is slow (after `waitMs`) or failing, so a busy
 * Aurral never leaves the page waiting on a spinner or a 502.
 */
export interface MusicReadOptions {
  /** A copy younger than this is fresh: no provider call at all. */
  ttlMs: number;
  /** A copy younger than this answers at once while a new one is read. */
  revalidateMs: number;
  /** A copy younger than this answers when the provider is slow or failing. */
  maxStaleMs: number;
  /** How long to wait for the provider before answering from an old copy. */
  waitMs?: number;
  /** Whether an answer is kept (default: always). */
  store?: (value: unknown) => boolean;
}

interface Entry {
  value: unknown;
  at: number;
}

const DEFAULT_WAIT_MS = 2_000;

export const createMusicReadCache = (maxEntries: number) => {
  const entries = new Map<string, Entry>();
  // invalidate() drops a key's running read, so a read that started before a
  // change never stores its (older) answer
  const inFlight = new Map<string, Promise<unknown>>();

  const remember = (key: string, value: unknown) => {
    entries.delete(key);
    entries.set(key, { value, at: Date.now() });
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
  };

  const refresh = <T>(
    key: string,
    load: () => Promise<T>,
    store?: (value: unknown) => boolean
  ): Promise<T> => {
    const running = inFlight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const call: Promise<T> = Promise.resolve()
      .then(load)
      .then((value) => {
        if (inFlight.get(key) === call && (!store || store(value)))
          remember(key, value);
        return value;
      })
      .finally(() => {
        if (inFlight.get(key) === call) inFlight.delete(key);
      });
    inFlight.set(key, call);
    return call;
  };

  const read = async <T>(
    key: string,
    options: MusicReadOptions,
    load: () => Promise<T>
  ): Promise<T> => {
    const entry = entries.get(key);
    const age = entry ? Date.now() - entry.at : Infinity;
    if (entry && age < options.ttlMs) return entry.value as T;

    const fresh = refresh(key, load, options.store);
    if (!entry || age >= options.maxStaleMs) return fresh;

    // never leave a background refresh's failure unhandled
    fresh.catch((error: unknown) => {
      logger.debug('Music read failed; answering from an earlier copy', {
        label: 'Music API',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    });
    if (age < options.revalidateMs) return entry.value as T;

    let timer: NodeJS.Timeout | undefined;
    const waited = new Promise<undefined>((resolve) => {
      timer = setTimeout(
        () => resolve(undefined),
        options.waitMs ?? DEFAULT_WAIT_MS
      );
      timer.unref?.();
    });
    try {
      const result = await Promise.race([
        fresh.then((value) => ({ value })),
        waited,
      ]);
      return result ? result.value : (entry.value as T);
    } catch {
      return entry.value as T;
    } finally {
      clearTimeout(timer);
    }
  };

  /** Forget every copy whose key starts with one of these prefixes (all when none). */
  const invalidate = (...prefixes: string[]) => {
    const matches = (key: string) =>
      !prefixes.length || prefixes.some((prefix) => key.startsWith(prefix));
    for (const key of [...entries.keys()])
      if (matches(key)) entries.delete(key);
    // a read already running may predate the change: the next one starts anew
    for (const key of [...inFlight.keys()])
      if (matches(key)) inFlight.delete(key);
  };

  const reset = () => {
    entries.clear();
    inFlight.clear();
  };

  return { read, invalidate, reset };
};

// library pages, the overview and the activity queue
const reads = createMusicReadCache(300);
export const cachedMusicRead = reads.read;
export const invalidateMusicReads = reads.invalidate;

// library covers: up to 200 small images
const covers = createMusicReadCache(200);
export const cachedMusicCover = covers.read;

/** Test hook. */
export const resetMusicReadCache = () => {
  reads.reset();
  covers.reset();
};
