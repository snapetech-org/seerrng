import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import { MediaRequest } from '@server/entity/MediaRequest';
import type { User } from '@server/entity/User';
import { hydrateMediaSummaryRelations } from '@server/lib/mediaSummaryHydration';
import { In } from 'typeorm';

const RELATION_HYDRATION_BATCH_SIZE = 500;

export const hydrateMediaRequestRelations = async (
  requests: MediaRequest[],
  options: { includeMediaIdentifiers?: boolean; viewer?: User } = {}
): Promise<MediaRequest[]> => {
  const ids = [...new Set(requests.map((request) => request.id))].filter(
    (id) => Number.isSafeInteger(id) && id > 0
  );
  if (!ids.length) {
    return requests;
  }

  const requestRepository = getRepository(MediaRequest);
  const hydrated: MediaRequest[] = [];
  for (
    let offset = 0;
    offset < ids.length;
    offset += RELATION_HYDRATION_BATCH_SIZE
  ) {
    const batch = ids.slice(offset, offset + RELATION_HYDRATION_BATCH_SIZE);
    hydrated.push(
      ...(await requestRepository.find({
        where: { id: In(batch) },
        relations: {
          media: true,
          seasons: true,
          modifiedBy: true,
          requestedBy: true,
        },
        relationLoadStrategy: 'query',
        loadEagerRelations: false,
      }))
    );
  }

  // Request seasons and media seasons are independent one-to-many relations.
  // Load the media collections in their own bounded queries so a request with
  // many selected seasons cannot multiply rows across both collections.
  const mediaIds = [...new Set(hydrated.map((request) => request.media.id))];
  const mediaRows: Media[] = [];
  for (
    let offset = 0;
    offset < mediaIds.length;
    offset += RELATION_HYDRATION_BATCH_SIZE
  ) {
    const batch = mediaIds.slice(
      offset,
      offset + RELATION_HYDRATION_BATCH_SIZE
    );
    mediaRows.push(
      ...(await getRepository(Media).find({
        where: { id: In(batch) },
        relations: {
          seasons: true,
          ...(options.includeMediaIdentifiers ? { identifiers: true } : {}),
        },
        relationLoadStrategy: 'query',
        loadEagerRelations: false,
      }))
    );
  }

  const mediaById = new Map(mediaRows.map((media) => [media.id, media]));
  if (options.viewer) {
    await hydrateMediaSummaryRelations(mediaRows, options.viewer);
  }
  for (const request of hydrated) {
    const media = mediaById.get(request.media.id);
    if (!media) {
      continue;
    }
    request.media = media;
  }

  const hydratedById = new Map(
    hydrated.map((request) => [request.id, request])
  );

  return requests.map((request) => hydratedById.get(request.id) ?? request);
};
