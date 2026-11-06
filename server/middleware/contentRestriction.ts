import TheMovieDb from '@server/api/themoviedb';
import type { ContentRestriction } from '@server/lib/contentRestriction';
import {
  contentRestrictionStorage,
  filterRestrictedPayload,
  getContentRestriction,
  isRestrictedItem,
} from '@server/lib/contentRestriction';
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

/** Catalog, detail, and request surfaces that can expose mature titles. */
const restrictedPathPattern =
  /^\/(?:discover|search|movie|tv|music|artist|book|author|comic|magazine|sportarr|series|collection|collection-catalog|person|watchlist|swipe|watch-sessions|association|playlist|calendar|request|media|software|game-library|live|live-tv)(?:\/|$)/;

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
  if (!restriction || !restrictedPathPattern.test(req.path)) {
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
    const filtered = filterRestrictedPayload(restriction, body);
    if (filtered.blocked) {
      res.status(404);
      return json({ status: 404, message: 'Not found.' });
    }
    return json(filtered.payload);
  }) as Response['json'];

  if (req.method === 'POST' && /^\/request\/?$/.test(req.path)) {
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
