import type { Cache, CacheSnapshot } from '@server/lib/cache';
import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import { appDataPath } from '@server/utils/appDataVolume';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Provider metadata caches (TMDB, Open Library, ...) live in memory, so every
 * restart or update made the next visitor wait while each list and title was
 * fetched again. Caches marked `persist` are saved to the config folder and
 * restored at startup. Only public provider responses are saved, keyed by the
 * same digests the in-memory cache uses (never request credentials).
 */
const SNAPSHOT_DIRECTORY = 'cache';
const SNAPSHOT_PREFIX = 'provider-cache-';
// A cache is bounded to 64 MiB in memory; refuse anything unreasonable on disk.
const MAX_SNAPSHOT_FILE_BYTES = 128 * 1024 * 1024;
export const CACHE_SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;

const persistedCaches = (): Cache[] =>
  Object.values(cacheManager.getAllCaches()).filter((cache) => cache.persist);

const snapshotFile = (directory: string, cache: Cache): string =>
  path.join(directory, `${SNAPSHOT_PREFIX}${cache.id}.json`);

export const defaultCacheSnapshotDirectory = (): string =>
  path.join(appDataPath(), SNAPSHOT_DIRECTORY);

export const saveCacheSnapshots = async (
  directory = defaultCacheSnapshotDirectory(),
  caches: Cache[] = persistedCaches()
): Promise<number> => {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let saved = 0;
  for (const cache of caches) {
    const file = snapshotFile(directory, cache);
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      const snapshot = cache.snapshot();
      if (snapshot.entries.length === 0) {
        await rm(file, { force: true });
        continue;
      }
      await writeFile(temporary, JSON.stringify(snapshot), { mode: 0o600 });
      await rename(temporary, file);
      saved += snapshot.entries.length;
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      logger.warn('Unable to save a provider cache snapshot', {
        label: 'Cache',
        cache: cache.id,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return saved;
};

export const restoreCacheSnapshots = async (
  directory = defaultCacheSnapshotDirectory(),
  caches: Cache[] = persistedCaches()
): Promise<number> => {
  let restored = 0;
  for (const cache of caches) {
    const file = snapshotFile(directory, cache);
    try {
      const info = await stat(file);
      if (!info.isFile() || info.size > MAX_SNAPSHOT_FILE_BYTES) continue;
      const snapshot = JSON.parse(
        await readFile(file, 'utf8')
      ) as CacheSnapshot;
      restored += cache.restore(snapshot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') continue;
      logger.warn('Ignoring an unreadable provider cache snapshot', {
        label: 'Cache',
        cache: cache.id,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return restored;
};

/** Save periodically so a crash or forced stop loses at most one interval. */
export const startCacheSnapshots = (
  directory = defaultCacheSnapshotDirectory()
): (() => void) => {
  let running: Promise<unknown> | undefined;
  const timer = setInterval(() => {
    if (running) return;
    running = saveCacheSnapshots(directory).finally(() => {
      running = undefined;
    });
  }, CACHE_SNAPSHOT_INTERVAL_MS);
  timer.unref();
  return () => clearInterval(timer);
};
