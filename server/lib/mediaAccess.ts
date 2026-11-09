import TheMovieDb from '@server/api/themoviedb';
import type {
  TmdbMovieDetails,
  TmdbTvDetails,
} from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import type { MediaCategoryKey } from '@server/constants/mediaCategories';
import type Media from '@server/entity/Media';
import type { User } from '@server/entity/User';
import { getContentRestriction, isRestrictedItem } from './contentRestriction';
import { isUserMediaCategoryEnabled } from './userMediaCategories';
import { isVideoWithinMaturityLimit } from './videoMaturityPolicy';

export const categoriesForMediaType = (type: unknown): MediaCategoryKey[] => {
  switch (type) {
    case 'movie':
      return ['movie'];
    case 'tv':
    case 'anime':
      return ['tv'];
    case 'music':
    case 'album':
    case 'artist':
      return ['music'];
    case 'book':
    case 'novel':
    case 'manga':
      return ['ebook', 'audiobook'];
    case 'ebook':
      return ['ebook'];
    case 'audiobook':
      return ['audiobook'];
    case 'comic':
      return ['comic'];
    case 'magazine':
      return ['magazine'];
    case 'adult':
      return ['adult'];
    case 'game':
    case 'software':
      return ['game'];
    case 'retro':
      return ['retro'];
    case 'modern':
      return ['modern'];
    case 'sportarr':
    case 'sports':
      return ['sports'];
    default:
      return [];
  }
};

export const isMediaTypeEnabledForUser = (
  user: User,
  type: unknown
): boolean => {
  const categories = categoriesForMediaType(type);
  return (
    categories.length > 0 &&
    categories.some((category) => isUserMediaCategoryEnabled(user, category))
  );
};

/** Resolve protected video policies before discarding rating metadata. */
export const mayAccessVideo = async (
  user: User,
  type: MediaType.MOVIE | MediaType.TV,
  id: number,
  details?: TmdbMovieDetails | TmdbTvDetails
): Promise<boolean> => {
  if (!isMediaTypeEnabledForUser(user, type)) return false;
  const restriction = getContentRestriction(user);
  const limit =
    type === MediaType.MOVIE
      ? user.settings?.movieMaturityRatingLimit
      : user.settings?.tvMaturityRatingLimit;
  if (!restriction && !limit) return true;
  if (!Number.isSafeInteger(id) || id < 1) return false;
  try {
    const tmdb = new TheMovieDb();
    const item =
      details ??
      (type === MediaType.MOVIE
        ? await tmdb.getMovie({ movieId: id })
        : await tmdb.getTvShow({ tvId: id }));
    if (item.id !== id) return false;
    if (
      restriction &&
      isRestrictedItem(restriction, {
        ...item,
        releases: (item as TmdbMovieDetails).release_dates,
        contentRatings: (item as TmdbTvDetails).content_ratings,
      })
    )
      return false;
    return isVideoWithinMaturityLimit(item, type, limit);
  } catch {
    // A protected account cannot be admitted on missing provider evidence.
    return false;
  }
};

export const mayAccessMedia = (user: User, media: Media): Promise<boolean> => {
  if (!isMediaTypeEnabledForUser(user, media.mediaType))
    return Promise.resolve(false);
  if (media.mediaType === MediaType.MOVIE || media.mediaType === MediaType.TV) {
    return mayAccessVideo(user, media.mediaType, media.tmdbId);
  }
  return Promise.resolve(
    media.mediaType !== MediaType.ADULT || !getContentRestriction(user)
  );
};

/** Cross-media cards must retain the same category boundary as their route. */
export const filterMediaCategories = (
  user: User,
  payload: unknown
): { payload: unknown; blocked: boolean } => {
  const blocked = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return false;
    const item = value as Record<string, unknown>;
    const type = item.formatHint ?? item.mediaType ?? item.type ?? item.kind;
    const categories = categoriesForMediaType(type);
    return (
      categories.length > 0 &&
      !categories.some((category) => isUserMediaCategoryEnabled(user, category))
    );
  };
  const walk = (value: unknown, depth: number): unknown => {
    if (depth > 12 || value === null || typeof value !== 'object') return value;
    if ('toJSON' in value && typeof value.toJSON === 'function')
      return walk(value.toJSON(), depth + 1);
    if (Array.isArray(value))
      return value
        .filter((item) => !blocked(item))
        .map((item) => walk(item, depth + 1));
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        blocked(item) ? null : walk(item, depth + 1),
      ])
    );
  };
  return { blocked: blocked(payload), payload: walk(payload, 0) };
};
