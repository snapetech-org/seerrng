import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import { rankTmdbPersonCredits } from '@server/lib/tmdbRank';
import {
  filterVideoItemsByMaturityPolicy,
  getUserVideoMaturityPolicy,
} from '@server/lib/videoMaturityPolicy';
import logger from '@server/logger';
import {
  mapCastCredits,
  mapCrewCredits,
  mapPersonDetails,
} from '@server/models/Person';
import { parsePositiveRouteId } from '@server/utils/routeId';
import { parseOptionalLanguage } from '@server/utils/validation';
import { Router } from 'express';

const personRoutes = Router();
const maxTmdbPersonId = 1_000_000_000;
const maxMaturityCheckedCredits = 50;

const parsePersonRouteId = (id: unknown): number | undefined =>
  parsePositiveRouteId(id, maxTmdbPersonId);

personRoutes.get('/:id', async (req, res, next) => {
  const tmdb = new TheMovieDb();
  const personId = parsePersonRouteId(req.params.id);
  if (!personId) {
    return next({ status: 404, message: 'Person not found.' });
  }
  const parsedLanguage = parseOptionalLanguage(req.query.language);
  if ('error' in parsedLanguage) {
    return res.status(400).json({ status: 400, message: parsedLanguage.error });
  }
  const language = parsedLanguage.value ?? req.metadataLocale;

  try {
    const person = await tmdb.getPerson({
      personId,
      language,
    });
    return res.status(200).json(mapPersonDetails(person));
  } catch (e) {
    logger.debug('Something went wrong retrieving person', {
      label: 'API',
      errorMessage: e.message,
      personId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve person.',
    });
  }
});

personRoutes.get('/:id/combined_credits', async (req, res, next) => {
  const tmdb = new TheMovieDb();
  const personId = parsePersonRouteId(req.params.id);
  if (!personId) {
    return next({ status: 404, message: 'Person not found.' });
  }
  const parsedLanguage = parseOptionalLanguage(req.query.language);
  if ('error' in parsedLanguage) {
    return res.status(400).json({ status: 400, message: parsedLanguage.error });
  }
  const language = parsedLanguage.value ?? req.metadataLocale;

  try {
    const combinedCredits = await tmdb.getPersonCombinedCredits({
      personId,
      language,
    });
    const rankedCast = rankTmdbPersonCredits(combinedCredits.cast);
    const rankedCrew = rankTmdbPersonCredits(combinedCredits.crew);
    const maturityPolicy = req.user
      ? await getUserVideoMaturityPolicy(req.user.id)
      : { movie: null, tv: null };
    const filterCreditsByMaturity = async <
      T extends (typeof rankedCast)[number] | (typeof rankedCrew)[number],
    >(
      credits: T[]
    ): Promise<T[]> => {
      const restrictedCredits = credits.filter(
        (credit) =>
          (credit.media_type === MediaType.MOVIE &&
            maturityPolicy.movie !== null) ||
          (credit.media_type === MediaType.TV && maturityPolicy.tv !== null)
      );
      // Person credits have no server pagination. Bound metadata lookups and
      // withhold the unchecked tail whenever that media type has a cap.
      const checkedCredits = restrictedCredits.slice(
        0,
        maxMaturityCheckedCredits
      );
      const allowedCredits = await filterVideoItemsByMaturityPolicy(
        tmdb,
        maturityPolicy,
        checkedCredits.map((credit) => ({
          id: credit.id,
          mediaType: credit.media_type as MediaType.MOVIE | MediaType.TV,
        })),
        language
      );
      const allowedKeys = new Set(
        allowedCredits.map((credit) => `${credit.mediaType}:${credit.id}`)
      );
      const checkedKeys = new Set(
        checkedCredits.map((credit) => `${credit.media_type}:${credit.id}`)
      );

      return credits.filter((credit) => {
        if (
          credit.media_type !== MediaType.MOVIE &&
          credit.media_type !== MediaType.TV
        ) {
          return true;
        }
        const limit =
          credit.media_type === MediaType.MOVIE
            ? maturityPolicy.movie
            : maturityPolicy.tv;
        if (limit === null) return true;
        const key = `${credit.media_type}:${credit.id}`;
        return checkedKeys.has(key) && allowedKeys.has(key);
      });
    };
    const maturityFilteredCast = await filterCreditsByMaturity(rankedCast);
    const maturityFilteredCrew = await filterCreditsByMaturity(rankedCrew);

    const castMedia = await Media.getRelatedMedia(
      req.user,
      maturityFilteredCast
        .filter((result) => result.media_type)
        .map((result) => ({
          tmdbId: result.id,
          mediaType: result.media_type!,
        }))
    );

    const crewMedia = await Media.getRelatedMedia(
      req.user,
      maturityFilteredCrew
        .filter((result) => result.media_type)
        .map((result) => ({
          tmdbId: result.id,
          mediaType: result.media_type!,
        }))
    );

    return res.status(200).json({
      cast: maturityFilteredCast
        .map((result) =>
          mapCastCredits(
            result,
            castMedia.find(
              (med) =>
                med.tmdbId === result.id && med.mediaType === result.media_type
            )
          )
        )
        .filter((item) => !item.adult && item.character !== 'Thanks'),
      crew: maturityFilteredCrew
        .map((result) =>
          mapCrewCredits(
            result,
            crewMedia.find(
              (med) =>
                med.tmdbId === result.id && med.mediaType === result.media_type
            )
          )
        )
        .filter((item) => !item.adult && item.job !== 'Thanks'),
      id: combinedCredits.id,
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving combined credits', {
      label: 'API',
      errorMessage: e.message,
      personId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve combined credits.',
    });
  }
});

export default personRoutes;
