import {
  getSessionStorage,
  readStoredRecord,
  writeStoredRecord,
} from '@app/utils/localStorage';

export type DiscoverNavigationMediaType = 'movie' | 'tv';

export interface DiscoverNavigationItem {
  id: number;
  mediaType: DiscoverNavigationMediaType;
}

export interface DiscoverNavigationState {
  previous?: DiscoverNavigationItem;
  next?: DiscoverNavigationItem;
}

type DiscoverNavigationStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'
>;

type StoredDiscoverNavigationContext = {
  version: 1;
  items: DiscoverNavigationItem[];
  lastUsedAt: number;
};

export const DISCOVER_NAVIGATION_QUERY_PARAM = 'discoverContext';

const STORAGE_KEY_PREFIX = 'seerrng:discover-navigation:';
const MAX_CONTEXT_ITEMS = 5000;
const MAX_STORED_CONTEXTS = 12;
const CONTEXT_ID_PATTERN = /^[a-z0-9_-]{12,64}$/i;

let fallbackContextSequence = 0;

export const isDiscoverNavigationContextId = (
  value: unknown
): value is string =>
  typeof value === 'string' && CONTEXT_ID_PATTERN.test(value);

export const createDiscoverNavigationContextId = (): string | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    if (typeof window.crypto?.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
  } catch {
    // A random fallback is enough for this non-secret, tab-local storage key.
  }

  fallbackContextSequence += 1;
  return `discover_${Date.now().toString(36)}_${fallbackContextSequence.toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
};

const isNavigationItem = (value: unknown): value is DiscoverNavigationItem => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(item.id) &&
    (item.id as number) > 0 &&
    (item.mediaType === 'movie' || item.mediaType === 'tv')
  );
};

const sameItem = (
  left: DiscoverNavigationItem,
  right: DiscoverNavigationItem
): boolean => left.id === right.id && left.mediaType === right.mediaType;

const getStorageKey = (contextId: string): string =>
  `${STORAGE_KEY_PREFIX}${contextId}`;

const removeStoredContext = (
  storage: DiscoverNavigationStorage,
  key: string
): void => {
  try {
    storage.removeItem(key);
  } catch {
    // Storage can be unavailable or quota-restricted in privacy modes.
  }
};

const parseStoredContext = (
  record: Record<string, unknown> | undefined
): StoredDiscoverNavigationContext | undefined => {
  if (
    !record ||
    record.version !== 1 ||
    !Array.isArray(record.items) ||
    record.items.length === 0 ||
    record.items.length > MAX_CONTEXT_ITEMS ||
    typeof record.lastUsedAt !== 'number' ||
    !Number.isFinite(record.lastUsedAt)
  ) {
    return undefined;
  }

  const items: DiscoverNavigationItem[] = [];
  const seenItems = new Set<string>();

  for (const item of record.items) {
    if (!isNavigationItem(item)) {
      return undefined;
    }

    const identity = `${item.mediaType}:${item.id}`;
    if (seenItems.has(identity)) {
      return undefined;
    }

    seenItems.add(identity);
    items.push({ id: item.id, mediaType: item.mediaType });
  }

  return {
    version: 1,
    items,
    lastUsedAt: record.lastUsedAt,
  };
};

const pruneStoredContexts = (
  storage: DiscoverNavigationStorage,
  retainedContextId: string
): void => {
  try {
    const entries: { key: string; lastUsedAt: number }[] = [];
    const invalidKeys: string[] = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key?.startsWith(STORAGE_KEY_PREFIX)) {
        continue;
      }

      const context = parseStoredContext(readStoredRecord(storage, key));
      if (!context) {
        invalidKeys.push(key);
        continue;
      }

      entries.push({ key, lastUsedAt: context.lastUsedAt });
    }

    invalidKeys.forEach((key) => removeStoredContext(storage, key));
    entries.sort((left, right) => right.lastUsedAt - left.lastUsedAt);

    const retainedKey = getStorageKey(retainedContextId);
    const retainedEntries = entries.filter(
      (entry) => entry.key !== retainedKey
    );
    const remainingSlots = Math.max(0, MAX_STORED_CONTEXTS - 1);

    retainedEntries.slice(remainingSlots).forEach(({ key }) => {
      removeStoredContext(storage, key);
    });
  } catch {
    // Context pruning must never interfere with opening a title.
  }
};

export const storeDiscoverNavigationContext = (
  contextId: string,
  items: DiscoverNavigationItem[],
  currentItem: DiscoverNavigationItem,
  storage: DiscoverNavigationStorage | undefined = getSessionStorage()
): boolean => {
  if (
    !storage ||
    !isDiscoverNavigationContextId(contextId) ||
    !isNavigationItem(currentItem) ||
    !Array.isArray(items)
  ) {
    return false;
  }

  const normalizedItems: DiscoverNavigationItem[] = [];
  const seenItems = new Set<string>();

  for (const item of items) {
    if (!isNavigationItem(item)) {
      continue;
    }

    const identity = `${item.mediaType}:${item.id}`;
    if (seenItems.has(identity)) {
      continue;
    }

    seenItems.add(identity);
    normalizedItems.push({ id: item.id, mediaType: item.mediaType });
  }

  if (
    normalizedItems.length === 0 ||
    normalizedItems.length > MAX_CONTEXT_ITEMS ||
    !normalizedItems.some((item) => sameItem(item, currentItem))
  ) {
    return false;
  }

  const stored = writeStoredRecord(storage, getStorageKey(contextId), {
    version: 1,
    items: normalizedItems,
    lastUsedAt: Date.now(),
  });

  if (!stored) {
    return false;
  }

  pruneStoredContexts(storage, contextId);
  return true;
};

export const getDiscoverNavigationState = (
  contextId: unknown,
  currentItem: DiscoverNavigationItem,
  storage: DiscoverNavigationStorage | undefined = getSessionStorage()
): DiscoverNavigationState | undefined => {
  if (
    !storage ||
    !isDiscoverNavigationContextId(contextId) ||
    !isNavigationItem(currentItem)
  ) {
    return undefined;
  }

  const key = getStorageKey(contextId);
  const context = parseStoredContext(readStoredRecord(storage, key));
  if (!context) {
    removeStoredContext(storage, key);
    return undefined;
  }

  const currentIndex = context.items.findIndex((item) =>
    sameItem(item, currentItem)
  );
  if (currentIndex === -1) {
    return undefined;
  }

  context.lastUsedAt = Date.now();
  writeStoredRecord(storage, key, context);
  pruneStoredContexts(storage, contextId);

  const previous = context.items[currentIndex - 1];
  const next = context.items[currentIndex + 1];

  return {
    ...(previous ? { previous } : {}),
    ...(next ? { next } : {}),
  };
};

export const getDiscoverNavigationPath = (
  item: DiscoverNavigationItem,
  contextId: string
): string =>
  `/${item.mediaType}/${item.id}?${DISCOVER_NAVIGATION_QUERY_PARAM}=${encodeURIComponent(contextId)}`;
