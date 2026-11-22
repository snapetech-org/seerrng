export type DiscoverMediaType = 'movie' | 'tv';

export interface DiscoverNavigationItem {
  id: number;
  mediaType: DiscoverMediaType;
}

export interface DiscoverNavigationState {
  previous?: DiscoverNavigationItem;
  next?: DiscoverNavigationItem;
}

const STORAGE_PREFIX = 'seerrng:lumen-discover-navigation:';
const CONTEXT_ID = /^[a-z0-9_-]{12,64}$/i;
const MAX_ITEMS = 5000;
const MAX_CONTEXTS = 12;

type StoredContext = {
  version: 1;
  items: DiscoverNavigationItem[];
  lastUsedAt: number;
};

export function createDiscoverNavigationContextId() {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    // Use a non-secret random key when UUID support is unavailable.
  }
  return `lumen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 18)}`;
}

const validItem = (value: unknown): value is DiscoverNavigationItem => {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(item.id) &&
    Number(item.id) > 0 &&
    (item.mediaType === 'movie' || item.mediaType === 'tv')
  );
};

const storageKey = (contextId: string) => STORAGE_PREFIX + contextId;

function parseContext(value: string | null): StoredContext | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<StoredContext>;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.items) ||
      parsed.items.length === 0 ||
      parsed.items.length > MAX_ITEMS ||
      typeof parsed.lastUsedAt !== 'number' ||
      !Number.isFinite(parsed.lastUsedAt) ||
      !parsed.items.every(validItem)
    )
      return undefined;
    const seen = new Set<string>();
    for (const item of parsed.items) {
      const identity = `${item.mediaType}:${item.id}`;
      if (seen.has(identity)) return undefined;
      seen.add(identity);
    }
    return parsed as StoredContext;
  } catch {
    return undefined;
  }
}

function pruneContexts(retain: string) {
  try {
    const storage = window.sessionStorage;
    const entries: { key: string; lastUsedAt: number }[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const context = parseContext(storage.getItem(key));
      if (!context) storage.removeItem(key);
      else entries.push({ key, lastUsedAt: context.lastUsedAt });
    }
    entries.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    const retainedKey = storageKey(retain);
    for (const entry of entries
      .filter((item) => item.key !== retainedKey)
      .slice(MAX_CONTEXTS - 1))
      storage.removeItem(entry.key);
  } catch {
    // Private browsing modes may deny storage access; navigation remains optional.
  }
}

export function storeDiscoverNavigationContext(
  contextId: string,
  items: DiscoverNavigationItem[],
  current: DiscoverNavigationItem
) {
  if (!CONTEXT_ID.test(contextId) || !validItem(current)) return false;
  const normalized: DiscoverNavigationItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!validItem(item)) continue;
    const identity = `${item.mediaType}:${item.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    normalized.push({ id: item.id, mediaType: item.mediaType });
  }
  const index = normalized.findIndex(
    (item) => item.id === current.id && item.mediaType === current.mediaType
  );
  if (index < 0) return false;
  const start = Math.min(
    Math.max(0, index - Math.floor(MAX_ITEMS / 2)),
    Math.max(0, normalized.length - MAX_ITEMS)
  );
  try {
    window.sessionStorage.setItem(
      storageKey(contextId),
      JSON.stringify({
        version: 1,
        items: normalized.slice(start, start + MAX_ITEMS),
        lastUsedAt: Date.now(),
      } satisfies StoredContext)
    );
    pruneContexts(contextId);
    return true;
  } catch {
    return false;
  }
}

export function getDiscoverNavigationState(
  contextId: string | null,
  current: DiscoverNavigationItem
): DiscoverNavigationState | undefined {
  if (!contextId || !CONTEXT_ID.test(contextId) || !validItem(current))
    return undefined;
  try {
    const key = storageKey(contextId);
    const context = parseContext(window.sessionStorage.getItem(key));
    if (!context) {
      window.sessionStorage.removeItem(key);
      return undefined;
    }
    const index = context.items.findIndex(
      (item) => item.id === current.id && item.mediaType === current.mediaType
    );
    if (index < 0) return undefined;
    context.lastUsedAt = Date.now();
    window.sessionStorage.setItem(key, JSON.stringify(context));
    pruneContexts(contextId);
    return {
      ...(context.items[index - 1]
        ? { previous: context.items[index - 1] }
        : {}),
      ...(context.items[index + 1] ? { next: context.items[index + 1] } : {}),
    };
  } catch {
    return undefined;
  }
}
