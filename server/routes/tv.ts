import MdblistAPI from '@server/api/mdblist';
import { getMetadataProvider } from '@server/api/metadata';
import RottenTomatoes from '@server/api/rating/rottentomatoes';
import {
  hasMdblistRatingScores,
  parseMdblistRatingBatchIds,
  type RatingResponse,
} from '@server/api/ratings';
import SonarrAPI from '@server/api/servarr/sonarr';
import TheMovieDb from '@server/api/themoviedb';
import { ANIME_KEYWORD_ID } from '@server/api/themoviedb/constants';
import type { TmdbKeyword } from '@server/api/themoviedb/interfaces';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { Watchlist } from '@server/entity/Watchlist';
import { getSonarrEpisodeAvailability } from '@server/lib/episodeAvailability';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { enqueueImageCacheWarm } from '@server/lib/imageCacheWarmer';
import { upsertMediaSearchMetadata } from '@server/lib/mediaSearchMetadata';
import {
  getSettings,
  MetadataProviderType,
  type SonarrSettings,
} from '@server/lib/settings';
import { rankTmdbTvResults } from '@server/lib/tmdbRank';
import {
  filterVideoResultsByMaturityPolicy,
  getUserVideoMaturityPolicy,
  isVideoWithinMaturityLimit,
} from '@server/lib/videoMaturityPolicy';
import {
  getAggregatedTvMetadata,
  VideoMetadataNotFoundError,
} from '@server/lib/videoMetadataCatalog';
import logger from '@server/logger';
import { mapTvResult } from '@server/models/Search';
import { mapSeasonWithEpisodes, mapTvDetails } from '@server/models/Tv';
import { filterEntityResponse } from '@server/utils/entityResponse';
import {
  parseOptionalPositiveInt,
  parsePositiveInt,
} from '@server/utils/pagination';
import {
  parseNonNegativeRouteId,
  parsePositiveRouteId,
} from '@server/utils/routeId';
import { getRateLimitKey } from '@server/utils/security';
import {
  parseOptionalBoundedString,
  parseOptionalLanguage,
} from '@server/utils/validation';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import tvCollectionsRoutes from './tvCollections';
import tvSavedItemRoutes from './tvSavedItem';

const tvRoutes = Router();
tvRoutes.use(tvSavedItemRoutes);
tvRoutes.use(tvCollectionsRoutes);
const maxTmdbTvId = 1_000_000_000;
const maxTvSeasonNumber = 10_000;
const maxShuffleSeedLength = 128;

const mdblistRatingBatchRateLimit = rateLimit({
  windowMs: 60_000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.user?.id ? `user:${req.user.id}` : getRateLimitKey(req),
  skip: () =>
    process.env.NODE_ENV === 'test' || process.env.E2E_TESTS === 'true',
});

const parseTvRouteId = (id: unknown): number | undefined =>
  parsePositiveRouteId(id, maxTmdbTvId);

const parseSeasonRouteNumber = (seasonNumber: unknown): number | undefined =>
  parseNonNegativeRouteId(seasonNumber, maxTvSeasonNumber);

tvRoutes.post(
  '/ratings/mdblist/batch',
  mdblistRatingBatchRateLimit,
  async (req, res) => {
    const ids = parseMdblistRatingBatchIds(req.body?.ids);
    if (!ids) {
      return res.status(400).json({
        status: 400,
        message: 'Provide 1 to 200 valid TMDB series IDs.',
      });
    }

    try {
      const ratings = await MdblistAPI.getInstance().getBatchRatings(
        'tv',
        ids.map((tmdbId) => ({ tmdbId }))
      );
      return res
        .status(200)
        .json(
          Object.fromEntries(
            [...ratings].filter(([, rating]) => hasMdblistRatingScores(rating))
          )
        );
    } catch (e) {
      logger.debug(
        'Something went wrong retrieving MDBList series rating batch',
        {
          label: 'API',
          errorMessage: e instanceof Error ? e.message : String(e),
          itemCount: ids.length,
        }
      );
      return res.status(502).json({
        status: 502,
        message: 'MDBList ratings are temporarily unavailable.',
      });
    }
  }
);

const getSeriesCoverService = (
  media?: Media,
  is4k?: boolean
): { server: SonarrSettings; seriesId: number; is4k: boolean } | undefined => {
  if (!media) {
    return undefined;
  }

  const settings = getSettings();
  const candidates =
    is4k === true
      ? [
          {
            serviceId: media.serviceId4k,
            externalServiceId: media.externalServiceId4k,
            is4k: true,
          },
        ]
      : is4k === false
        ? [
            {
              serviceId: media.serviceId,
              externalServiceId: media.externalServiceId,
              is4k: false,
            },
          ]
        : [
            {
              serviceId: media.serviceId,
              externalServiceId: media.externalServiceId,
              is4k: false,
            },
            {
              serviceId: media.serviceId4k,
              externalServiceId: media.externalServiceId4k,
              is4k: true,
            },
          ];

  for (const candidate of candidates) {
    if (
      candidate.serviceId === null ||
      candidate.serviceId === undefined ||
      candidate.externalServiceId === null ||
      candidate.externalServiceId === undefined
    ) {
      continue;
    }

    const server = settings.sonarr.find(
      (sonarr) => sonarr.id === candidate.serviceId
    );

    if (server) {
      return {
        server,
        seriesId: candidate.externalServiceId,
        is4k: candidate.is4k,
      };
    }
  }

  return undefined;
};

tvRoutes.get('/:id', async (req, res, next) => {
  const tvId = parseTvRouteId(req.params.id);
  if (!tvId) {
    return next({ status: 404, message: 'Series not found.' });
  }
  const parsedLanguage = parseOptionalLanguage(req.query.language);
  if ('error' in parsedLanguage) {
    return res.status(400).json({ status: 400, message: parsedLanguage.error });
  }
  const language = parsedLanguage.value ?? req.locale;

  try {
    const { details: tmdbTv, provenance } = await getAggregatedTvMetadata(
      tvId,
      language
    );
    if (
      req.user &&
      !isVideoWithinMaturityLimit(
        tmdbTv,
        MediaType.TV,
        (await getUserVideoMaturityPolicy(req.user.id)).tv
      )
    ) {
      return next({ status: 404, message: 'Series not found.' });
    }
    const isAnime = tmdbTv.keywords.results.some(
      (keyword: TmdbKeyword) => keyword.id === ANIME_KEYWORD_ID
    );
    const metadataSettings = getSettings().metadataSettings;
    let tv = tmdbTv;
    if (
      (isAnime ? metadataSettings.anime : metadataSettings.tv) ===
      MetadataProviderType.TVDB
    ) {
      try {
        tv = await (
          await getMetadataProvider(isAnime ? 'anime' : 'tv')
        ).getTvShow({
          tvId,
          language,
        });
        tv = {
          ...tv,
          name: tv.name || tmdbTv.name,
          original_name: tv.original_name || tmdbTv.original_name,
          overview: tv.overview || tmdbTv.overview,
          first_air_date: tv.first_air_date || tmdbTv.first_air_date,
          episode_run_time:
            tv.episode_run_time?.length > 0
              ? tv.episode_run_time
              : tmdbTv.episode_run_time,
          genres: tv.genres?.length > 0 ? tv.genres : tmdbTv.genres,
          networks: tv.networks?.length > 0 ? tv.networks : tmdbTv.networks,
          production_companies:
            tv.production_companies?.length > 0
              ? tv.production_companies
              : tmdbTv.production_companies,
          credits: tv.credits?.crew?.length > 0 ? tv.credits : tmdbTv.credits,
          external_ids: {
            ...tmdbTv.external_ids,
            ...tv.external_ids,
          },
        };
      } catch (error) {
        logger.debug(
          'Configured TV metadata provider failed; using the cached aggregate',
          {
            label: 'Video Metadata',
            tvId,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          }
        );
      }
    }
    const media = await Media.getMedia(tv.id, MediaType.TV, req.user);

    const onUserWatchlist = req.user
      ? await getRepository(Watchlist).exists({
          where: {
            tmdbId: tvId,
            mediaType: MediaType.TV,
            requestedBy: { id: req.user.id },
          },
        })
      : false;

    const data = mapTvDetails(tv, media, onUserWatchlist);

    await upsertMediaSearchMetadata(media?.id, {
      title: data.name,
      overview: data.overview,
      posterPath: data.posterPath,
      alternateTitle: data.originalName,
      releaseDate: data.firstAirDate,
      genres: data.genres.map((genre) => genre.name).join(', '),
      runtime: data.episodeRunTime[0]
        ? `${data.episodeRunTime[0]} minutes`
        : undefined,
      creator: data.createdBy.map((creator) => creator.name).join(', '),
      writer: data.credits.crew
        .filter((credit) =>
          ['Writer', 'Screenplay', 'Story', 'Teleplay'].includes(credit.job)
        )
        .map((credit) => credit.name)
        .join(', '),
      studio: data.productionCompanies
        .map((company) => company.name)
        .join(', '),
      network: data.networks.map((network) => network.name).join(', '),
      format: 'Series',
      provider: provenance.sources
        .map((source) => source.source.toUpperCase())
        .join(' '),
      videoMetadataExpiresAt: new Date(provenance.expiresAt),
      externalIds: [
        data.id,
        data.externalIds.imdbId,
        data.externalIds.tvdbId,
        tmdbTv.external_ids.wikidata_id,
      ]
        .filter(Boolean)
        .join(' '),
    });

    data.metadataSources = provenance.sources;
    data.metadataProvenance = provenance.fields;
    data.supplementalMetadata = provenance.supplemental;
    if (provenance.supplemental.posterUrl) {
      enqueueImageCacheWarm([provenance.supplemental.posterUrl]);
    }
    data.metadataExpiresAt = provenance.expiresAt;

    return res.status(200).json(filterEntityResponse(data, req.user));
  } catch (e) {
    if (e instanceof VideoMetadataNotFoundError) {
      return next({ status: 404, message: 'Series not found.', cause: e });
    }
    logger.debug('Something went wrong retrieving series', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve series.',
      cause: e,
    });
  }
});

tvRoutes.get('/:id/cover', async (req, res) => {
  const tvId = parseTvRouteId(req.params.id);
  if (!tvId) {
    return res.status(404).send('Series cover not found');
  }

  const mediaId = parseOptionalPositiveInt(req.query.mediaId, 1_000_000_000);
  const is4k =
    req.query.is4k === 'true'
      ? true
      : req.query.is4k === 'false'
        ? false
        : undefined;

  if (!mediaId) {
    return res.status(404).send('Series cover not found');
  }

  const media = await getRepository(Media).findOne({
    where: { id: mediaId, mediaType: MediaType.TV, tmdbId: tvId },
  });
  const coverService = getSeriesCoverService(media ?? undefined, is4k);

  if (!coverService) {
    return res.status(404).send('Series cover not found');
  }

  try {
    const sonarrApi = new SonarrAPI({
      apiKey: coverService.server.apiKey,
      url: SonarrAPI.buildUrl(coverService.server, '/api/v3'),
    });
    const cover = await sonarrApi.getSeriesCover(coverService.seriesId);

    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Type', cover.contentType);
    res.setHeader('Content-Length', cover.imageBuffer.length);
    return res.status(200).send(cover.imageBuffer);
  } catch (e) {
    logger.warn('Failed to retrieve Sonarr cover fallback', {
      label: 'TV',
      tvId,
      mediaId,
      is4k: coverService.is4k,
      errorMessage: e instanceof Error ? e.message : 'Unknown error',
    });
    return res.status(404).send('Series cover not found');
  }
});

tvRoutes.get('/:id/season/:seasonNumber', async (req, res, next) => {
  const tvId = parseTvRouteId(req.params.id);
  const seasonNumber = parseSeasonRouteNumber(req.params.seasonNumber);
  if (!tvId || seasonNumber === undefined) {
    return next({ status: 404, message: 'Season not found.' });
  }
  const parsedLanguage = parseOptionalLanguage(req.query.language);
  if ('error' in parsedLanguage) {
    return res.status(400).json({ status: 400, message: parsedLanguage.error });
  }
  const language = parsedLanguage.value ?? req.locale;

  try {
    const tmdb = new TheMovieDb();
    const tmdbTv = await tmdb.getTvShow({
      tvId,
    });
    if (
      req.user &&
      !isVideoWithinMaturityLimit(
        tmdbTv,
        MediaType.TV,
        (await getUserVideoMaturityPolicy(req.user.id)).tv
      )
    ) {
      return next({ status: 404, message: 'Season not found.' });
    }
    const isAnime = tmdbTv.keywords.results.some(
      (keyword: TmdbKeyword) => keyword.id === ANIME_KEYWORD_ID
    );
    const metadataProvider = await getMetadataProvider(
      isAnime ? 'anime' : 'tv'
    );

    const season = await metadataProvider.getTvSeason({
      tvId,
      seasonNumber,
      language,
    });

    const mappedSeason = mapSeasonWithEpisodes(season);
    const settings = getSettings();
    const metadataSource = isAnime
      ? settings.metadataSettings.anime
      : settings.metadataSettings.tv;
    if (
      settings.main.trackEpisodeAvailability &&
      metadataSource === MetadataProviderType.TVDB
    ) {
      const availability = await getSonarrEpisodeAvailability(
        tvId,
        seasonNumber,
        getExternalRuntimeConfig().sonarr,
        settings.main.enable4k
      );
      mappedSeason.episodes = mappedSeason.episodes.map((episode) => {
        const sonarrAvailability = availability.get(episode.episodeNumber);
        return sonarrAvailability
          ? { ...episode, sonarrAvailability }
          : episode;
      });
    }

    return res.status(200).json(mappedSeason);
  } catch (e) {
    logger.debug('Something went wrong retrieving season', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
      seasonNumber: req.params.seasonNumber,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve season.',
    });
  }
});

tvRoutes.get('/:id/recommendations', async (req, res, next) => {
  const tmdb = new TheMovieDb();
  const tvId = parseTvRouteId(req.params.id);
  if (!tvId) {
    return next({ status: 404, message: 'Series not found.' });
  }
  const parsedLanguage = parseOptionalLanguage(req.query.language);
  if ('error' in parsedLanguage) {
    return res.status(400).json({ status: 400, message: parsedLanguage.error });
  }
  const parsedShuffleSeed = parseOptionalBoundedString(req.query.shuffleSeed, {
    fieldName: 'Shuffle seed',
    maxLength: maxShuffleSeedLength,
  });
  if ('error' in parsedShuffleSeed) {
    return res
      .status(400)
      .json({ status: 400, message: parsedShuffleSeed.error });
  }
  const language = parsedLanguage.value ?? req.locale;

  try {
    const results = await tmdb.getTvRecommendations({
      tvId,
      page: parsePositiveInt(req.query.page, 1, 500),
      language,
    });
    const maturityPolicy = req.user
      ? await getUserVideoMaturityPolicy(req.user.id)
      : { movie: null, tv: null };
    const maturityFilteredResults = await filterVideoResultsByMaturityPolicy(
      tmdb,
      maturityPolicy,
      MediaType.TV,
      results.results,
      language
    );
    const rankedResults = rankTmdbTvResults(
      maturityFilteredResults,
      parsedShuffleSeed.value
    );

    const media = await Media.getRelatedMedia(
      req.user,
      rankedResults.map((result) => ({
        tmdbId: result.id,
        mediaType: MediaType.TV,
      })),
      { includeActiveRequest: true }
    );

    return res.status(200).json({
      page: results.page,
      totalPages: results.total_pages,
      totalResults: results.total_results,
      results: rankedResults.map((result) =>
        mapTvResult(
          result,
          media.find(
            (req) => req.tmdbId === result.id && req.mediaType === MediaType.TV
          )
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving series recommendations', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve series recommendations.',
    });
  }
});

tvRoutes.get('/:id/similar', async (req, res, next) => {
  const tmdb = new TheMovieDb();
  const tvId = parseTvRouteId(req.params.id);
  if (!tvId) {
    return next({ status: 404, message: 'Series not found.' });
  }
  const parsedLanguage = parseOptionalLanguage(req.query.language);
  if ('error' in parsedLanguage) {
    return res.status(400).json({ status: 400, message: parsedLanguage.error });
  }
  const parsedShuffleSeed = parseOptionalBoundedString(req.query.shuffleSeed, {
    fieldName: 'Shuffle seed',
    maxLength: maxShuffleSeedLength,
  });
  if ('error' in parsedShuffleSeed) {
    return res
      .status(400)
      .json({ status: 400, message: parsedShuffleSeed.error });
  }
  const language = parsedLanguage.value ?? req.locale;

  try {
    const results = await tmdb.getTvSimilar({
      tvId,
      page: parsePositiveInt(req.query.page, 1, 500),
      language,
    });
    const maturityPolicy = req.user
      ? await getUserVideoMaturityPolicy(req.user.id)
      : { movie: null, tv: null };
    const maturityFilteredResults = await filterVideoResultsByMaturityPolicy(
      tmdb,
      maturityPolicy,
      MediaType.TV,
      results.results,
      language
    );
    const rankedResults = rankTmdbTvResults(
      maturityFilteredResults,
      parsedShuffleSeed.value
    );

    const media = await Media.getRelatedMedia(
      req.user,
      rankedResults.map((result) => ({
        tmdbId: result.id,
        mediaType: MediaType.TV,
      })),
      { includeActiveRequest: true }
    );

    return res.status(200).json({
      page: results.page,
      totalPages: results.total_pages,
      totalResults: results.total_results,
      results: rankedResults.map((result) =>
        mapTvResult(
          result,
          media.find(
            (req) => req.tmdbId === result.id && req.mediaType === MediaType.TV
          )
        )
      ),
    });
  } catch (e) {
    logger.debug('Something went wrong retrieving similar series', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve similar series.',
    });
  }
});

tvRoutes.get('/:id/ratings', async (req, res, next) => {
  const tmdb = new TheMovieDb();
  const rtapi = new RottenTomatoes();
  const tvId = parseTvRouteId(req.params.id);
  if (!tvId) {
    return next({ status: 404, message: 'Series not found.' });
  }

  try {
    const tv = await tmdb.getTvShow({
      tvId,
    });
    if (
      req.user &&
      !isVideoWithinMaturityLimit(
        tv,
        MediaType.TV,
        (await getUserVideoMaturityPolicy(req.user.id)).tv
      )
    ) {
      return next({ status: 404, message: 'Series not found.' });
    }

    const rtratings = await rtapi.getTVRatings(
      tv.name,
      tv.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : undefined
    );

    if (!rtratings) {
      return next({
        status: 404,
        message: 'Rotten Tomatoes ratings not found.',
      });
    }

    return res.status(200).json(rtratings);
  } catch (e) {
    logger.debug('Something went wrong retrieving series ratings', {
      label: 'API',
      errorMessage: e.message,
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve series ratings.',
    });
  }
});

tvRoutes.get('/:id/ratingscombined', async (req, res, next) => {
  const tmdb = new TheMovieDb();
  const rtapi = new RottenTomatoes();
  const mdblistApi = MdblistAPI.getInstance();
  const tvId = parseTvRouteId(req.params.id);
  if (!tvId) {
    return next({ status: 404, message: 'Series not found.' });
  }

  try {
    const tv = await tmdb.getTvShow({ tvId });
    if (
      req.user &&
      !isVideoWithinMaturityLimit(
        tv,
        MediaType.TV,
        (await getUserVideoMaturityPolicy(req.user.id)).tv
      )
    ) {
      return next({ status: 404, message: 'Series not found.' });
    }
    const [rtResult, mdblistResult] = await Promise.allSettled([
      rtapi.getTVRatings(
        tv.name,
        tv.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : undefined
      ),
      mdblistApi.getRatings('tv', tvId),
    ]);
    const rtratings = rtResult.status === 'fulfilled' ? rtResult.value : null;
    const mdblistRatings =
      mdblistResult.status === 'fulfilled' &&
      hasMdblistRatingScores(mdblistResult.value)
        ? mdblistResult.value
        : undefined;

    if (!rtratings && !mdblistRatings) {
      const providerFailed = [rtResult, mdblistResult].some(
        (result) => result.status === 'rejected'
      );
      return next({
        status: providerFailed ? 502 : 404,
        message: providerFailed
          ? 'Rating providers are temporarily unavailable.'
          : 'No ratings found.',
      });
    }

    const ratings: RatingResponse = {
      ...(rtratings ? { rt: rtratings } : {}),
      ...(mdblistRatings ? { mdblist: mdblistRatings } : {}),
    };
    return res.status(200).json(ratings);
  } catch (e) {
    logger.debug('Something went wrong retrieving combined series ratings', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
      tvId: req.params.id,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve series ratings.',
    });
  }
});

export default tvRoutes;
