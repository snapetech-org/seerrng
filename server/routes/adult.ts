import WhisparrAPI, {
  type WhisparrSceneLookup,
} from '@server/api/servarr/whisparr';
import { MediaRequestStatus, MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import MediaIdentifier, {
  MediaIdentifierProvider,
} from '@server/entity/MediaIdentifier';
import { MediaRequest } from '@server/entity/MediaRequest';
import { getExternalRuntimeConfig } from '@server/lib/externalRuntimeConfig';
import { runWithServarrServiceSnapshot } from '@server/lib/serviceAdmission';
import type { WhisparrSettings } from '@server/lib/settings';
import { normalizeStashDbId } from '@server/lib/stashdbIdentity';
import logger from '@server/logger';
import { mapWithConcurrency } from '@server/utils/concurrency';
import { getHttpErrorDetails } from '@server/utils/httpError';
import { parsePositiveInt } from '@server/utils/pagination';
import { Router } from 'express';
import { In, IsNull } from 'typeorm';

const adultRoutes = Router();
const RESULTS_PER_PAGE = 20;
const MAX_DISCOVERY_RESULTS = 1_000;
const MAX_RESULTS_PER_SERVICE = 200;
const MAX_SERVICE_ID = 1_000_000_000;

type AdultCatalogScene = WhisparrSceneLookup & { added?: string };

const findAdultIdentityRows = async (ids: string[]) => {
  if (ids.length === 0) return new Map<string, MediaIdentifier>();
  const rows = await getRepository(MediaIdentifier).find({
    where: {
      provider: MediaIdentifierProvider.STASHDB,
      value: In(ids),
    },
    relations: { media: { serviceStatuses: true } },
    relationLoadStrategy: 'query',
  });
  return new Map(rows.map((row) => [row.value, row]));
};

const findActiveAdultRequest = (
  mediaId: number,
  userId: number,
  service: Pick<WhisparrSettings, 'id' | 'isDefault'>
) => {
  const criteria = {
    media: { id: mediaId },
    requestedBy: { id: userId },
    status: In([MediaRequestStatus.PENDING, MediaRequestStatus.APPROVED]),
  };
  return getRepository(MediaRequest).findOne({
    where: service.isDefault
      ? [
          { ...criteria, serverId: service.id },
          { ...criteria, serverId: IsNull() },
        ]
      : { ...criteria, serverId: service.id },
    select: { id: true, status: true },
  });
};

const orderServices = (services: WhisparrSettings[]) =>
  [...services].sort(
    (left, right) => Number(right.isDefault) - Number(left.isDefault)
  );

const parseRequestedServiceId = (value: unknown): number | undefined | null => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id >= 0 && id <= MAX_SERVICE_ID ? id : null;
};

const getCoverPath = (scene: WhisparrSceneLookup, serverId: number) => {
  // Whisparr's scene inventory only reports coverType "screenshot" for its
  // image list, but the real poster is resolvable via the per-scene lookup
  // the /cover endpoint performs. Any image URL means a cover may exist, so
  // always offer the path and let the cover endpoint (and the client's
  // fallback) handle scenes that have no poster.
  const hasImage = Boolean(
    scene.posterUrl ||
    scene.images.some((image) => Boolean(image.url || image.remoteUrl))
  );
  if (!hasImage) return undefined;
  // Keep the source server explicit; zero is a valid Whisparr service ID.
  const query = `?serverId=${serverId}`;
  return `/api/v1/adult/${scene.foreignId}/cover${query}`;
};

const toResult = (
  scene: AdultCatalogScene,
  identifier: MediaIdentifier | undefined,
  request: { id: number; status: MediaRequestStatus } | undefined,
  service: Pick<WhisparrSettings, 'id' | 'name' | 'isDefault'>
) => {
  const sceneStatus = scene.hasFile ? MediaStatus.AVAILABLE : undefined;
  const serviceStatus = identifier?.media?.serviceStatuses?.find(
    (status) =>
      status.serviceType === 'whisparr' &&
      status.format === 'adult' &&
      status.serverId === service.id
  );
  const status =
    sceneStatus ??
    serviceStatus?.status ??
    (identifier?.media?.serviceId === service.id
      ? (identifier.media.status ?? MediaStatus.UNKNOWN)
      : MediaStatus.UNKNOWN);

  return {
    id: scene.foreignId,
    provider: 'whisparr' as const,
    mediaType: 'adult' as const,
    title: scene.title,
    year: scene.year,
    overview: scene.overview,
    studio: scene.studio,
    performers: scene.performerNames,
    posterPath: getCoverPath(scene, service.id),
    serviceId: service.id,
    serviceName: service.name,
    mediaInfo: identifier?.media
      ? {
          id: identifier.media.id,
          status,
          serviceId: service.id,
          requestStatus: request?.status,
          requestId: request?.id,
        }
      : undefined,
  };
};

adultRoutes.get('/search', async (req, res) => {
  const query =
    typeof req.query.query === 'string' ? req.query.query.trim() : '';
  if (query.length > 200) {
    return res.status(400).json({ status: 400, message: 'Query is too long.' });
  }
  const page = parsePositiveInt(req.query.page, 1, 500);
  const requestedServiceId = parseRequestedServiceId(req.query.serverId);
  if (requestedServiceId === null) {
    return res
      .status(400)
      .json({ status: 400, message: 'Whisparr server ID is invalid.' });
  }
  const configuredServices = orderServices(getExternalRuntimeConfig().whisparr);
  const selectedService =
    requestedServiceId === undefined
      ? undefined
      : configuredServices.find(({ id }) => id === requestedServiceId);
  if (requestedServiceId !== undefined && !selectedService) {
    return res
      .status(404)
      .json({ status: 404, message: 'Whisparr server was not found.' });
  }
  const services = selectedService ? [selectedService] : configuredServices;
  let failedServices = 0;

  try {
    const serviceResults = await mapWithConcurrency(
      services,
      3,
      async (service) => {
        try {
          const scenes = await runWithServarrServiceSnapshot(
            'whisparr',
            service,
            async (current) => {
              const api = new WhisparrAPI({
                apiKey: current.apiKey,
                url: WhisparrAPI.buildUrl(current, '/api/v3'),
              });
              return query ? api.searchScenes(query) : api.getScenes();
            }
          );
          const catalogScenes = scenes as AdultCatalogScene[];
          if (!query) {
            catalogScenes.sort((left, right) => {
              const leftAdded = Date.parse(left.added ?? '') || 0;
              const rightAdded = Date.parse(right.added ?? '') || 0;
              return rightAdded - leftAdded;
            });
          }
          return {
            service,
            scenes: catalogScenes.slice(0, MAX_RESULTS_PER_SERVICE),
            truncated: catalogScenes.length > MAX_RESULTS_PER_SERVICE,
          };
        } catch (error) {
          failedServices += 1;
          logger.warn('Adult scene catalog failed for a Whisparr service', {
            label: 'Adult',
            serviceId: service.id,
            ...getHttpErrorDetails(error),
          });
          return {
            service,
            scenes: [] as AdultCatalogScene[],
            truncated: false,
          };
        }
      }
    );

    if (services.length > 0 && failedServices === services.length) {
      return res.status(503).json({
        status: 503,
        message: query
          ? 'Whisparr scene search is unavailable right now.'
          : 'Whisparr library browsing is unavailable right now.',
      });
    }

    const allResults = serviceResults.flatMap(({ service, scenes }) =>
      scenes.map((scene) => ({ service, scene }))
    );
    if (!query) {
      allResults.sort((left, right) => {
        const leftAdded = Date.parse(left.scene.added ?? '') || 0;
        const rightAdded = Date.parse(right.scene.added ?? '') || 0;
        return rightAdded - leftAdded;
      });
    }

    const deduplicated = new Map<
      string,
      { service: WhisparrSettings; scene: AdultCatalogScene }
    >();
    for (const item of allResults) {
      if (!deduplicated.has(item.scene.foreignId)) {
        deduplicated.set(item.scene.foreignId, item);
      }
    }
    const allUniqueResults = [...deduplicated.values()];
    const wasResultLimitReached =
      allUniqueResults.length > MAX_DISCOVERY_RESULTS ||
      serviceResults.some(({ truncated }) => truncated);
    const uniqueResults = allUniqueResults.slice(0, MAX_DISCOVERY_RESULTS);
    const start = (page - 1) * RESULTS_PER_PAGE;
    const pageResults = uniqueResults.slice(start, start + RESULTS_PER_PAGE);
    const identifiers = await findAdultIdentityRows(
      pageResults.map(({ scene }) => scene.foreignId)
    );
    const results = await Promise.all(
      pageResults.map(async ({ service, scene }) => {
        const identifier = identifiers.get(scene.foreignId);
        const activeRequest = identifier?.media
          ? await findActiveAdultRequest(
              identifier.media.id,
              req.user!.id,
              service
            )
          : undefined;
        return toResult(scene, identifier, activeRequest ?? undefined, service);
      })
    );

    return res.status(200).json({
      page,
      totalPages: Math.ceil(uniqueResults.length / RESULTS_PER_PAGE),
      totalResults: uniqueResults.length,
      results,
      partial: failedServices > 0 || wasResultLimitReached,
    });
  } catch (error) {
    logger.error('Adult scene search failed', {
      label: 'Adult',
      ...getHttpErrorDetails(error),
    });
    return res.status(503).json({
      status: 503,
      message: 'Whisparr scene catalog is unavailable right now.',
    });
  }
});

adultRoutes.get('/:id/cover', async (req, res) => {
  const stashDbId = normalizeStashDbId(req.params.id);
  if (!stashDbId) {
    return res.status(404).send('Adult scene cover not found.');
  }

  const services = getExternalRuntimeConfig().whisparr;
  const requestedServiceId = parseRequestedServiceId(req.query.serverId);
  if (requestedServiceId === null) {
    return res.status(400).send('Whisparr server ID is invalid.');
  }
  const service =
    (requestedServiceId === undefined
      ? services.find(({ isDefault }) => isDefault)
      : services.find(({ id }) => id === requestedServiceId)) ??
    (requestedServiceId === undefined ? undefined : null);
  if (!service) {
    return res.status(requestedServiceId === undefined ? 503 : 404).send();
  }

  try {
    const cover = await runWithServarrServiceSnapshot(
      'whisparr',
      service,
      (current) =>
        new WhisparrAPI({
          apiKey: current.apiKey,
          url: WhisparrAPI.buildUrl(current, '/api/v3'),
        }).getSceneCover(stashDbId)
    );
    res.set('Cache-Control', 'private, no-store').type(cover.contentType);
    return res.status(200).send(cover.imageBuffer);
  } catch (error) {
    logger.warn('Adult scene cover could not be loaded', {
      label: 'Adult',
      serviceId: service.id,
      ...getHttpErrorDetails(error),
    });
    return res.status(404).send('Adult scene cover not found.');
  }
});

adultRoutes.get('/:id', async (req, res) => {
  const stashDbId = normalizeStashDbId(req.params.id);
  if (!stashDbId) {
    return res
      .status(404)
      .json({ status: 404, message: 'Adult scene not found.' });
  }

  const services = orderServices(getExternalRuntimeConfig().whisparr);
  const requestedServiceId = parseRequestedServiceId(req.query.serverId);
  if (requestedServiceId === null) {
    return res
      .status(400)
      .json({ status: 400, message: 'Whisparr server ID is invalid.' });
  }
  const selectedService =
    requestedServiceId === undefined
      ? undefined
      : services.find(({ id }) => id === requestedServiceId);
  if (requestedServiceId !== undefined && !selectedService) {
    return res
      .status(404)
      .json({ status: 404, message: 'Whisparr server was not found.' });
  }
  const searchServices = selectedService ? [selectedService] : services;
  let failedServices = 0;

  try {
    const results = await mapWithConcurrency(
      searchServices,
      3,
      async (service) => {
        try {
          const scene = await runWithServarrServiceSnapshot(
            'whisparr',
            service,
            async (current) =>
              new WhisparrAPI({
                apiKey: current.apiKey,
                url: WhisparrAPI.buildUrl(current, '/api/v3'),
              }).getSceneByStashDbId(stashDbId)
          );
          return { service, scene };
        } catch {
          failedServices += 1;
          return { service, scene: undefined };
        }
      }
    );
    if (searchServices.length > 0 && failedServices === searchServices.length) {
      return res.status(503).json({
        status: 503,
        message: 'Whisparr scene details are unavailable right now.',
      });
    }
    const found = results.find((result) => result.scene);
    if (!found?.scene) {
      return res
        .status(404)
        .json({ status: 404, message: 'Adult scene not found.' });
    }

    const identifiers = await findAdultIdentityRows([stashDbId]);
    const identifier = identifiers.get(stashDbId);
    const activeRequest = identifier?.media
      ? await findActiveAdultRequest(
          identifier.media.id,
          req.user!.id,
          found.service
        )
      : undefined;
    return res
      .status(200)
      .json(
        toResult(
          found.scene,
          identifier,
          activeRequest ?? undefined,
          found.service
        )
      );
  } catch (error) {
    logger.error('Adult scene details could not be loaded', {
      label: 'Adult',
      ...getHttpErrorDetails(error),
    });
    return res.status(503).json({
      status: 503,
      message: 'Whisparr scene details are unavailable right now.',
    });
  }
});

export default adultRoutes;
