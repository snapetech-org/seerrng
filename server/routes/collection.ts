import TheMovieDb from '@server/api/themoviedb';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MovieCollectionQueue } from '@server/entity/MovieCollectionQueue';
import { checkCollection } from '@server/lib/collectionSync';
import movieCollectionQueues, {
  MovieCollectionQueueError,
  queueView,
} from '@server/lib/movieCollectionQueue';
import { Permission } from '@server/lib/permissions';
import { UserMutationActorUnauthorizedError } from '@server/lib/userSecurityMutation';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { mapCollection } from '@server/models/Collection';
import { trackBackgroundTask } from '@server/utils/backgroundTasks';
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

const queueQuality = (value: unknown): boolean | undefined =>
  value === undefined || value === false || value === 'false'
    ? false
    : value === true || value === 'true'
      ? true
      : undefined;
collectionRoutes.get(
  '/:id/queue',
  isAuthenticated(),
  async (req, res, next) => {
    const collectionId = parseCollectionRouteId(req.params.id);
    const is4k = queueQuality(req.query.is4k);
    if (!collectionId || is4k === undefined)
      return next({ status: 400, message: 'Invalid collection or quality.' });
    try {
      const queue = await getRepository(MovieCollectionQueue).findOne({
        where: { user: { id: req.user!.id }, collectionId, is4k },
      });
      return res.json({ queue: queue ? queueView(queue) : null });
    } catch (error) {
      return next(error);
    }
  }
);
collectionRoutes.post(
  '/:id/queue',
  isAuthenticated(),
  async (req, res, next) => {
    const collectionId = parseCollectionRouteId(req.params.id);
    const body = req.body;
    if (
      !collectionId ||
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !['bufferSize', 'is4k'].includes(key)) ||
      typeof body.is4k !== 'boolean' ||
      ![1, 2].includes(body.bufferSize)
    )
      return next({
        status: 400,
        message:
          'Choose a collection, quality and buffer of one or two movies.',
      });
    try {
      const queue = await movieCollectionQueues.start(
        req.user!,
        collectionId,
        body.is4k,
        body.bufferSize,
        req.session?.userId === req.user!.id
          ? (req.session.credentialVersion ?? 0)
          : undefined
      );
      trackBackgroundTask('start movie collection queue', () =>
        movieCollectionQueues.reconcile(queue.id)
      );
      return res.status(202).json({ queue: queueView(queue) });
    } catch (error) {
      if (error instanceof MovieCollectionQueueError)
        return next({ status: error.status, message: error.message });
      if (error instanceof UserMutationActorUnauthorizedError)
        return next({
          status: 403,
          message: 'Your account authority changed. Sign in again.',
        });
      return next({
        status: 503,
        message: 'Could not start the collection queue. Try again later.',
      });
    }
  }
);
collectionRoutes.delete(
  '/:id/queue',
  isAuthenticated(),
  async (req, res, next) => {
    const collectionId = parseCollectionRouteId(req.params.id);
    const is4k = queueQuality(req.query.is4k);
    if (!collectionId || is4k === undefined)
      return next({ status: 400, message: 'Invalid collection or quality.' });
    try {
      await movieCollectionQueues.stop(
        req.user!.id,
        collectionId,
        is4k,
        req.session?.userId === req.user!.id
          ? (req.session.credentialVersion ?? 0)
          : undefined
      );
      return res.status(204).send();
    } catch (error) {
      if (error instanceof UserMutationActorUnauthorizedError)
        return next({
          status: 403,
          message: 'Your account authority changed. Sign in again.',
        });
      return next(error);
    }
  }
);

export default collectionRoutes;
