import { MediaType } from '@server/constants/media';
import {
  findAnilistIdForTmdbShow,
  getContinuation,
} from '@server/lib/continuation';
import { getRequestTargets } from '@server/lib/continuation/targets';
import { mayAccessVideo } from '@server/lib/mediaAccess';
import logger from '@server/logger';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';

const continuationRoutes = Router();

continuationRoutes.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    keyGenerator: (req) => `user:${req.user?.id ?? 'anonymous'}`,
  })
);

const positive = (value: unknown, max = 1_000_000_000) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max
    ? parsed
    : undefined;
};

const respond = async (
  anilistId: number,
  options: { season?: number; language?: string; tmdbSeasonCount?: number }
) => {
  const result = await getContinuation({ anilistId, ...options });
  if (!result) return undefined;
  const sources = await Promise.all(
    result.sources.map(async (source) => ({
      ...source,
      targets: await getRequestTargets(source).catch(() => []),
    }))
  );
  return { ...result, sources };
};

/** Source material for a TMDB show that is an anime. */
continuationRoutes.get<{ tvId: string }>(
  '/tv/:tvId',
  async (req, res, next) => {
    const tvId = positive(req.params.tvId);
    if (!tvId) {
      return res.status(400).json({ status: 400, message: 'Invalid show id.' });
    }
    if (!req.user || !(await mayAccessVideo(req.user, MediaType.TV, tvId)))
      return res.status(404).json({ message: 'Not found.' });
    try {
      const { anilistId, seasonCount } = await findAnilistIdForTmdbShow(
        tvId,
        typeof req.query.language === 'string' ? req.query.language : undefined
      );
      if (!anilistId) {
        return res.status(200).json({ available: false, reason: 'not-anime' });
      }
      const result = await respond(anilistId, {
        season: positive(req.query.season, 50),
        language:
          typeof req.query.language === 'string'
            ? req.query.language
            : undefined,
        tmdbSeasonCount: seasonCount,
      });
      return res
        .status(200)
        .json(result ? { available: true, ...result } : { available: false });
    } catch (error) {
      logger.warn('Failed to load anime continuation', {
        label: 'Continuation',
        tvId,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return next({
        status: 503,
        message: 'Unable to find the source material.',
      });
    }
  }
);

/** Same, from an AniList id (AniList-sourced discovery cards). */
continuationRoutes.get<{ id: string }>(
  '/anilist/:id',
  async (req, res, next) => {
    const id = positive(req.params.id);
    if (!id) {
      return res
        .status(400)
        .json({ status: 400, message: 'Invalid AniList id.' });
    }
    if (req.user?.settings?.tvMaturityRatingLimit)
      return res.status(404).json({ message: 'Not found.' });
    try {
      const result = await respond(id, {
        season: positive(req.query.season, 50),
        language:
          typeof req.query.language === 'string'
            ? req.query.language
            : undefined,
      });
      return res
        .status(200)
        .json(result ? { available: true, ...result } : { available: false });
    } catch (error) {
      logger.warn('Failed to load anime continuation', {
        label: 'Continuation',
        anilistId: id,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return next({
        status: 503,
        message: 'Unable to find the source material.',
      });
    }
  }
);

export default continuationRoutes;
