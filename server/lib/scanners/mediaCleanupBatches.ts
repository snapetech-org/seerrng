import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type { FindOptionsRelations, FindOptionsWhere } from 'typeorm';
import { And, LessThanOrEqual, MoreThan } from 'typeorm';

export const MEDIA_CLEANUP_BATCH_SIZE = 250;

export type MediaCleanupBatchLoader = (
  afterId: number,
  maxId: number,
  limit: number
) => Promise<Media[]>;

type MediaCleanupBatchOptions = {
  relations?: FindOptionsRelations<Media>;
  loadMaxId?: () => Promise<number | undefined>;
  loadBatch?: MediaCleanupBatchLoader;
};

export const forEachMediaCleanupBatch = async (
  where: FindOptionsWhere<Media> | FindOptionsWhere<Media>[],
  callback: (media: Media) => Promise<void>,
  options: MediaCleanupBatchOptions = {}
): Promise<void> => {
  const mediaRepository = getRepository(Media);
  const maxId = options.loadMaxId
    ? await options.loadMaxId()
    : (
        await mediaRepository.findOne({
          where,
          select: { id: true },
          order: { id: 'DESC' },
        })
      )?.id;
  if (!Number.isSafeInteger(maxId) || !maxId || maxId <= 0) {
    return;
  }

  const loadBatch: MediaCleanupBatchLoader =
    options.loadBatch ??
    ((afterId, upperId, limit) => {
      const idWindow = And(MoreThan(afterId), LessThanOrEqual(upperId));
      const whereWithIdWindow = (candidate: FindOptionsWhere<Media>) => ({
        ...candidate,
        id: idWindow,
      });

      return mediaRepository.find({
        where: Array.isArray(where)
          ? where.map(whereWithIdWindow)
          : whereWithIdWindow(where),
        relations: options.relations,
        order: { id: 'ASC' },
        take: limit,
      });
    });
  let afterId = 0;

  while (afterId < maxId) {
    const mediaItems = (
      await loadBatch(afterId, maxId, MEDIA_CLEANUP_BATCH_SIZE)
    )
      .filter(
        (media) =>
          Number.isSafeInteger(media.id) &&
          media.id > afterId &&
          media.id <= maxId
      )
      .sort((left, right) => left.id - right.id)
      .slice(0, MEDIA_CLEANUP_BATCH_SIZE);
    if (!mediaItems.length) {
      return;
    }

    for (const media of mediaItems) {
      await callback(media);
    }
    afterId = mediaItems[mediaItems.length - 1].id;

    if (mediaItems.length < MEDIA_CLEANUP_BATCH_SIZE) {
      return;
    }
  }
};
