import type DiscoverSlider from '@server/entity/DiscoverSlider';

export interface DiscoverNetworkData {
  id: number;
  name: string;
  logoPath: string;
  logoTone?: 'color' | 'white';
}

export enum DiscoverSliderType {
  RECENTLY_ADDED = 1,
  RECENT_REQUESTS,
  PLEX_WATCHLIST,
  TRENDING,
  POPULAR_MOVIES,
  MOVIE_GENRES,
  UPCOMING_MOVIES,
  STUDIOS,
  POPULAR_TV,
  TV_GENRES,
  UPCOMING_TV,
  NETWORKS,
  TMDB_MOVIE_KEYWORD,
  TMDB_MOVIE_GENRE,
  TMDB_TV_KEYWORD,
  TMDB_TV_GENRE,
  TMDB_SEARCH,
  TMDB_STUDIO,
  TMDB_NETWORK,
  TMDB_MOVIE_STREAMING_SERVICES,
  TMDB_TV_STREAMING_SERVICES,
  POPULAR_MUSIC,
  POPULAR_BOOKS,
  OPENLIBRARY_BOOK_SUBJECT,
  MUSICBRAINZ_MUSIC_GENRE,
  LISTENBRAINZ_MUSIC_CHART,
  ASSOCIATIONS,
  TMDB_LIST,
}

export const MAX_DISCOVER_SLIDERS = 100;
export const MAX_DISCOVER_KEYWORD_IDS = 20;
export const MAX_DISCOVER_SLIDER_TITLE_LENGTH = 100;
export const MAX_DISCOVER_SLIDER_DATA_LENGTH = 500;
export const MAX_TMDB_PUBLIC_LIST_ID_LENGTH = 12;

export const isTmdbPublicListId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAX_TMDB_PUBLIC_LIST_ID_LENGTH &&
  /^[1-9]\d*$/.test(value);

export const MAX_DISCOVER_NETWORKS = 50;
export const MAX_DISCOVER_NETWORK_NAME_LENGTH = 100;
export const MAX_DISCOVER_NETWORK_LOGO_PATH_LENGTH = 200;
export const MAX_DISCOVER_NETWORK_DATA_LENGTH = 25_000;

export const defaultSliders: Partial<DiscoverSlider>[] = [
  {
    type: DiscoverSliderType.RECENTLY_ADDED,
    enabled: true,
    isBuiltIn: true,
    order: 0,
  },
  {
    type: DiscoverSliderType.RECENT_REQUESTS,
    enabled: true,
    isBuiltIn: true,
    order: 1,
  },
  {
    type: DiscoverSliderType.PLEX_WATCHLIST,
    enabled: true,
    isBuiltIn: true,
    order: 2,
  },
  {
    type: DiscoverSliderType.TRENDING,
    enabled: true,
    isBuiltIn: true,
    order: 3,
  },
  {
    type: DiscoverSliderType.POPULAR_MOVIES,
    enabled: true,
    isBuiltIn: true,
    order: 4,
  },
  {
    type: DiscoverSliderType.MOVIE_GENRES,
    enabled: true,
    isBuiltIn: true,
    order: 5,
  },
  {
    type: DiscoverSliderType.UPCOMING_MOVIES,
    enabled: true,
    isBuiltIn: true,
    order: 6,
  },
  {
    type: DiscoverSliderType.STUDIOS,
    enabled: true,
    isBuiltIn: true,
    order: 7,
  },
  {
    type: DiscoverSliderType.POPULAR_TV,
    enabled: true,
    isBuiltIn: true,
    order: 8,
  },
  {
    type: DiscoverSliderType.TV_GENRES,
    enabled: true,
    isBuiltIn: true,
    order: 9,
  },
  {
    type: DiscoverSliderType.UPCOMING_TV,
    enabled: true,
    isBuiltIn: true,
    order: 10,
  },
  {
    type: DiscoverSliderType.NETWORKS,
    enabled: true,
    isBuiltIn: true,
    order: 11,
  },
  {
    type: DiscoverSliderType.POPULAR_MUSIC,
    enabled: true,
    isBuiltIn: true,
    order: 12,
  },
  {
    type: DiscoverSliderType.POPULAR_BOOKS,
    enabled: true,
    isBuiltIn: true,
    order: 13,
  },
];
