export interface GenreSliderItem {
  id: number;
  name: string;
  backdrops: string[];
}

export interface WatchlistItem {
  id: number;
  ratingKey: string;
  tmdbId?: number;
  mbId?: string;
  externalId?: string;
  mediaType: 'movie' | 'tv' | 'music' | 'book' | 'comic' | 'magazine';
  title: string;
}

export const WATCHLIST_SORT_OPTIONS = [
  'added-desc',
  'title-asc',
  'title-desc',
] as const;

export type WatchlistSort = (typeof WATCHLIST_SORT_OPTIONS)[number];

export interface WatchlistFilters {
  search?: string;
  mediaType?: WatchlistItem['mediaType'];
  sortBy?: WatchlistSort;
}

export interface WatchlistResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  filtersSupported: boolean;
  results: WatchlistItem[];
}
