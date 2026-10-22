import type {
  EnabledMediaCategories,
  MediaCategoryKey,
} from '@server/constants/mediaCategories';
import { MEDIA_CATEGORY_KEYS } from '@server/constants/mediaCategories';

export interface OptionalServiceAvailability {
  musicEnabled: boolean;
  booksEnabled: boolean;
  ebookServiceEnabled?: boolean;
  audiobookServiceEnabled?: boolean;
  readmeabookEnabled?: boolean;
  comicsEnabled: boolean;
  magazinesEnabled?: boolean;
  adultEnabled?: boolean;
  sportsEnabled?: boolean;
  softwareEnabled?: boolean;
  romarrEnabled?: boolean;
  swipeEnabled?: boolean;
  enabledMediaCategories?: Partial<Record<MediaCategoryKey, boolean>>;
  defaultEnabledMediaCategories?: Partial<EnabledMediaCategories>;
}

export const getUserServiceAvailability = <
  T extends OptionalServiceAvailability,
>(
  availability: T,
  userPreferences?: Partial<EnabledMediaCategories>,
  isAdmin = false
): T & { enabledMediaCategories: EnabledMediaCategories } => ({
  ...availability,
  enabledMediaCategories: Object.fromEntries(
    MEDIA_CATEGORY_KEYS.map((category) => [
      category,
      availability.enabledMediaCategories?.[category] !== false &&
        (isAdmin ||
          (userPreferences?.[category] ??
            availability.defaultEnabledMediaCategories?.[category] ??
            true)),
    ])
  ) as EnabledMediaCategories,
});

export const DISCOVER_MEDIA_TYPES = [
  'movie',
  'tv',
  'music',
  'book',
  'audiobook',
] as const;

export type DiscoverMediaType = (typeof DISCOVER_MEDIA_TYPES)[number];

export const DISCOVER_WATCHLIST_TYPES = [
  'movie',
  'tv',
  'music',
  'book',
  'comic',
  'magazine',
] as const;

export type DiscoverWatchlistType = (typeof DISCOVER_WATCHLIST_TYPES)[number];

export const isConfiguredMediaCategoryEnabled = (
  category: MediaCategoryKey,
  availability: Pick<OptionalServiceAvailability, 'enabledMediaCategories'>
): boolean => availability.enabledMediaCategories?.[category] !== false;

export const isBookFormatEnabled = (
  format: 'ebook' | 'audiobook',
  availability: OptionalServiceAvailability
): boolean => {
  const serviceEnabled =
    format === 'ebook'
      ? availability.ebookServiceEnabled
      : availability.readmeabookEnabled || availability.audiobookServiceEnabled;

  return (
    (serviceEnabled ?? availability.booksEnabled) &&
    isConfiguredMediaCategoryEnabled(format, availability)
  );
};

export const isDiscoverMediaTypeEnabled = (
  type: DiscoverMediaType,
  availability: OptionalServiceAvailability
): boolean => {
  switch (type) {
    case 'movie':
      return isConfiguredMediaCategoryEnabled('movie', availability);
    case 'tv':
      return isConfiguredMediaCategoryEnabled('tv', availability);
    case 'music':
      return (
        availability.musicEnabled &&
        isConfiguredMediaCategoryEnabled('music', availability)
      );
    case 'book':
      return isBookFormatEnabled('ebook', availability);
    case 'audiobook':
      return isBookFormatEnabled('audiobook', availability);
  }
};

export const isDiscoverWatchlistTypeEnabled = (
  type: DiscoverWatchlistType,
  availability: OptionalServiceAvailability
): boolean => {
  switch (type) {
    case 'movie':
      return isConfiguredMediaCategoryEnabled('movie', availability);
    case 'tv':
      return isConfiguredMediaCategoryEnabled('tv', availability);
    case 'music':
      return isConfiguredMediaCategoryEnabled('music', availability);
    case 'book':
      return (
        isConfiguredMediaCategoryEnabled('ebook', availability) ||
        isConfiguredMediaCategoryEnabled('audiobook', availability)
      );
    case 'comic':
      return isConfiguredMediaCategoryEnabled('comic', availability);
    case 'magazine':
      return isConfiguredMediaCategoryEnabled('magazine', availability);
  }
};

export const isAnySoftwareCategoryEnabled = (
  availability: OptionalServiceAvailability
): boolean =>
  Boolean(
    availability.softwareEnabled &&
    (isConfiguredMediaCategoryEnabled('game', availability) ||
      (availability.romarrEnabled !== false &&
        (isConfiguredMediaCategoryEnabled('retro', availability) ||
          isConfiguredMediaCategoryEnabled('modern', availability))))
  );

export const isOptionalCatalogPathEnabled = (
  path: string,
  availability: OptionalServiceAvailability
): boolean => {
  if (path === '/swipe' || path.startsWith('/swipe/')) {
    return availability.swipeEnabled !== false;
  }

  if (
    path === '/discover/movies' ||
    path.startsWith('/discover/movies/') ||
    path.startsWith('/movie/')
  ) {
    return isConfiguredMediaCategoryEnabled('movie', availability);
  }

  if (
    path === '/discover/tv' ||
    path.startsWith('/discover/tv/') ||
    path.startsWith('/tv/') ||
    path.startsWith('/series/')
  ) {
    return isConfiguredMediaCategoryEnabled('tv', availability);
  }

  if (
    path === '/discover/music' ||
    path.startsWith('/discover/music/') ||
    path.startsWith('/music/') ||
    path.startsWith('/artist/')
  ) {
    return (
      availability.musicEnabled &&
      isConfiguredMediaCategoryEnabled('music', availability)
    );
  }

  if (
    path === '/discover/comics' ||
    path.startsWith('/discover/comics/') ||
    path.startsWith('/comic/')
  ) {
    return (
      availability.comicsEnabled &&
      isConfiguredMediaCategoryEnabled('comic', availability)
    );
  }

  if (
    path === '/discover/magazines' ||
    path.startsWith('/discover/magazines/') ||
    path.startsWith('/magazine/')
  ) {
    return (
      Boolean(availability.magazinesEnabled) &&
      isConfiguredMediaCategoryEnabled('magazine', availability)
    );
  }

  if (
    path === '/discover/sports' ||
    path.startsWith('/discover/sports/') ||
    path.startsWith('/sportarr/')
  ) {
    return (
      Boolean(availability.sportsEnabled) &&
      isConfiguredMediaCategoryEnabled('sports', availability)
    );
  }

  if (
    path === '/discover/adult' ||
    path.startsWith('/discover/adult/') ||
    path.startsWith('/adult/')
  ) {
    return (
      Boolean(availability.adultEnabled) &&
      isConfiguredMediaCategoryEnabled('adult', availability)
    );
  }

  if (path === '/discover/audiobooks') {
    return isBookFormatEnabled('audiobook', availability);
  }

  if (path === '/discover/books') {
    return isBookFormatEnabled('ebook', availability);
  }

  if (path.startsWith('/book/') || path.startsWith('/author/')) {
    return (
      isBookFormatEnabled('ebook', availability) ||
      isBookFormatEnabled('audiobook', availability)
    );
  }

  if (path === '/discover/games' || path.startsWith('/discover/games/')) {
    return (
      Boolean(availability.softwareEnabled) &&
      isConfiguredMediaCategoryEnabled('game', availability)
    );
  }

  if (path === '/discover/patches' || path.startsWith('/discover/patches/')) {
    return (
      Boolean(availability.softwareEnabled) &&
      Boolean(availability.romarrEnabled) &&
      (isConfiguredMediaCategoryEnabled('retro', availability) ||
        isConfiguredMediaCategoryEnabled('modern', availability))
    );
  }

  if (
    path === '/game-library' ||
    path.startsWith('/game-library/') ||
    path === '/game-content' ||
    path.startsWith('/game-content/')
  ) {
    return (
      Boolean(availability.softwareEnabled) &&
      isConfiguredMediaCategoryEnabled('game', availability)
    );
  }

  if (path === '/software') {
    return isAnySoftwareCategoryEnabled(availability);
  }

  return true;
};
