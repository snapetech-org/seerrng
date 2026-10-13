export type RestorableDiscoverMediaType =
  'movie' | 'tv' | 'movieOrTv' | 'book' | 'comic';

export type DiscoverScrollEntry = {
  path: string;
  scrollY: number;
  itemCount: number;
  shuffleSeed?: string;
};

export const DISCOVER_SCROLL_HISTORY_KEY = '__seerrDiscoverScroll';

// Keep persisted seeds within the same bound enforced by the discover APIs.
const MAX_SHUFFLE_SEED_LENGTH = 128;

const detailPathPatterns: Record<RestorableDiscoverMediaType, RegExp> = {
  movie: /^\/movie\/[^/?#]+(?:[/?#]|$)/,
  tv: /^\/tv\/[^/?#]+(?:[/?#]|$)/,
  movieOrTv: /^\/(?:movie|tv)\/[^/?#]+(?:[/?#]|$)/,
  book: /^\/book\/[^/?#]+(?:[/?#]|$)/,
  comic: /^\/comic\/[^/?#]+(?:[/?#]|$)/,
};

export const isMediaDetailPath = (
  url: string,
  mediaType: RestorableDiscoverMediaType
): boolean => {
  const path = url.startsWith('http') ? new URL(url).pathname : url;

  return detailPathPatterns[mediaType].test(path);
};

export const getDiscoverScrollEntry = (
  historyState: unknown,
  path: string
): DiscoverScrollEntry | undefined => {
  if (!historyState || typeof historyState !== 'object') {
    return undefined;
  }

  const entry = (historyState as Record<string, unknown>)[
    DISCOVER_SCROLL_HISTORY_KEY
  ];

  if (!entry || typeof entry !== 'object') {
    return undefined;
  }

  const candidate = entry as Partial<DiscoverScrollEntry>;

  if (
    candidate.path !== path ||
    typeof candidate.scrollY !== 'number' ||
    !Number.isFinite(candidate.scrollY) ||
    candidate.scrollY < 0 ||
    typeof candidate.itemCount !== 'number' ||
    !Number.isInteger(candidate.itemCount) ||
    candidate.itemCount < 0 ||
    (candidate.shuffleSeed !== undefined &&
      (typeof candidate.shuffleSeed !== 'string' ||
        candidate.shuffleSeed.length > MAX_SHUFFLE_SEED_LENGTH))
  ) {
    return undefined;
  }

  return candidate as DiscoverScrollEntry;
};

export const getScrollRestorationAction = ({
  entry,
  itemCount,
  isLoading,
  isReachingEnd,
}: {
  entry?: DiscoverScrollEntry;
  itemCount: number;
  isLoading: boolean;
  isReachingEnd: boolean;
}): 'none' | 'load-more' | 'restore' => {
  if (!entry) {
    return 'none';
  }

  if (itemCount >= entry.itemCount || isReachingEnd) {
    return 'restore';
  }

  return isLoading ? 'none' : 'load-more';
};

// Next.js replaces history.state during Back/Forward navigation, but retains key.
const storageKey = (): string | undefined => {
  const key = getDiscoverHistoryEntryKey();
  return key ? `${DISCOVER_SCROLL_HISTORY_KEY}:${key}` : undefined;
};

export const getDiscoverHistoryEntryKey = (): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const key = window.history.state?.key;
  return typeof key === 'string' && key.length > 0 ? key : undefined;
};

const sliderPositionsStorageKey = (historyEntryKey: string): string =>
  `${DISCOVER_SCROLL_HISTORY_KEY}:sliders:${historyEntryKey}`;

const isSliderScrollPositionMap = (
  value: unknown
): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const readDiscoverSliderScrollPosition = (
  historyEntryKey: string | undefined,
  sliderKey: string
): number | undefined => {
  if (
    typeof window === 'undefined' ||
    !historyEntryKey ||
    !sliderKey ||
    sliderKey.length > 128
  ) {
    return undefined;
  }

  try {
    const positions = JSON.parse(
      window.sessionStorage.getItem(
        sliderPositionsStorageKey(historyEntryKey)
      ) ?? 'null'
    );
    if (
      !isSliderScrollPositionMap(positions) ||
      !Object.prototype.hasOwnProperty.call(positions, sliderKey)
    ) {
      return undefined;
    }

    const position = positions[sliderKey];
    return typeof position === 'number' &&
      Number.isFinite(position) &&
      position >= 0
      ? position
      : undefined;
  } catch {
    return undefined;
  }
};

export const saveDiscoverSliderScrollPosition = (
  historyEntryKey: string | undefined,
  sliderKey: string,
  position: number
): void => {
  if (
    typeof window === 'undefined' ||
    !historyEntryKey ||
    !sliderKey ||
    sliderKey.length > 128 ||
    !Number.isFinite(position) ||
    position < 0
  ) {
    return;
  }

  try {
    const key = sliderPositionsStorageKey(historyEntryKey);
    const stored = JSON.parse(window.sessionStorage.getItem(key) ?? 'null');
    const positions: Record<string, number> = Object.create(null);
    if (isSliderScrollPositionMap(stored)) {
      for (const [storedSliderKey, storedPosition] of Object.entries(stored)) {
        if (
          storedSliderKey.length <= 128 &&
          typeof storedPosition === 'number' &&
          Number.isFinite(storedPosition) &&
          storedPosition >= 0
        ) {
          positions[storedSliderKey] = storedPosition;
        }
      }
    }

    positions[sliderKey] = position;
    window.sessionStorage.setItem(key, JSON.stringify(positions));
  } catch {
    // Navigation must still work when session storage is unavailable.
  }
};

export const readDiscoverScrollEntry = (
  path: string
): DiscoverScrollEntry | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const key = storageKey();
    return key
      ? getDiscoverScrollEntry(
          {
            [DISCOVER_SCROLL_HISTORY_KEY]: JSON.parse(
              window.sessionStorage.getItem(key) ?? 'null'
            ),
          },
          path
        )
      : undefined;
  } catch {
    return undefined;
  }
};

export const saveDiscoverScrollEntry = (entry: DiscoverScrollEntry): void => {
  try {
    const key = storageKey();
    if (key) window.sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // Navigation must still work when session storage is unavailable.
  }
};
