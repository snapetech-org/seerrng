import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import Media from '@server/entity/Media';
import { checkCollection } from '@server/lib/collectionSync';
import { Permission } from '@server/lib/permissions';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { mapCollection } from '@server/models/Collection';
import { parsePositiveRouteId } from '@server/utils/routeId';
import { parseOptionalLanguage } from '@server/utils/validation';
import { Router } from 'express';

const collectionRoutes = Router();
const maxTmdbId = 1_000_000_000;

const parseCollectionRouteId = (id: unknown): number | undefined =>
  parsePositiveRouteId(id, maxTmdbId);

collectionRoutes.post<{ id: string }>(
  '/:id/availability',
  async (req, res, next) => {
    const collectionId = parseCollectionRouteId(req.params.id);
    if (!collectionId)
      return next({ status: 404, message: 'Collection not found.' });
    try {
      const status = await checkCollection(collectionId);
      const collection = await new TheMovieDb().getCollection({
        collectionId,
        language: req.metadataLocale,
      });
      const media = await Media.getRelatedMedia(
        req.user,
        collection.parts.map((part) => ({
          tmdbId: part.id,
          mediaType: MediaType.MOVIE,
        }))
      );
      return res.json({
        collection: mapCollection(collection, media),
        sync: {
          ...status,
          destinations: req.user?.hasPermission(Permission.ADMIN)
            ? status.destinations
            : [],
        },
      });
    } catch {
      return next({
        status: 503,
        message:
          'Cannot check the media server right now. Retrying automatically.',
      });
    }
  }
);

collectionRoutes.post<{ id: string }>(
  '/:id/server',
  isAuthenticated(Permission.ADMIN),
  async (req, res, next) => {
    const collectionId = parseCollectionRouteId(req.params.id);
    if (!collectionId)
      return next({ status: 404, message: 'Collection not found.' });
    const libraries: unknown = req.body?.libraryIds;
    const selectedIds: unknown = req.body?.selectedIds;
    if (
      selectedIds !== undefined &&
      (!Array.isArray(selectedIds) ||
        !selectedIds.length ||
        selectedIds.length > 500 ||
        selectedIds.some(
          (id) => typeof id !== 'string' || !/^[1-9]\d{0,9}$/.test(id)
        ))
    )
      return next({ status: 400, message: 'Select valid collection items.' });
    if (
      !Array.isArray(libraries) ||
      !libraries.length ||
      libraries.length > 50 ||
      libraries.some(
        (id) => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,128}$/.test(id)
      )
    ) {
      return next({
        status: 400,
        message: 'Select the destination libraries.',
      });
    }
    try {
      return res.json(
        await checkCollection(
          collectionId,
          [...new Set(libraries)],
          undefined,
          { selectedIds: selectedIds as string[] | undefined }
        )
      );
    } catch {
      return next({
        status: 503,
        message:
          'Cannot verify the selected media-server collections. Try again later.',
      });
    }
  }
);

collectionRoutes.delete<{ id: string }>(
  '/:id/server',
  isAuthenticated(Permission.ADMIN),
  async (req, res, next) => {
    const collectionId = parseCollectionRouteId(req.params.id);
    if (!collectionId)
      return next({ status: 404, message: 'Collection not found.' });
    const destinations: unknown = req.body?.destinations;
    if (
      !Array.isArray(destinations) ||
      !destinations.length ||
      destinations.length > 50 ||
      destinations.some(
        (entry) =>
          !entry ||
          typeof entry.libraryId !== 'string' ||
          !/^[a-zA-Z0-9-]{1,128}$/.test(entry.libraryId) ||
          typeof entry.removalToken !== 'string' ||
          !/^[a-f0-9]{64}$/.test(entry.removalToken)
      ) ||
      new Set(destinations.map((entry) => entry.libraryId)).size !==
        destinations.length
    ) {
      return next({
        status: 400,
        message: 'Confirm the collections to remove.',
      });
    }
    try {
      return res.json(
        await checkCollection(collectionId, undefined, destinations)
      );
    } catch {
      return next({
        status: 503,
        message:
          'Cannot verify these collections for removal. Check again before retrying.',
      });
    }
  }
);

collectionRoutes.get<{ id: string }>('/:id', async (req, res, next) => {
  const tmdb = new TheMovieDb();
  const collectionId = parseCollectionRouteId(req.params.id);
  if (!collectionId) {
    return next({ status: 404, message: 'Collection not found.' });
  }
  const parsedLanguage = parseOptionalLanguage(req.query.language);
  if ('error' in parsedLanguage) {
    return res.status(400).json({ status: 400, message: parsedLanguage.error });
  }
  const language = parsedLanguage.value ?? req.metadataLocale;

  try {
    const collection = await tmdb.getCollection({
      collectionId,
      language,
    });

    const media = await Media.getRelatedMedia(
      req.user,
      collection.parts.map((part) => ({
        tmdbId: part.id,
        mediaType: MediaType.MOVIE,
      })),
      { includeActiveRequest: true }
    );

    return res.status(200).json(mapCollection(collection, media));
  } catch (e) {
    logger.debug('Something went wrong retrieving collection', {
      label: 'API',
      errorMessage: e.message,
      collectionId,
    });
    return next({
      status: 500,
      message: 'Unable to retrieve collection.',
    });
  }
});

export default collectionRoutes;
