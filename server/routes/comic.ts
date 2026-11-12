import AnilistAPI from '@server/api/anilist';
import ComicVineAPI from '@server/api/comicvine';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { Watchlist } from '@server/entity/Watchlist';
import { findComicMediaByComicVineIds } from '@server/lib/comicMediaMatcher';
import {
  editionFromVolume,
  editionIds,
  getAllowedMangaMedia,
  getWorkForEdition,
  resolveMangaWork,
  withWorkMedia,
  type ComicWork,
} from '@server/lib/comicWorks';
import { extractImageCacheUrls } from '@server/lib/imageCacheUrls';
import { enqueueImageCacheWarm } from '@server/lib/imageCacheWarmer';
import { mangaEditionOf } from '@server/lib/mangaPublishers';
import { getMangaVolumeHint } from '@server/lib/mangaSearch';
import { hydrateMediaSummaryRelations } from '@server/lib/mediaSummaryHydration';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import {
  mapComicVineIssueResult,
  mapComicVineVolumeDetails,
  withMangaEdition,
} from '@server/models/Comic';
import { filterEntityResponse } from '@server/utils/entityResponse';
import { getHttpErrorDetails } from '@server/utils/httpError';
import { parsePositiveInt } from '@server/utils/pagination';
import { parsePositiveRouteId } from '@server/utils/routeId';
import { Router } from 'express';

const comicRoutes = Router();

const isMangaVolumeAllowed = async (comicVineId: number): Promise<boolean> => {
  const work = getWorkForEdition(comicVineId);
  const hint = getMangaVolumeHint(comicVineId);
  const anilistId = hint?.anilistId ?? work?.anilistId;
  if (!anilistId) return true;
  return !!(await getAllowedMangaMedia({
    anilistId,
    getManga: (id) => new AnilistAPI().getManga(id),
  }));
};

/**
 * A work with its editions, for the comic page's edition picker. "al-<id>" is
 * a manga from AniList: its ComicVine editions are looked up (at most two
 * ComicVine searches, cached for a week). A ComicVine id answers with the work
 * it was last grouped into, or that one volume.
 */
comicRoutes.get('/work/:key', async (req, res) => {
  const key = String(req.params.key ?? '');
  const anilist = /^al-(\d{1,9})$/.exec(key);
  const comicVineId = anilist ? undefined : parsePositiveRouteId(key);
  if (!anilist && comicVineId === undefined) {
    return res.status(404).json({ status: 404, message: 'Comic not found' });
  }
  const { comicVineApiKey } = getSettings().main;
  const comicVine = comicVineApiKey
    ? new ComicVineAPI(comicVineApiKey)
    : undefined;
  const anilistApi = new AnilistAPI();
  const getManga = (id: number) => anilistApi.getManga(id);
  try {
    let work: ComicWork | null | undefined;
    if (anilist) {
      work = await resolveMangaWork({
        anilistId: Number(anilist[1]),
        getManga,
        comicVine,
      });
      // a work grouped from a search has no description yet
      if (work && !work.description) {
        const media = await getManga(Number(anilist[1])).catch(() => null);
        if (media?.description)
          work = {
            ...work,
            description: media.description
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<[^>]+>/g, '')
              .trim(),
            genres: work.genres ?? media.genres ?? undefined,
          };
      }
    } else if (comicVineId !== undefined) {
      if (!(await isMangaVolumeAllowed(comicVineId))) {
        return res.status(404).json({ status: 404, message: 'Comic not found' });
      }
      work = getWorkForEdition(comicVineId);
      const hint = getMangaVolumeHint(comicVineId);
      if (!work && hint?.anilistId) {
        const found = await resolveMangaWork({
          anilistId: hint.anilistId,
          getManga,
          comicVine,
        }).catch(() => null);
        if (found?.editions.some((e) => e.id === String(comicVineId)))
          work = found;
      }
      if (!work && comicVine) {
        const volume = await comicVine.getVolume(comicVineId);
        if (volume) {
          const edition = { ...editionFromVolume(volume), recommended: true };
          const manga = !!hint || mangaEditionOf(volume.publisher?.name).manga;
          work = {
            id: edition.id,
            mediaType: 'comic',
            kind: manga ? 'manga' : 'comic',
            title: hint?.title || volume.name,
            anilistId: hint?.anilistId,
            posterPath: hint?.coverUrl || edition.posterPath,
            startYear: volume.start_year,
            publisher: volume.publisher?.name,
            issueCount: volume.count_of_issues,
            editions: [edition],
            editionsResolved: true,
            recommendedId: edition.id,
          };
        }
      }
    }
    if (!work) {
      return res.status(404).json({ status: 404, message: 'Comic not found' });
    }
    const media = await findComicMediaByComicVineIds(
      editionIds([work]),
      req.user
    );
    const answer = withWorkMedia(work, media);
    enqueueImageCacheWarm(extractImageCacheUrls(answer));
    return res.status(200).json(filterEntityResponse(answer, req.user));
  } catch (error) {
    logger.error('Failed to retrieve a comic work', {
      label: 'Comic',
      ...getHttpErrorDetails(error),
      key,
    });
    return res
      .status(503)
      .json({ status: 503, message: 'Unable to retrieve this comic.' });
  }
});

comicRoutes.get('/:id/issues', async (req, res) => {
  const comicVineId = parsePositiveRouteId(req.params.id);
  if (comicVineId === undefined) {
    return res.status(404).json({ status: 404, message: 'Comic not found' });
  }
  const { comicVineApiKey } = getSettings().main;
  if (!comicVineApiKey) {
    return res
      .status(503)
      .json({ status: 503, message: 'ComicVine is not configured.' });
  }
  const page = parsePositiveInt(req.query.page, 1, 500);
  const itemsPerPage = 20;
  try {
    if (!(await isMangaVolumeAllowed(comicVineId))) {
      return res.status(404).json({ status: 404, message: 'Comic not found' });
    }
    const response = await new ComicVineAPI(comicVineApiKey).getVolumeIssues({
      volumeId: comicVineId,
      page,
      limit: itemsPerPage,
    });
    const results = response.results.map(mapComicVineIssueResult);
    enqueueImageCacheWarm(extractImageCacheUrls(results));
    return res.status(200).json({
      page,
      totalPages: Math.ceil(response.number_of_total_results / itemsPerPage),
      totalResults: response.number_of_total_results,
      results,
    });
  } catch (error) {
    logger.error('Failed to retrieve comic issues', {
      label: 'Comic',
      ...getHttpErrorDetails(error),
      comicVineId,
    });
    return res
      .status(503)
      .json({ status: 503, message: 'Unable to retrieve comic issues.' });
  }
});

comicRoutes.get('/:id', async (req, res, next) => {
  const comicVineId = parsePositiveRouteId(req.params.id);
  if (comicVineId === undefined) {
    return res.status(404).json({ status: 404, message: 'Comic not found' });
  }

  const { comicVineApiKey } = getSettings().main;
  if (!comicVineApiKey) {
    return next({
      status: 503,
      message: 'ComicVine is not configured on this server.',
    });
  }

  try {
    if (!(await isMangaVolumeAllowed(comicVineId))) {
      return res.status(404).json({ status: 404, message: 'Comic not found' });
    }
    const comicVine = new ComicVineAPI(comicVineApiKey);
    const [volume, onUserWatchlist] = await Promise.all([
      comicVine.getVolume(comicVineId),
      req.user
        ? getRepository(Watchlist).exists({
            where: {
              externalId: String(comicVineId),
              mediaType: MediaType.COMIC,
              requestedBy: { id: req.user.id },
            },
          })
        : false,
    ]);
    if (!volume) {
      return res.status(404).json({ status: 404, message: 'Comic not found' });
    }

    const identifier = await getRepository(MediaIdentifier).findOne({
      where: {
        provider: MediaIdentifierProvider.COMICVINE,
        value: String(comicVineId),
      },
      relations: { media: true },
      relationLoadStrategy: 'query',
    });
    const media = identifier?.media
      ? (
          await hydrateMediaSummaryRelations([identifier.media], req.user, {
            includeIssues: true,
          })
        )[0]
      : undefined;

    const details = mapComicVineVolumeDetails(volume, media, onUserWatchlist);
    // A manga found through AniList keeps its English title and AniList
    // cover on the detail page too.
    const hint = getMangaVolumeHint(comicVineId);
    const edition = mangaEditionOf(volume.publisher?.name);
    const comicDetails = withMangaEdition(
      {
        ...details,
        title: hint?.title || details.title,
        posterPath: hint?.coverUrl || details.posterPath,
        anilistId: hint?.anilistId,
      },
      hint && !edition.manga ? { manga: true } : edition
    ) as typeof details;
    enqueueImageCacheWarm(extractImageCacheUrls(comicDetails));

    return res.status(200).json(filterEntityResponse(comicDetails, req.user));
  } catch (e) {
    logger.error('Failed to retrieve comic details', {
      label: 'Comic',
      ...getHttpErrorDetails(e),
      comicVineId,
    });
    return next({ status: 500, message: 'Unable to retrieve comic details.' });
  }
});

export default comicRoutes;
