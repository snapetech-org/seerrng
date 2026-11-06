import type TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import {
  getContentRestriction,
  isRestrictedItem,
} from '@server/lib/contentRestriction';
import { isUserMediaCategoryEnabled } from '@server/lib/userMediaCategories';
import { isVideoWithinMaturityLimit } from '@server/lib/videoMaturityPolicy';
import { mapWithConcurrency } from '@server/utils/concurrency';
import { hasHttpStatus } from '@server/utils/httpError';

type VideoItem = {
  id: string | number;
  mediaType: MediaType.MOVIE | MediaType.TV;
};

/** Apply the current viewer policy to metadata, never a saved title snapshot. */
export const filterFollowVideoItems = async <T extends VideoItem>(
  tmdb: TheMovieDb,
  user: User,
  items: T[],
  retryUnavailable = false
): Promise<T[]> => {
  if (items.length === 0) return [];
  const settings = await getRepository(UserSettings).findOne({
    where: { user: { id: user.id } },
  });
  const viewer = new User({ ...user, settings: settings ?? undefined });
  const restriction = getContentRestriction(viewer);
  const allowed = await mapWithConcurrency(items, 4, async (item) => {
    const id = Number(item.id);
    if (
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      id > 1000000000 ||
      !isUserMediaCategoryEnabled(viewer, item.mediaType)
    )
      return false;
    try {
      const details =
        item.mediaType === MediaType.MOVIE
          ? await tmdb.getMovie({ movieId: id })
          : await tmdb.getTvShow({ tvId: id });
      if (details.id !== id)
        throw new Error(
          'Follow movie or series metadata identity does not match.'
        );
      const adult = 'adult' in details && details.adult === true;
      if (adult) return false;
      if (
        restriction &&
        isRestrictedItem(restriction, {
          adult,
          genres: details.genres,
          keywords:
            'keywords' in details.keywords
              ? details.keywords.keywords
              : details.keywords.results,
          releases:
            'release_dates' in details ? details.release_dates : undefined,
          contentRatings:
            'content_ratings' in details ? details.content_ratings : undefined,
        })
      )
        return false;
      return isVideoWithinMaturityLimit(
        details,
        item.mediaType,
        item.mediaType === MediaType.MOVIE
          ? settings?.movieMaturityRatingLimit
          : settings?.tvMaturityRatingLimit
      );
    } catch (error) {
      if (retryUnavailable && !hasHttpStatus(error, 404)) throw error;
      return false;
    }
  });
  return items.filter((_, index) => allowed[index]);
};
