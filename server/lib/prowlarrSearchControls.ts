import type { ProwlarrReleaseGrabRequest } from '@server/api/prowlarr';
import type { MediaCategoryKey } from '@server/constants/mediaCategories';
import type { User } from '@server/entity/User';
import { getSettings } from '@server/lib/settings';
import { randomUUID } from 'node:crypto';

const SEARCH_WINDOW_MS = 60_000;
const MAX_SEARCH_KEYS = 20_000;
const GRAB_HANDLE_TTL_MS = 10 * 60_000;
const MAX_GRAB_HANDLES = 2_000;

interface SearchWindow {
  timestamps: number[];
  lastSeen: number;
}

interface GrabHandle {
  userId: number;
  category: MediaCategoryKey;
  release: ProwlarrReleaseGrabRequest;
  expiresAt: number;
}

const perIndexerSearchWindows = new Map<string, SearchWindow>();
const grabHandles = new Map<string, GrabHandle>();

export const isIndexerDetailsVisible = (user?: User): boolean =>
  getSettings().prowlarr.showIndexerDetails === true &&
  user?.settings?.showIndexerDetails !== false;

/** Reserves one search per selected Prowlarr indexer for the current user. */
export const reserveProwlarrIndexerSearches = (
  userId: number,
  indexerIds: readonly number[],
  perIndexerLimits: Record<number, number> | undefined,
  defaultLimit: number,
  now = Date.now()
): boolean => {
  const ids = [...new Set(indexerIds)];
  const cutoff = now - SEARCH_WINDOW_MS;
  const pending: { key: string; timestamps: number[] }[] = [];

  for (const indexerId of ids) {
    const key = `${userId}:${indexerId}`;
    const current = perIndexerSearchWindows.get(key);
    const timestamps = (current?.timestamps ?? []).filter(
      (timestamp) => timestamp > cutoff
    );
    const limit = perIndexerLimits?.[indexerId] ?? defaultLimit;
    if (timestamps.length >= limit) return false;
    pending.push({ key, timestamps });
  }

  if (
    pending.filter(({ key }) => !perIndexerSearchWindows.has(key)).length +
      perIndexerSearchWindows.size >
    MAX_SEARCH_KEYS
  ) {
    for (const [key, value] of perIndexerSearchWindows) {
      if (value.lastSeen <= cutoff) perIndexerSearchWindows.delete(key);
    }
    if (
      pending.filter(({ key }) => !perIndexerSearchWindows.has(key)).length +
        perIndexerSearchWindows.size >
      MAX_SEARCH_KEYS
    ) {
      return false;
    }
  }

  for (const { key, timestamps } of pending) {
    perIndexerSearchWindows.set(key, {
      timestamps: [...timestamps, now],
      lastSeen: now,
    });
  }
  return true;
};

const pruneGrabHandles = (now: number) => {
  for (const [id, handle] of grabHandles) {
    if (handle.expiresAt <= now) grabHandles.delete(id);
  }
  while (grabHandles.size >= MAX_GRAB_HANDLES) {
    const oldest = grabHandles.keys().next().value;
    if (!oldest) break;
    grabHandles.delete(oldest);
  }
};

export const createProwlarrGrabHandle = (
  userId: number,
  category: MediaCategoryKey,
  release: ProwlarrReleaseGrabRequest,
  now = Date.now()
): string => {
  pruneGrabHandles(now);
  const id = randomUUID();
  grabHandles.set(id, {
    userId,
    category,
    release,
    expiresAt: now + GRAB_HANDLE_TTL_MS,
  });
  return id;
};

export const consumeProwlarrGrabHandle = (
  id: string,
  userId: number,
  now = Date.now()
): GrabHandle | undefined => {
  const handle = grabHandles.get(id);
  if (!handle) return undefined;
  if (handle.expiresAt <= now) {
    grabHandles.delete(id);
    return undefined;
  }
  if (handle.userId !== userId) return undefined;
  grabHandles.delete(id);
  return handle;
};

export const clearProwlarrSearchControlsForTests = () => {
  perIndexerSearchWindows.clear();
  grabHandles.clear();
};
