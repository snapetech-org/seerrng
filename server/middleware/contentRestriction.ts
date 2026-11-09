import TheMovieDb from '@server/api/themoviedb';
import type { ContentRestriction } from '@server/lib/contentRestriction';
import {
  contentRestrictionStorage,
  filterRestrictedPayload,
  getContentRestriction,
  isRestrictedItem,
} from '@server/lib/contentRestriction';
import { filterMediaCategories } from '@server/lib/mediaAccess';
import logger from '@server/logger';
import type { NextFunction, Request, Response } from 'express';

const checkRequestAllowed = async (
  req: Request,
  restriction: ContentRestriction
): Promise<boolean> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.mediaType === 'adult') {
    return false;
  }
  const mediaId = Number(body.mediaId);
  if (
    (body.mediaType !== 'movie' && body.mediaType !== 'tv') ||
    !Number.isSafeInteger(mediaId) ||
    mediaId < 1
  ) {
    return true;
  }
  try {
    const tmdb = new TheMovieDb();
    const item =
      body.mediaType === 'movie'
        ? await tmdb.getMovie({ movieId: mediaId })
        : await tmdb.getTvShow({ tvId: mediaId });
    return !isRestrictedItem(restriction, {
      adult: (item as { adult?: boolean }).adult,
      releases: (item as { release_dates?: unknown }).release_dates,
      contentRatings: (item as { content_ratings?: unknown }).content_ratings,
    });
  } catch (e) {
    // Best-effort: a metadata outage must not block every request.
    logger.warn('Age gate could not verify requested title', {
      label: 'Age Gate',
      errorMessage: e.message,
    });
    return true;
  }
};

// New feature routes inherit policy by default. Only non-catalog administrative
// envelopes are excluded; adding a feature no longer requires editing a list.
const administrativePathPattern =
  /^\/(?:auth|user|settings|interface-themes|notifications|status|desktop)(?:\/|$)/;

/**
 * Enforces the age gate server-side for restricted accounts: upstream TMDB
 * queries are constrained through async context, and any JSON response has
 * mature items removed (or becomes a 404 when the record itself is mature).
 */
export const contentRestrictionMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const restriction = getContentRestriction(req.user);
  if (!req.user || administrativePathPattern.test(req.path)) {
    return next();
  }

  const json = res.json.bind(res);
  const blockRequest = () =>
    res.status(403).json({
      status: 403,
      message: 'This content is restricted for your account.',
    });

  res.json = ((body: Parameters<Response['json']>[0]) => {
    if (res.statusCode >= 400 || res.headersSent) {
      return json(body);
    }
    const categories = filterMediaCategories(req.user!, body);
    const filtered = restriction
      ? filterRestrictedPayload(restriction, categories.payload)
      : categories;
    if (categories.blocked || filtered.blocked) {
      res.status(404);
      return json({ status: 404, message: 'Not found.' });
    }
    return json(filtered.payload);
  }) as Response['json'];

  if (restriction && req.method === 'POST' && /^\/request\/?$/.test(req.path)) {
    return void checkRequestAllowed(req, restriction).then(
      (allowed) =>
        allowed
          ? contentRestrictionStorage.run(restriction, next)
          : blockRequest(),
      next
    );
  }

  return contentRestrictionStorage.run(restriction, next);
};
