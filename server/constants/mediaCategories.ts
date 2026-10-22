export const MEDIA_CATEGORY_KEYS = [
  'movie',
  'tv',
  'music',
  'ebook',
  'audiobook',
  'comic',
  'magazine',
  'adult',
  'sports',
  'retro',
  'modern',
  'game',
] as const;

export type MediaCategoryKey = (typeof MEDIA_CATEGORY_KEYS)[number];
export type EnabledMediaCategories = Record<MediaCategoryKey, boolean>;

export const DEFAULT_ENABLED_MEDIA_CATEGORIES: EnabledMediaCategories = {
  movie: true,
  tv: true,
  music: true,
  ebook: true,
  audiobook: true,
  comic: true,
  magazine: true,
  adult: false,
  sports: true,
  retro: true,
  modern: true,
  game: true,
};

/** New and inheriting users start with the common catalog types enabled. */
export const DEFAULT_USER_ENABLED_MEDIA_CATEGORIES: EnabledMediaCategories = {
  ...DEFAULT_ENABLED_MEDIA_CATEGORIES,
};
